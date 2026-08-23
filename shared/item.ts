declare const itemUrlBrand: unique symbol;

export type ItemUrl = string & { readonly [itemUrlBrand]: true };

export const DESK_CAPACITY = 5;

export const TYPE_OPTIONS = [
  { value: "article", label: "Article" },
  { value: "book", label: "Book" },
  { value: "paper", label: "Paper" },
  { value: "video", label: "Video" },
  { value: "podcast", label: "Podcast" },
] as const;

export type ItemType = (typeof TYPE_OPTIONS)[number]["value"];

export const DEFAULT_ITEM_TYPE: ItemType = TYPE_OPTIONS[0].value;

export const ITEM_STATUSES = ["inbox", "desk", "library"] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

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

export function parseItemUrl(value: unknown): ItemUrl | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return null;
    }

    return url.toString() as ItemUrl;
  } catch {
    return null;
  }
}

export function isItemUrl(value: unknown): value is ItemUrl {
  const parsed = parseItemUrl(value);
  return parsed !== null && parsed === value;
}

export function isItemType(value: unknown): value is ItemType {
  return typeof value === "string" && TYPE_OPTIONS.some((option) => option.value === value);
}

export function isItemStatus(value: unknown): value is ItemStatus {
  return typeof value === "string" && ITEM_STATUSES.some((status) => status === value);
}

export function parseItem(value: unknown): Item | null {
  if (!isRecord(value)) return null;

  const url = value.url === null ? null : parseItemUrl(value.url);
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    (value.url !== null && url === null) ||
    !isItemType(value.type) ||
    !isItemStatus(value.status) ||
    typeof value.addedAt !== "string" ||
    (value.finishedAt !== null && typeof value.finishedAt !== "string") ||
    (value.note !== null && typeof value.note !== "string")
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    url,
    type: value.type,
    status: value.status,
    addedAt: value.addedAt,
    finishedAt: value.finishedAt,
    note: value.note,
  };
}

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

  return new URL(url).hostname.replace(/^www\./, "");
}

export function canReadInApp(item: Pick<Item, "type" | "url">): boolean {
  return item.url !== null && (item.type === "article" || item.type === "paper");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
