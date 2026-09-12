import { useCallback, useEffect, useRef } from "react";
import type { Item } from "../shared/item";
import { fetchItemMetadata, ItemApiError } from "./itemApi";

const POLL_INTERVAL_MS = 1_500;
const MAX_POLLS = 12;

type MetadataReconciler = (item: Pick<Item, "id" | "title" | "type">) => void;

export type EnrichmentRefresh = {
  watch: (itemId: string) => void;
};

export function useEnrichmentRefresh(
  items: readonly Item[],
  reconcileItemMetadata: MetadataReconciler,
): EnrichmentRefresh {
  const reconcileRef = useRef(reconcileItemMetadata);
  const pendingIdsRef = useRef(new Set<string>());
  const attemptsRef = useRef(new Map<string, number>());
  const requestsRef = useRef(new Map<string, AbortController>());
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  reconcileRef.current = reconcileItemMetadata;

  const stop = useCallback((itemId: string): void => {
    pendingIdsRef.current.delete(itemId);
    attemptsRef.current.delete(itemId);
    requestsRef.current.get(itemId)?.abort();
    requestsRef.current.delete(itemId);
  }, []);

  const pollItem = useCallback(async (itemId: string): Promise<void> => {
    if (!pendingIdsRef.current.has(itemId) || !isDocumentVisible()) return;

    const attempts = attemptsRef.current.get(itemId) ?? 0;
    if (attempts >= MAX_POLLS) {
      stop(itemId);
      return;
    }

    attemptsRef.current.set(itemId, attempts + 1);
    const controller = new AbortController();
    requestsRef.current.set(itemId, controller);
    try {
      const result = await fetchItemMetadata(itemId, controller.signal);
      reconcileRef.current(result.item);
      const status = result.metadata?.enrichment.kind;
      if (status === undefined || status === "ready" || status === "failed") {
        stop(itemId);
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      if (error instanceof ItemApiError && error.status === 404) {
        stop(itemId);
      } else if ((attempts + 1) >= MAX_POLLS) {
        stop(itemId);
      }
    } finally {
      if (requestsRef.current.get(itemId) === controller) {
        requestsRef.current.delete(itemId);
      }
    }
  }, [stop]);

  const pollPending = useCallback(async (): Promise<void> => {
    if (!mountedRef.current || runningRef.current || !isDocumentVisible()) return;

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    runningRef.current = true;
    try {
      await Promise.all(Array.from(pendingIdsRef.current, (itemId) => pollItem(itemId)));
    } finally {
      runningRef.current = false;
      if (mountedRef.current && pendingIdsRef.current.size > 0 && isDocumentVisible()) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          void pollPending();
        }, POLL_INTERVAL_MS);
      }
    }
  }, [pollItem]);

  const watch = useCallback((itemId: string): void => {
    if (!mountedRef.current || pendingIdsRef.current.has(itemId)) return;
    pendingIdsRef.current.add(itemId);
    attemptsRef.current.set(itemId, 0);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void pollPending();
  }, [pollPending]);

  useEffect(() => {
    for (const itemId of pendingIdsRef.current) {
      if (!items.some((item) => item.id === itemId)) stop(itemId);
    }
  }, [items, stop]);

  useEffect(() => {
    function handleVisibilityChange(): void {
      if (!isDocumentVisible()) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      void pollPending();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [pollPending]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    for (const controller of requestsRef.current.values()) controller.abort();
    pendingIdsRef.current.clear();
    attemptsRef.current.clear();
    requestsRef.current.clear();
  }, []);

  return { watch };
}

function isDocumentVisible(): boolean {
  return document.visibilityState === "visible";
}
