import { DESK_CAPACITY, TYPE_OPTIONS, type Item, type ItemStatus, type ItemType } from "./item";
import { parseItemUrl } from "./itemUrl";

export const ITEM_STORAGE_KEY = "reader:items";
export const CURRENT_STORAGE_VERSION = 3;

type StoredItemData = {
  version: typeof CURRENT_STORAGE_VERSION;
  items: Item[];
};

export type LoadItemsResult =
  | { kind: "missing" }
  | { kind: "ready"; items: Item[]; needsMigration: boolean }
  | {
      kind: "corrupt";
      raw: string;
      recoveredItems: Item[];
      rejectedCount: number;
      deskOverflowCount: number;
    }
  | { kind: "unsupported"; raw: string; version: number }
  | { kind: "unavailable"; operation: "read" };

export type SaveItemsResult =
  | { ok: true }
  | { ok: false; operation: "write" };

type ParsedCollection = {
  items: Item[];
  rejectedCount: number;
  deskOverflowCount: number;
};

export function loadItems(): LoadItemsResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(ITEM_STORAGE_KEY);
  } catch {
    return { kind: "unavailable", operation: "read" };
  }

  if (raw === null) return { kind: "missing" };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return corrupt(raw, emptyCollection());
  }

  let values: unknown[];
  let allowLegacyFields = false;
  let needsMigration = false;

  if (Array.isArray(value)) {
    values = value;
    allowLegacyFields = true;
    needsMigration = true;
  } else if (isRecord(value) && Array.isArray(value.items)) {
    if (
      typeof value.version === "number" &&
      Number.isInteger(value.version) &&
      value.version > CURRENT_STORAGE_VERSION
    ) {
      return { kind: "unsupported", raw, version: value.version };
    }

    if (value.version === CURRENT_STORAGE_VERSION) {
      values = value.items;
    } else if (
      value.version === 0 || value.version === 1 || value.version === 2 ||
      value.version === undefined
    ) {
      values = value.items;
      allowLegacyFields = true;
      needsMigration = true;
    } else {
      return corrupt(raw, emptyCollection());
    }
  } else {
    return corrupt(raw, emptyCollection());
  }

  const parsed = parseItems(values, allowLegacyFields);
  if (parsed.rejectedCount > 0 || parsed.deskOverflowCount > 0) {
    return corrupt(raw, parsed);
  }

  return { kind: "ready", items: parsed.items, needsMigration };
}

export function saveItems(items: Item[]): SaveItemsResult {
  const storedData: StoredItemData = {
    version: CURRENT_STORAGE_VERSION,
    items,
  };

  try {
    localStorage.setItem(ITEM_STORAGE_KEY, JSON.stringify(storedData));
    return { ok: true };
  } catch {
    return { ok: false, operation: "write" };
  }
}

function emptyCollection(): ParsedCollection {
  return { items: [], rejectedCount: 0, deskOverflowCount: 0 };
}

function corrupt(raw: string, parsed: ParsedCollection): LoadItemsResult {
  return {
    kind: "corrupt",
    raw,
    recoveredItems: parsed.items,
    rejectedCount: parsed.rejectedCount,
    deskOverflowCount: parsed.deskOverflowCount,
  };
}

function parseItems(values: unknown[], allowLegacyFields: boolean): ParsedCollection {
  const seenIds = new Set<string>();
  const items: Item[] = [];
  let rejectedCount = 0;

  for (const value of values) {
    const item = parseItem(value, allowLegacyFields);
    if (item === null || seenIds.has(item.id)) {
      rejectedCount += 1;
      continue;
    }
    seenIds.add(item.id);
    items.push(item);
  }

  let deskCount = 0;
  let deskOverflowCount = 0;
  const recoveredItems = items.map((item) => {
    if (item.status !== "desk") return item;
    deskCount += 1;
    if (deskCount <= DESK_CAPACITY) return item;
    deskOverflowCount += 1;
    return { ...item, status: "inbox", finishedAt: null } satisfies Item;
  });

  return { items: recoveredItems, rejectedCount, deskOverflowCount };
}

function parseItem(value: unknown, allowLegacyFields: boolean): Item | null {
  if (!isRecord(value)) return null;

  const legacyMissingUrl = allowLegacyFields && value.url === undefined;
  const url = value.url === null || legacyMissingUrl ? null : parseItemUrl(value.url);
  const finishedAt = allowLegacyFields && value.finishedAt === undefined
    ? null
    : parseOptionalDate(value.finishedAt);
  const note = allowLegacyFields && value.note === undefined
    ? null
    : parseOptionalText(value.note);
  const addedAt = parseOptionalDate(value.addedAt);

  if (
    !isNonEmptyString(value.id) || !isNonEmptyString(value.title) ||
    !isItemType(value.type) || !isItemStatus(value.status) ||
    addedAt === null || addedAt === undefined ||
    finishedAt === undefined || note === undefined ||
    (value.url !== null && !legacyMissingUrl && url === null)
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    url,
    type: value.type,
    status: value.status,
    addedAt,
    finishedAt,
    note,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isItemType(value: unknown): value is ItemType {
  return typeof value === "string" && TYPE_OPTIONS.some((option) => option.value === value);
}

function isItemStatus(value: unknown): value is ItemStatus {
  return value === "inbox" || value === "desk" || value === "library";
}

function parseOptionalText(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim().length === 0 ? null : value;
}

function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return value;
}
