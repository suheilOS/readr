export function dissolve(
  element: HTMLElement,
  { onComplete }: { onComplete: () => void },
) {
  if (typeof element.animate !== "function") {
    onComplete();
    return;
  }

  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    onComplete();
  };
  const animation = element.animate(
    [
      { opacity: 1, filter: "blur(0px)" },
      { opacity: 0, filter: "blur(8px)", transform: "scale(0.96)" },
    ],
    {
      duration: 160,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      fill: "forwards",
    },
  );
  animation.addEventListener("finish", complete, { once: true });
  animation.addEventListener("cancel", complete, { once: true });
}
