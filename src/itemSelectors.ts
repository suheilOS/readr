import type { Item } from "../shared/item";

export type ItemGroups<T extends Item = Item> = {
  deskItems: T[];
  visibleDeskItems: T[];
  visibleInboxItems: T[];
  visibleLibraryItems: T[];
};

export function selectItemGroups<T extends Item>(items: T[], query: string): ItemGroups<T> {
  const normalizedQuery = query.trim().toLowerCase();
  const deskItems: T[] = [];
  const visibleDeskItems: T[] = [];
  const visibleInboxItems: T[] = [];
  const visibleLibraryItems: T[] = [];

  for (const item of items) {
    const matches = normalizedQuery.length === 0 ||
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.url?.toLowerCase().includes(normalizedQuery) === true;

    if (item.status === "desk") {
      deskItems.push(item);
      if (matches) visibleDeskItems.push(item);
    } else if (item.status === "inbox") {
      if (matches) visibleInboxItems.push(item);
    } else if (matches) {
      visibleLibraryItems.push(item);
    }
  }

  return { deskItems, visibleDeskItems, visibleInboxItems, visibleLibraryItems };
}
