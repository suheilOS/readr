export type FocusAdjacentAction = () => void;

export function focusAdjacentAction(
  button: HTMLButtonElement,
  headingId: string,
): FocusAdjacentAction {
  const row = button.closest("li");
  const adjacentRow = row?.nextElementSibling ?? row?.previousElementSibling;

  return () => {
    requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (activeElement !== button && activeElement !== document.body && activeElement !== document.documentElement) {
        return;
      }

      const adjacentButton = adjacentRow?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      if (adjacentButton?.isConnected) {
        adjacentButton.focus();
        return;
      }

      const heading = document.getElementById(headingId);
      if (heading !== null) {
        heading.focus();
        return;
      }

      document.querySelector<HTMLButtonElement>("[data-focus-fallback]")?.focus();
    });
  };
}

export function runWithFocusRestoration(
  button: HTMLButtonElement,
  headingId: string,
  action: () => Promise<boolean>,
): void {
  const restoreFocus = focusAdjacentAction(button, headingId);
  void action().then((succeeded) => {
    if (succeeded) restoreFocus();
  });
}
