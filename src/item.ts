import type { ItemUrl } from "./itemUrl";

export const DESK_CAPACITY = 5;

export const TYPE_OPTIONS = [
  { value: "article", label: "Article" },
  { value: "book", label: "Book" },
  { value: "paper", label: "Paper" },
  { value: "video", label: "Video" },
  { value: "podcast", label: "Podcast" },
] as const;

export type ItemType = (typeof TYPE_OPTIONS)[number]["value"];

export type ItemStatus = "inbox" | "desk" | "library";

export type Item = {
  id: string;
  title: string;
  url: ItemUrl | null;
  type: ItemType;
  status: ItemStatus;
  addedAt: string;
  finishedAt: string | null;
  note: string | null;
};

export function itemTypeLabel(type: ItemType): string {
  return TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function itemMetaLine(item: Pick<Item, "url" | "type">): string {
  return [itemUrlHost(item.url), itemTypeLabel(item.type)].filter(Boolean).join(" · ");
}

export function itemUrlHost(url: ItemUrl | null): string | null {
  if (url === null) {
    return null;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function canReadInApp(item: Pick<Item, "type" | "url">): boolean {
  return item.url !== null && (item.type === "article" || item.type === "paper");
}

export function createItem(input: {
  title: string;
  url: ItemUrl | null;
  type: ItemType;
}): Item {
  return {
    id: crypto.randomUUID(),
    title: input.title,
    url: input.url,
    type: input.type,
    status: "inbox",
    addedAt: new Date().toISOString(),
    finishedAt: null,
    note: null,
  };
}
