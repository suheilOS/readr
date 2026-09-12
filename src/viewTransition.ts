import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

export function commitWithViewTransition(update: () => void): void {
  if (typeof document === "undefined") {
    update();
    return;
  }

  const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  if (startViewTransition === undefined || reducedMotion) {
    update();
    return;
  }

  let committed = false;

  try {
    startViewTransition.call(document, () => {
      flushSync(() => update());
      committed = true;
    });
  } catch {
    if (!committed) update();
  }
}
