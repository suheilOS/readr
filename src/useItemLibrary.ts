import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "./item";
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
  busy: boolean;
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
  const [activeMutations, setActiveMutations] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const dataGenerationRef = useRef(0);

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

  const runMutation = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    dataGenerationRef.current += 1;
    setActiveMutations((current) => current + 1);
    setError(null);
    try {
      return await operation();
    } catch (error: unknown) {
      handleError(error, setError, setUnauthenticated);
      return null;
    } finally {
      setActiveMutations((current) => Math.max(0, current - 1));
    }
  }, []);

  const addItem = useCallback(async (input: NewItemInput): Promise<Item | null> => {
    const item = await runMutation(() => createItem(input));
    if (item !== null) setItems((current) => [item, ...current]);
    return item;
  }, [runMutation]);

  const updateItem = useCallback(async (operation: ItemMutation, id: string): Promise<Item | null> => {
    const item = await runMutation(() => operation(id));
    if (item !== null) {
      setItems((current) => current.map((currentItem) => currentItem.id === item.id ? item : currentItem));
    }
    return item;
  }, [runMutation]);

  const moveToDesk = useCallback((id: string) => updateItem(moveItemToDesk, id), [updateItem]);
  const moveToInbox = useCallback((id: string) => updateItem(moveItemToInbox, id), [updateItem]);
  const finish = useCallback((id: string) => updateItem(finishItem, id), [updateItem]);

  const discard = useCallback(async (id: string): Promise<boolean> => {
    const result = await runMutation(async () => {
      await discardItem(id);
      return true;
    });
    if (result) setItems((current) => current.filter((item) => item.id !== id));
    return result ?? false;
  }, [runMutation]);

  const swap = useCallback(async (candidateId: string, displacedId: string): Promise<Item | null> => {
    const result = await runMutation(() => swapItems(candidateId, displacedId));
    if (result !== null) {
      setItems((current) => current
        .filter((item) => item.id !== result.displacedId)
        .map((item) => item.id === result.item.id ? result.item : item));
    }
    return result?.item ?? null;
  }, [runMutation]);

  return {
    items,
    loading,
    busy: activeMutations > 0,
    error,
    unauthenticated,
    retry: () => setReloadToken((current) => current + 1),
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
