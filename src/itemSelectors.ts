import type { Item } from "../shared/item";

export type ItemGroups = {
  deskItems: Item[];
  visibleDeskItems: Item[];
  visibleInboxItems: Item[];
  visibleLibraryItems: Item[];
};

export function selectItemGroups(items: Item[], query: string): ItemGroups {
  const normalizedQuery = query.trim().toLowerCase();
  const deskItems: Item[] = [];
  const visibleDeskItems: Item[] = [];
  const visibleInboxItems: Item[] = [];
  const visibleLibraryItems: Item[] = [];

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
