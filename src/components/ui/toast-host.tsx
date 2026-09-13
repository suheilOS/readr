import { useEffect, useRef } from "react";
import { Toaster } from "sonner";

function updateToastLineState(toast: HTMLElement, title: Element): void {
  const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
  const isMultiline = Number.isFinite(lineHeight)
    && title.getBoundingClientRect().height > lineHeight * 1.5;

  toast.dataset.multiline = String(isMultiline);
}

export function ToastHost() {
  const toasterRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const toaster = toasterRef.current;
    if (toaster === null || typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const title = entry.target;
        const toast = title.closest<HTMLElement>("[data-sonner-toast]");
        if (toast !== null) updateToastLineState(toast, title);
      }
    });
    const observedTitles = new Set<HTMLElement>();

    const observeToasts = () => {
      const titles = new Set<HTMLElement>();
      toaster.querySelectorAll<HTMLElement>("[data-sonner-toast] [data-title]").forEach((title) => {
        titles.add(title);
        if (!observedTitles.has(title)) {
          observedTitles.add(title);
          resizeObserver.observe(title);
        }

        const toast = title.closest<HTMLElement>("[data-sonner-toast]");
        if (toast !== null) updateToastLineState(toast, title);
      });

      for (const title of observedTitles) {
        if (!titles.has(title)) {
          observedTitles.delete(title);
          resizeObserver.unobserve(title);
        }
      }
    };

    const mutationObserver = new MutationObserver(observeToasts);
    mutationObserver.observe(toaster, { childList: true, subtree: true });
    observeToasts();

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <Toaster
      ref={toasterRef}
      className="readr-toaster"
      position="top-center"
      gap={8}
      visibleToasts={3}
      swipeDirections={["top", "bottom", "left", "right"]}
      offset={16}
      mobileOffset={16}
      containerAriaLabel="Notifications"
      toastOptions={{
        className: "readr-toast",
        closeButton: false,
      }}
    />
  );
}
