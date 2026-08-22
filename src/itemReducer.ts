import { DESK_CAPACITY, type Item } from "./item";

export type ItemAction =
  | { type: "add"; item: Item }
  | { type: "moveToDesk"; id: string }
  | { type: "moveToInbox"; id: string }
  | { type: "finish"; id: string; finishedAt: string }
  | { type: "discard"; id: string }
  | { type: "swapAndDiscard"; candidateId: string; displacedId: string }
  | { type: "replaceAll"; items: Item[] };

export function itemReducer(items: Item[], action: ItemAction): Item[] {
  switch (action.type) {
    case "add":
      return [action.item, ...items];
    case "moveToDesk": {
      const target = items.find((item) => item.id === action.id);
      if (
        target === undefined ||
        target.status === "desk" ||
        countDeskItems(items) >= DESK_CAPACITY
      ) {
        return items;
      }
      return updateItem(items, action.id, { status: "desk", finishedAt: null });
    }
    case "moveToInbox":
      return updateItem(items, action.id, { status: "inbox", finishedAt: null });
    case "finish":
      return updateItem(items, action.id, {
        status: "library",
        finishedAt: action.finishedAt,
      });
    case "discard":
      return items.filter((item) => item.id !== action.id);
    case "swapAndDiscard": {
      if (action.candidateId === action.displacedId) return items;
      const candidate = items.find((item) => item.id === action.candidateId);
      const displaced = items.find((item) => item.id === action.displacedId);
      if (candidate === undefined || displaced?.status !== "desk") return items;

      return items
        .filter((item) => item.id !== action.displacedId)
        .map((item) => item.id === action.candidateId
          ? { ...item, status: "desk", finishedAt: null }
          : item);
    }
    case "replaceAll":
      return action.items;
  }
}

function countDeskItems(items: Item[]): number {
  return items.reduce(
    (count, item) => count + (item.status === "desk" ? 1 : 0),
    0,
  );
}

function updateItem(
  items: Item[],
  id: string,
  update: Pick<Item, "status" | "finishedAt">,
): Item[] {
  const target = items.find((item) => item.id === id);
  if (
    target === undefined ||
    (target.status === update.status && target.finishedAt === update.finishedAt)
  ) {
    return items;
  }
  return items.map((item) => item.id === id ? { ...item, ...update } : item);
}
