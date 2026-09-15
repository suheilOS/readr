import { flushSync } from "react-dom";

// Await the DOM update, not the animation. Persistence can run alongside it.
export async function commitWithViewTransition(update: () => void): Promise<void> {
  if (typeof document === "undefined" || typeof document.startViewTransition !== "function" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    flushSync(update);
  };
  try {
    await document.startViewTransition(commit).updateCallbackDone;
  } catch (error) {
    // Fall back only for snapshot/start failures. An exception from the update
    // itself must propagate, not replay a potentially partial mutation.
    if (committed) throw error;
    commit();
  }
}
