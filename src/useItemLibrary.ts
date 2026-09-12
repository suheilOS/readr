import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "../shared/item";
import type { PendingItemAction } from "./pendingItemAction";
import { commitWithViewTransition } from "./viewTransition";
import {
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
  reconcileItem: (item: Item) => void;
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

  const addItem = useCallback(async (input: NewItemInput): Promise<Item | null> => {
    if (capturePendingRef.current) return null;

    capturePendingRef.current = true;
    setCapturePending(true);
    dataGenerationRef.current += 1;
    setError(null);
    try {
      const item = await createItem(input);
      dataGenerationRef.current += 1;
      setItems((current) => [item, ...current]);
      return item;
    } catch (error: unknown) {
      handleError(error, setError, setUnauthenticated);
      return null;
    } finally {
      capturePendingRef.current = false;
      setCapturePending(false);
    }
  }, []);

  const reconcileItem = useCallback((item: Item): void => {
    dataGenerationRef.current += 1;
    setItems((current) => {
      const index = current.findIndex((currentItem) => currentItem.id === item.id);
      if (index === -1) return [item, ...current];

      return current.map((currentItem) => currentItem.id === item.id ? item : currentItem);
    });
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
    const result = await runMutation({ kind: "discard", itemId: id }, async () => {
      await discardItem(id);
      return true;
    });
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
    reconcileItem,
    moveToDesk,
    moveToInbox,
    finish,
    discard,
    swap,
  };
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
