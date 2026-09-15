import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item, ItemListItem } from "../shared/item";
import { toItemMetadataSummary, type CaptureInput, type CaptureResult, type ItemMetadata } from "../shared/capture";
import type { PendingItemAction } from "./pendingItemAction";
import { commitWithViewTransition } from "./viewTransition";
import {
  captureUrl as requestCaptureUrl,
  createItem,
  discardItem,
  fetchItems,
  finishItem,
  ItemApiError,
  moveItemToDesk,
  moveItemToInbox,
  swapItems,
  type NewItemInput,
} from "./itemApi";

type ItemMutation = (id: string) => Promise<Item>;

type CaptureOutcome<T> =
  | { result: T; error: null }
  | { result: null; error: ItemApiError };

export type CaptureAttempt = CaptureOutcome<CaptureResult>;

export type ItemLibrary = {
  items: ItemListItem[];
  loading: boolean;
  pendingAction: PendingItemAction | null;
  capturePending: boolean;
  error: string | null;
  unauthenticated: boolean;
  retry: () => void;
  refreshSilently: () => void;
  addItem: (input: NewItemInput) => Promise<Item | null>;
  captureUrl: (input: CaptureInput) => Promise<CaptureResult | null>;
  captureUrlWithError: (input: CaptureInput) => Promise<CaptureAttempt>;
  reconcileItem: (item: Item) => void;
  reconcileItemMetadata: (
    item: Pick<Item, "id" | "title" | "type">,
    metadata: ItemMetadata | null,
  ) => void;
  moveToDesk: (id: string) => Promise<Item | null>;
  moveToInbox: (id: string) => Promise<Item | null>;
  finish: (id: string) => Promise<Item | null>;
  discard: (id: string) => Promise<boolean>;
  swap: (candidateId: string, displacedId: string) => Promise<Item | null>;
};

