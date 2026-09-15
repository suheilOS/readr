import type { Item, ItemType } from "../shared/item";
import { DEFAULT_ITEM_SORT, sortItems, type ItemSort } from "./itemSorting";

export type ItemSelectionOptions = {
  sort?: ItemSort;
  types?: readonly ItemType[];
};

export type ItemGroups<T extends Item = Item> = {
  deskItems: T[];
  visibleDeskItems: T[];
  visibleInboxItems: T[];
  visibleLibraryItems: T[];
};

export function selectItemGroups<T extends Item>(
  items: T[],
  query: string,
  options: ItemSelectionOptions = {},
): ItemGroups<T> {
  const normalizedQuery = query.trim().toLowerCase();
  const selectedTypes = new Set(options.types ?? []);
  const sort = options.sort ?? DEFAULT_ITEM_SORT;
  const deskItems: T[] = [];
  const visibleDeskItems: T[] = [];
  const visibleInboxItems: T[] = [];
  const visibleLibraryItems: T[] = [];

  for (const item of items) {
    const matchesQuery = normalizedQuery.length === 0 ||
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.url?.toLowerCase().includes(normalizedQuery) === true;
    const matchesType = selectedTypes.size === 0 || selectedTypes.has(item.type);
    const matches = matchesQuery && matchesType;

    if (item.status === "desk") {
      deskItems.push(item);
      if (matches) visibleDeskItems.push(item);
    } else if (item.status === "inbox") {
      if (matches) visibleInboxItems.push(item);
    } else if (matches) {
      visibleLibraryItems.push(item);
    }
  }

  return {
    deskItems: sortItems(deskItems, sort),
    visibleDeskItems: sortItems(visibleDeskItems, sort),
    visibleInboxItems: sortItems(visibleInboxItems, sort),
    visibleLibraryItems: sortItems(visibleLibraryItems, sort),
  };
}
