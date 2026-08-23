export type PendingItemAction = {
  kind: "move-to-desk" | "move-to-inbox" | "finish" | "discard" | "replace";
  itemId: string;
};

export function isPendingItemAction(
  action: PendingItemAction | null,
  itemId: string,
  kind?: PendingItemAction["kind"],
): boolean {
  return action?.itemId === itemId && (kind === undefined || action.kind === kind);
}

export function pendingItemActionLabel(action: PendingItemAction | null): string {
  if (action === null) return "";

  switch (action.kind) {
    case "move-to-desk":
    case "move-to-inbox":
      return "Moving item.";
    case "finish":
      return "Finishing item.";
    case "discard":
      return "Discarding item.";
    case "replace":
      return "Replacing desk item.";
  }
}
