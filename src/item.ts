export const DESK_CAPACITY = 5;

export type ItemType = "article" | "book" | "paper" | "video" | "podcast";

export type ItemStatus = "inbox" | "desk" | "library";

export const TYPE_OPTIONS: Array<{ value: ItemType; label: string }> = [
  { value: "article", label: "Article" },
  { value: "book", label: "Book" },
  { value: "paper", label: "Paper" },
  { value: "video", label: "Video" },
  { value: "podcast", label: "Podcast" },
];

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

export function createItem(input: {
  title: string;
  source: string | null;
  url: string | null;
  type: ItemType;
}): Item {
  return {
    id: crypto.randomUUID(),
    title: input.title,
    source: input.source,
    url: input.url,
    type: input.type,
    status: "inbox",
    addedAt: new Date().toISOString(),
    finishedAt: null,
    note: null,
  };
}
