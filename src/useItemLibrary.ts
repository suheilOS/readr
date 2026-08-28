import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "../shared/item";
import type { PendingItemAction } from "./pendingItemAction";
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
  error: string | null;
  unauthenticated: boolean;
  retry: () => void;
  addItem: (input: NewItemInput) => Promise<Item | null>;
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
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const dataGenerationRef = useRef(0);
  const pendingActionRef = useRef<PendingItemAction | null>(null);

  useEffect(() => {
    const generation = dataGenerationRef.current + 1;
    dataGenerationRef.current = generation;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetchItems(controller.signal)
      .then((nextItems) => {
        if (generation !== dataGenerationRef.current) return;
        setItems(nextItems);
        setUnauthenticated(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        handleError(error, setError, setUnauthenticated);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reloadToken]);

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
    const item = await runMutation({ kind: "add" }, () => createItem(input));
    if (item !== null) setItems((current) => [item, ...current]);
    return item;
  }, [runMutation]);

  const updateItem = useCallback(async (
    kind: "move-to-desk" | "move-to-inbox" | "finish",
    operation: ItemMutation,
    id: string,
  ): Promise<Item | null> => {
    const item = await runMutation({ kind, itemId: id }, () => operation(id));
    if (item !== null) {
      setItems((current) => current.map((currentItem) => currentItem.id === item.id ? item : currentItem));
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
    if (result) setItems((current) => current.filter((item) => item.id !== id));
    return result ?? false;
  }, [runMutation]);

  const swap = useCallback(async (candidateId: string, displacedId: string): Promise<Item | null> => {
    const result = await runMutation(
      { kind: "replace", itemId: displacedId },
      () => swapItems(candidateId, displacedId),
    );
    if (result !== null) {
      setItems((current) => current
        .filter((item) => item.id !== result.displacedId)
        .map((item) => item.id === result.item.id ? result.item : item));
    }
    return result?.item ?? null;
  }, [runMutation]);

  const retry = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  return {
    items,
    loading,
    pendingAction,
    error,
    unauthenticated,
    retry,
    addItem,
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
