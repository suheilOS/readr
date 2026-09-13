import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "../shared/item";
import type { CaptureInput, CaptureResult } from "../shared/capture";
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
  items: Item[];
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
  reconcileItemMetadata: (item: Pick<Item, "id" | "title" | "type">) => void;
  moveToDesk: (id: string) => Promise<Item | null>;
  moveToInbox: (id: string) => Promise<Item | null>;
  finish: (id: string) => Promise<Item | null>;
  discard: (id: string) => Promise<boolean>;
  swap: (candidateId: string, displacedId: string) => Promise<Item | null>;
};

export function useItemLibrary(): ItemLibrary {
  const [items, setItems] = useState<Item[]>([]);
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
        setItems(nextItems);
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
  }, [loadRequest]);

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
      (item) => setItems((current) => upsertItem(current, item)),
    );
    return result;
  }, [runCapture]);

  const captureUrlWithError = useCallback(
    (input: CaptureInput): Promise<CaptureAttempt> => runCapture(
      () => requestCaptureUrl(input),
      ({ item }) => setItems((current) => upsertItem(current, item)),
    ),
    [runCapture],
  );

  const captureUrl = useCallback(
    (input: CaptureInput): Promise<CaptureResult | null> => captureUrlWithError(input).then(({ result }) => result),
    [captureUrlWithError],
  );

  const reconcileItem = useCallback((item: Item): void => {
    dataGenerationRef.current += 1;
    setItems((current) => upsertItem(current, item));
  }, []);

  const reconcileItemMetadata = useCallback((item: Pick<Item, "id" | "title" | "type">): void => {
    dataGenerationRef.current += 1;
    setItems((current) => current.map((currentItem) => currentItem.id === item.id
      ? { ...currentItem, title: item.title, type: item.type }
      : currentItem));
  }, []);

  const updateItem = useCallback(async (
    kind: "move-to-desk" | "move-to-inbox" | "finish",
    operation: ItemMutation,
    id: string,
  ): Promise<Item | null> => {
    const item = await runMutation({ kind, itemId: id }, () => operation(id));
    if (item !== null) {
      dataGenerationRef.current += 1;
      commitWithViewTransition(() => {
        setItems((current) => current.map((currentItem) => currentItem.id === item.id ? item : currentItem));
      });
    }
    return item;
  }, [runMutation]);

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
      setItems((current) => current.filter((item) => item.id !== id));
    }
    return result ?? false;
  }, [runMutation]);

  const swap = useCallback(async (candidateId: string, displacedId: string): Promise<Item | null> => {
    const result = await runMutation(
      { kind: "replace", itemId: displacedId },
      () => swapItems(candidateId, displacedId),
    );
    if (result !== null) {
      dataGenerationRef.current += 1;
      commitWithViewTransition(() => {
        setItems((current) => current
          .filter((item) => item.id !== result.displacedId)
          .map((item) => item.id === result.item.id ? result.item : item));
      });
    }
    return result?.item ?? null;
  }, [runMutation]);

  const retry = useCallback(() => {
    requestLoad(true);
  }, [requestLoad]);
  const refreshSilently = useCallback(() => {
    requestLoad(false);
  }, [requestLoad]);

  return {
    items,
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

function upsertItem(items: Item[], item: Item): Item[] {
  const index = items.findIndex((currentItem) => currentItem.id === item.id);
  if (index === -1) return [item, ...items];
  return items.map((currentItem) => currentItem.id === item.id ? item : currentItem);
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
