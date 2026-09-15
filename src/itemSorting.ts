import type { Item } from "../shared/item";

export const ITEM_SORT_OPTIONS = [
  { value: "added-desc", label: "Newest added", field: "addedAt", direction: -1 },
  { value: "added-asc", label: "Oldest added", field: "addedAt", direction: 1 },
  { value: "title-asc", label: "Title A–Z", field: "title", direction: 1 },
  { value: "title-desc", label: "Title Z–A", field: "title", direction: -1 },
] as const;

export type ItemSortOption = (typeof ITEM_SORT_OPTIONS)[number];
export type ItemSort = ItemSortOption["value"];

export const DEFAULT_ITEM_SORT: ItemSort = ITEM_SORT_OPTIONS[0].value;

const titleCollator = new Intl.Collator(undefined, { sensitivity: "base" });

export function itemSortOptionFor(sort: ItemSort): ItemSortOption {
  const option = ITEM_SORT_OPTIONS.find((candidate) => candidate.value === sort);
  if (option === undefined) {
    throw new Error(`Unknown item sort: ${sort}`);
  }
  return option;
}

export function sortItems<T extends Item>(items: readonly T[], sort: ItemSort): T[] {
  const option = itemSortOptionFor(sort);

  return [...items].sort((a, b) => {
    const comparison = option.field === "title"
      ? titleCollator.compare(a.title, b.title)
      : a.addedAt.localeCompare(b.addedAt);
    if (comparison !== 0) return comparison * option.direction;
    return a.id.localeCompare(b.id) * option.direction;
  });
}
