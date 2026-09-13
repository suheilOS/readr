import { useCallback, useEffect, useRef } from "react";
import { ENRICHMENT_RETRY_DELAYS_MS } from "../shared/capture";
import type { Item } from "../shared/item";
import { fetchItemMetadata, ItemApiError } from "./itemApi";

const RAPID_POLL_INTERVAL_MS = 1_500;
const RAPID_POLL_COUNT = 12;
const FINAL_POLL_INTERVAL_MS = 60_000;
const MAX_POLLS = RAPID_POLL_COUNT + ENRICHMENT_RETRY_DELAYS_MS.length + 1;

type PollState = {
  count: number;
  nextPollAt: number;
};

type MetadataReconciler = (item: Pick<Item, "id" | "title" | "type">) => void;

export type EnrichmentRefresh = {
  watch: (itemId: string) => void;
};

export function useEnrichmentRefresh(
  items: readonly Item[],
  reconcileItemMetadata: MetadataReconciler,
): EnrichmentRefresh {
  const reconcileRef = useRef(reconcileItemMetadata);
  const pendingPollsRef = useRef(new Map<string, PollState>());
  const requestsRef = useRef(new Map<string, AbortController>());
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  reconcileRef.current = reconcileItemMetadata;

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback((itemId: string): void => {
    pendingPollsRef.current.delete(itemId);
    requestsRef.current.get(itemId)?.abort();
    requestsRef.current.delete(itemId);
    if (pendingPollsRef.current.size === 0) clearTimer();
  }, [clearTimer]);

  const pollItem = useCallback(async (itemId: string): Promise<void> => {
    const poll = pendingPollsRef.current.get(itemId);
    if (poll === undefined || !isDocumentVisible()) return;
    if (poll.nextPollAt > Date.now()) return;
    if (poll.count >= MAX_POLLS) {
      stop(itemId);
      return;
    }

    poll.count += 1;
    const controller = new AbortController();
    requestsRef.current.set(itemId, controller);
    let shouldContinue = false;
    try {
      const result = await fetchItemMetadata(itemId, controller.signal);
      reconcileRef.current(result.item);
      const status = result.metadata?.enrichment.kind;
      if (status === undefined || status === "ready" || status === "failed") {
        stop(itemId);
      } else {
        shouldContinue = true;
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      if (error instanceof ItemApiError && error.status === 404) {
        stop(itemId);
      } else {
        shouldContinue = true;
      }
    } finally {
      if (requestsRef.current.get(itemId) === controller) {
        requestsRef.current.delete(itemId);
      }
    }

    const currentPoll = pendingPollsRef.current.get(itemId);
    if (!shouldContinue || currentPoll === undefined) return;
    if (currentPoll.count >= MAX_POLLS) {
      stop(itemId);
    } else {
      currentPoll.nextPollAt = Date.now() + nextPollDelay(currentPoll.count);
    }
  }, [stop]);

  const pollPending = useCallback(async (): Promise<void> => {
    if (!mountedRef.current || runningRef.current || !isDocumentVisible()) return;

    clearTimer();

    runningRef.current = true;
    try {
      await Promise.all([...pendingPollsRef.current.keys()].map((itemId) => pollItem(itemId)));
    } finally {
      runningRef.current = false;
      if (mountedRef.current && pendingPollsRef.current.size > 0 && isDocumentVisible()) {
        const now = Date.now();
        const nextPollAt = Math.min(...[...pendingPollsRef.current.values()]
          .map((poll) => poll.nextPollAt));
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          void pollPending();
        }, Math.max(0, nextPollAt - now));
      }
    }
  }, [clearTimer, pollItem]);

  const watch = useCallback((itemId: string): void => {
    if (!mountedRef.current || pendingPollsRef.current.has(itemId)) return;

    pendingPollsRef.current.set(itemId, { count: 0, nextPollAt: 0 });
    clearTimer();
    void pollPending();
  }, [clearTimer, pollPending]);

  useEffect(() => {
    for (const itemId of pendingPollsRef.current.keys()) {
      if (!items.some((item) => item.id === itemId)) stop(itemId);
    }
  }, [items, stop]);

  useEffect(() => {
    function handleVisibilityChange(): void {
      if (!isDocumentVisible()) {
        clearTimer();
        return;
      }

      for (const poll of pendingPollsRef.current.values()) poll.nextPollAt = 0;
      void pollPending();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [clearTimer, pollPending]);

  useEffect(() => {
    mountedRef.current = true;
    const pendingPolls = pendingPollsRef.current;
    const requests = requestsRef.current;
    return () => {
      mountedRef.current = false;
      clearTimer();
      for (const controller of requests.values()) controller.abort();
      pendingPolls.clear();
      requests.clear();
    };
  }, [clearTimer]);

  return { watch };
}

function nextPollDelay(pollCount: number): number {
  if (pollCount < RAPID_POLL_COUNT) return RAPID_POLL_INTERVAL_MS;
  return ENRICHMENT_RETRY_DELAYS_MS[pollCount - RAPID_POLL_COUNT] ?? FINAL_POLL_INTERVAL_MS;
}

function isDocumentVisible(): boolean {
  return document.visibilityState === "visible";
}
