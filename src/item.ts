export const DESK_CAPACITY = 5;

export type ItemType = "article" | "book" | "paper" | "video" | "podcast";

export type ItemStatus = "inbox" | "desk" | "library";

export type Item = {
  id: string;
  title: string;
  source: string | null;
  url: string | null;
  type: ItemType;
  status: ItemStatus;
  addedAt: string;
  finishedAt: string | null;
  note: string | null;
};

const TYPE_LABELS: Record<ItemType, string> = {
  article: "Article",
  book: "Book",
  paper: "Paper",
  video: "Video",
  podcast: "Podcast",
};

export function itemTypeLabel(type: ItemType): string {
  return TYPE_LABELS[type];
}

export function itemMetaLine(item: Item): string {
  return [item.source, itemTypeLabel(item.type)].filter(Boolean).join(" · ");
}
