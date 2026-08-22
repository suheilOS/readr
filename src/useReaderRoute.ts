import { useCallback, useEffect, useRef, useState } from "react";

export type ReaderRoute = {
  readerItemId: string | null;
  openReaderRoute: (itemId: string) => void;
  closeReaderRoute: () => void;
};

export function useReaderRoute(): ReaderRoute {
  const [readerItemId, setReaderItemId] = useState<string | null>(() =>
    getReaderItemId(window.location.hash),
  );
  const triggerItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    function handleHashChange() {
      const nextItemId = getReaderItemId(window.location.hash);
      setReaderItemId(nextItemId);
      if (nextItemId === null) {
        restoreTriggerFocus(triggerItemIdRef.current);
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const openReaderRoute = useCallback((itemId: string) => {
    triggerItemIdRef.current = itemId;
    setReaderItemId(itemId);
    window.location.hash = `read=${encodeURIComponent(itemId)}`;
  }, []);

  const closeReaderRoute = useCallback(() => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    setReaderItemId(null);
    restoreTriggerFocus(triggerItemIdRef.current);
  }, []);

  return { readerItemId, openReaderRoute, closeReaderRoute };
}

function restoreTriggerFocus(itemId: string | null): void {
  if (itemId === null) return;
  requestAnimationFrame(() => {
    const trigger = document.querySelector<HTMLElement>(
      `[data-reader-item-id="${CSS.escape(itemId)}"]`,
    );
    trigger?.focus();
  });
}

function getReaderItemId(hash: string): string | null {
  if (!hash.startsWith("#read=")) return null;
  try {
    const itemId = decodeURIComponent(hash.slice("#read=".length));
    return itemId.length > 0 ? itemId : null;
  } catch {
    return null;
  }
}
