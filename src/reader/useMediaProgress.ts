import { useCallback, useEffect, useMemo, useState } from "react";
import { loadMediaProgress, saveMediaProgress } from "./mediaProgress";
import { MediaProgressCoordinator } from "./mediaProgressCoordinator";

export function useMediaProgress(itemId: string) {
  const [initialPosition, setInitialPosition] = useState<number | null>(null);
  const coordinator = useMemo(() => new MediaProgressCoordinator(
    (input, keepalive) => saveMediaProgress(itemId, input, keepalive),
  ), [itemId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadMediaProgress(itemId, controller.signal).then((progress) => {
      if (!controller.signal.aborted) setInitialPosition(coordinator.hydrate(progress));
    }).catch(() => {
      if (!controller.signal.aborted) setInitialPosition(0);
    });
    return () => controller.abort();
  }, [coordinator, itemId]);

  useEffect(() => {
    function flush() {
      coordinator.flush();
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush();
    };
  }, [coordinator]);

  return {
    initialPosition,
    recordTime: useCallback((seconds: number) => coordinator.recordTime(seconds), [coordinator]),
    recordDuration: useCallback((seconds: number) => coordinator.recordDuration(seconds), [coordinator]),
    recordPlaying: useCallback((playing: boolean) => coordinator.recordPlaying(playing), [coordinator]),
  };
}