export function useItemLibrary(): ItemLibrary {
  const [items, setItems] = useState<ItemListItem[]>([]);
  const itemsRef = useRef(items);
  // Async writers share one current snapshot. Compute changes before notifying
  // React so no-op detection and generation changes stay outside state updaters.
  const updateItems = useCallback((update: (current: ItemListItem[]) => ItemListItem[]): boolean => {
    const next = update(itemsRef.current);
    if (next === itemsRef.current) return false;
    itemsRef.current = next;
    setItems(next);
    return true;
  }, []);
  // Keep optimistic lifecycle fields separate: rollback must not undo captures
  // or metadata received while the request was in flight.
  const [optimisticMove, setOptimisticMove] = useState<Pick<Item, "id" | "status" | "finishedAt"> | null>(null);
  const displayedItems = useMemo(() => optimisticMove === null ? items : items.map((item) =>
    item.id === optimisticMove.id ? { ...item, ...optimisticMove } : item), [items, optimisticMove]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingItemAction | null>(null);
  const [capturePending, setCapturePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [loadRequest, setLoadRequest] = useState({ token: 0, showLoading: true });
  const dataGenerationRef = useRef(0);
  const pendingActionRef = useRef<PendingItemAction | null>(null);
  const capturePendingRef = useRef(false);

  const requestLoad = useCallback((showLoading: boolean): void => {
    setLoadRequest((current) => ({ token: current.token + 1, showLoading }));
  }, []);

  useEffect(() => {
    const generation = dataGenerationRef.current + 1;
    dataGenerationRef.current = generation;
    const controller = new AbortController();
    setLoading(loadRequest.showLoading);
    setError(null);

    void fetchItems(controller.signal)
      .then((nextItems) => {
        if (generation !== dataGenerationRef.current) return;
        updateItems(() => nextItems);
        setUnauthenticated(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== dataGenerationRef.current) return;
        handleError(error, setError, setUnauthenticated);
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === dataGenerationRef.current) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [loadRequest, updateItems]);

  const runMutation = useCallback(async <T,>(
    action: PendingItemAction,
    operation: () => Promise<T>,
  ): Promise<T | null> => {
    if (pendingActionRef.current !== null) return null;

    pendingActionRef.current = action;
    setPendingAction(action);
    dataGenerationRef.current += 1;
    setError(null);
    try {
      return await operation();
    } catch (error: unknown) {
      handleError(error, setError, setUnauthenticated);
      return null;
    } finally {
      pendingActionRef.current = null;
      setPendingAction(null);
    }
  }, []);

  const runCapture = useCallback(async <T,>(
    operation: () => Promise<T>,
    apply: (result: T) => void,
  ): Promise<CaptureOutcome<T>> => {
    if (capturePendingRef.current) {
      return {
        result: null,
        error: new ItemApiError("A capture is already in progress. Try again in a moment.", 409, "capture_pending"),
      };
    }

    capturePendingRef.current = true;
    setCapturePending(true);
    dataGenerationRef.current += 1;
    setError(null);
    try {
      const result = await operation();
      dataGenerationRef.current += 1;
      apply(result);
      return { result, error: null };
    } catch (error: unknown) {
      const captureError = toItemApiError(error);
      handleError(error, setError, setUnauthenticated);
      return { result: null, error: captureError };
    } finally {
      capturePendingRef.current = false;
      setCapturePending(false);
    }
  }, []);

  const addItem = useCallback(async (input: NewItemInput): Promise<Item | null> => {
    const { result } = await runCapture(
      () => createItem(input),
      (item) => updateItems((current) => upsertItem(current, item)),
    );
    return result;
  }, [runCapture, updateItems]);

  const captureUrlWithError = useCallback(
    (input: CaptureInput): Promise<CaptureAttempt> => runCapture(
      () => requestCaptureUrl(input),
      ({ item }) => updateItems((current) => upsertItem(current, item)),
    ),
    [runCapture, updateItems],
  );

  const captureUrl = useCallback(
    (input: CaptureInput): Promise<CaptureResult | null> => captureUrlWithError(input).then(({ result }) => result),
    [captureUrlWithError],
  );

  const reconcileItem = useCallback((item: Item): void => {
    dataGenerationRef.current += 1;
    updateItems((current) => upsertItem(current, item));
  }, [updateItems]);

  const reconcileItemMetadata = useCallback((
    item: Pick<Item, "id" | "title" | "type">,
    metadata: ItemMetadata | null,
  ): void => {
    const summary = toItemMetadataSummary(metadata);
    const changed = updateItems((current) => {
      const existing = current.find((currentItem) => currentItem.id === item.id);
      if (existing === undefined || (existing.title === item.title && existing.type === item.type &&
        sameMetadataSummary(existing.metadataSummary, summary))) return current;
      return current.map((currentItem) => currentItem.id === item.id
        ? { ...currentItem, title: item.title, type: item.type, metadataSummary: summary }
        : currentItem);
    });
    if (changed) dataGenerationRef.current += 1;
  }, [updateItems]);

  const updateItem = useCallback(async (
    kind: "move-to-desk" | "move-to-inbox" | "finish",
    operation: ItemMutation,
    id: string,
  ): Promise<Item | null> => {
    return runMutation({ kind, itemId: id }, async () => {
      const optimisticCommit = commitWithViewTransition(() => setOptimisticMove({
        id,
        status: kind === "finish" ? "library" : kind === "move-to-desk" ? "desk" : "inbox",
        finishedAt: kind === "finish" ? new Date().toISOString() : null,
      }));
      try {
        const [item] = await Promise.all([operation(id), optimisticCommit]);
        dataGenerationRef.current += 1;
        updateItems((current) => current.map((currentItem) => currentItem.id === item.id
          ? { ...currentItem, status: item.status, finishedAt: item.finishedAt }
          : currentItem));
        setOptimisticMove(null);
        return item;
      } catch (error) {
        // A fast request failure must not roll back before the queued visual
        // update runs, otherwise that callback could reapply the failed move.
        await optimisticCommit;
        dataGenerationRef.current += 1;
        await commitWithViewTransition(() => setOptimisticMove(null));
        throw error;
      }
    });
  }, [runMutation, updateItems]);

  const moveToDesk = useCallback(
    (id: string) => updateItem("move-to-desk", moveItemToDesk, id),
    [updateItem],
  );
  const moveToInbox = useCallback(
    (id: string) => updateItem("move-to-inbox", moveItemToInbox, id),
    [updateItem],
  );
  const finish = useCallback(
    (id: string) => updateItem("finish", finishItem, id),
    [updateItem],
  );

  const discard = useCallback(async (id: string): Promise<boolean> => {
    const result = await runMutation(
      { kind: "discard", itemId: id },
      async () => {
        await discardItem(id);
        return true;
      },
    );
    if (result) {
      dataGenerationRef.current += 1;
      updateItems((current) => current.filter((item) => item.id !== id));
    }
    return result ?? false;
  }, [runMutation, updateItems]);

  const swap = useCallback(async (candidateId: string, displacedId: string): Promise<Item | null> => {
    return runMutation({ kind: "replace", itemId: displacedId }, async () => {
      const result = await swapItems(candidateId, displacedId);
      dataGenerationRef.current += 1;
      await commitWithViewTransition(() => {
        updateItems((current) => current
          .filter((item) => item.id !== result.displacedId)
          .map((item) => item.id === result.item.id ? replaceListItem(item, result.item) : item));
      });
      return result.item;
    });
  }, [runMutation, updateItems]);

  const retry = useCallback(() => {
    requestLoad(true);
  }, [requestLoad]);
  const refreshSilently = useCallback(() => {
    requestLoad(false);
  }, [requestLoad]);

  return {
    items: displayedItems,
    loading,
    pendingAction,
    capturePending,
    error,
    unauthenticated,
    retry,
    refreshSilently,
    addItem,
    captureUrl,
    captureUrlWithError,
    reconcileItem,
    reconcileItemMetadata,
    moveToDesk,
    moveToInbox,
    finish,
    discard,
    swap,
  };
}

function sameMetadataSummary(a: ItemListItem["metadataSummary"], b: ItemListItem["metadataSummary"]): boolean {
  if (a === null || b === null) return a === b;
  return a.imageUrl === b.imageUrl && a.imageKind === b.imageKind &&
    a.siteName === b.siteName && a.author === b.author;
}

function upsertItem(items: ItemListItem[], item: Item): ItemListItem[] {
  const index = items.findIndex((currentItem) => currentItem.id === item.id);
  if (index === -1) return [{ ...item, metadataSummary: null }, ...items];
  return items.map((currentItem) => currentItem.id === item.id
    ? replaceListItem(currentItem, item)
    : currentItem);
}

function replaceListItem(currentItem: ItemListItem, nextItem: Item): ItemListItem {
  return { ...nextItem, metadataSummary: currentItem.metadataSummary };
}

function toItemApiError(error: unknown): ItemApiError {
  if (error instanceof ItemApiError) return error;
  const message = error instanceof Error
    ? error.message
    : "Readr could not complete that request. Try again.";
  return new ItemApiError(message, 0, "unknown_error");
}

function handleError(
  error: unknown,
  setError: (message: string | null) => void,
  setUnauthenticated: (value: boolean) => void,
): void {
  if (error instanceof ItemApiError && error.status === 401) {
    setUnauthenticated(true);
    setError(null);
    return;
  }

  setError(error instanceof Error ? error.message : "Readr could not complete that request. Try again.");
}
