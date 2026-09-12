import { lazy, Suspense, useEffect, useState } from "react";
import { TOAST_EVENT } from "./toast-api";

const LazyToasts = lazy(async () => {
  const module = await import("./toast");
  return { default: module.Toasts };
});

export function ToastHost() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const activate = () => setActive(true);
    window.addEventListener(TOAST_EVENT, activate);
    return () => window.removeEventListener(TOAST_EVENT, activate);
  }, []);

  if (!active) return null;

  return (
    <Suspense fallback={null}>
      <LazyToasts />
    </Suspense>
  );
}
