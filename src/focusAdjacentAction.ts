export function focusAdjacentAction(button: HTMLButtonElement, headingId: string) {
  const row = button.closest("li");
  const adjacentRow = row?.nextElementSibling ?? row?.previousElementSibling;
  const adjacentButton = adjacentRow?.querySelector<HTMLButtonElement>("button");

  requestAnimationFrame(() => {
    if (button.isConnected) {
      button.focus();
      return;
    }

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
}
