import { useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import type { Item } from "./item";
import { itemReducer, type ItemAction } from "./itemReducer";
import { loadItems, saveItems, type LoadItemsResult } from "./itemStorage";

type RecoveryState = Extract<LoadItemsResult, { kind: "corrupt" | "unsupported" }>;

export type ItemLibrary = {
  items: Item[];
  dispatch: Dispatch<ItemAction>;
  recovery: RecoveryState | null;
  persistenceWarning: string | null;
  acceptRecovery: (items: Item[]) => boolean;
};

export function useItemLibrary(): ItemLibrary {
  const initialLoad = useRef<LoadItemsResult | null>(null);
  if (initialLoad.current === null) initialLoad.current = loadItems();

  const initial = initialLoad.current;
  const initialItems = initial.kind === "ready" ? initial.items : [];
  const [items, dispatch] = useReducer(itemReducer, initialItems);
  const [recovery, setRecovery] = useState<RecoveryState | null>(
    initial.kind === "corrupt" || initial.kind === "unsupported" ? initial : null,
  );
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(
    initial.kind === "unavailable"
      ? "Browser storage is unavailable. Changes will last only for this session."
      : null,
  );
  const mounted = useRef(false);
  const skipNextSave = useRef(false);
  const persistenceAvailable = initial.kind !== "unavailable";

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (initial.kind !== "ready" || !initial.needsMigration) return;
    } else if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    if (!persistenceAvailable || recovery !== null) return;
    if (!saveItems(items).ok) {
      setPersistenceWarning("Changes could not be saved. Keep this tab open to avoid losing them.");
    } else {
      setPersistenceWarning(null);
    }
  }, [initial, items, persistenceAvailable, recovery]);

  function acceptRecovery(nextItems: Item[]): boolean {
    const result = saveItems(nextItems);
    if (!result.ok) {
      setPersistenceWarning("Recovery could not be saved. Your original data is still untouched.");
      return false;
    }

    skipNextSave.current = true;
    setRecovery(null);
    setPersistenceWarning(null);
    dispatch({ type: "replaceAll", items: nextItems });
    return true;
  }

  return { items, dispatch, recovery, persistenceWarning, acceptRecovery };
}
