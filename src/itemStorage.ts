import type { Item, ItemStatus, ItemType } from "./item";

const STORAGE_KEY = "reader:items";
const CURRENT_VERSION = 1;

type StoredItemData = {
  version: typeof CURRENT_VERSION;
  items: Item[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isItemType(value: unknown): value is ItemType {
  switch (value) {
    case "article":
    case "book":
    case "paper":
    case "video":
    case "podcast":
      return true;
    default:
      return false;
  }
}

function isItemStatus(value: unknown): value is ItemStatus {
  switch (value) {
    case "inbox":
    case "desk":
    case "library":
      return true;
    default:
      return false;
  }
}

function parseOptionalText(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim().length === 0 ? null : value;
}

function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return undefined;
  }

  return value;
}

function parseItem(value: unknown, allowLegacyFields: boolean): Item | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceValue =
    allowLegacyFields && value.source === undefined ? null : parseOptionalText(value.source);
  const urlValue =
    allowLegacyFields && value.url === undefined ? null : parseOptionalText(value.url);
  const finishedAtValue =
    allowLegacyFields && value.finishedAt === undefined
      ? null
      : parseOptionalDate(value.finishedAt);
  const noteValue =
    allowLegacyFields && value.note === undefined ? null : parseOptionalText(value.note);
  const addedAtValue = parseOptionalDate(value.addedAt);

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.title) ||
    !isItemType(value.type) ||
    !isItemStatus(value.status) ||
    addedAtValue === null ||
    addedAtValue === undefined ||
    sourceValue === undefined ||
    urlValue === undefined ||
    finishedAtValue === undefined ||
    noteValue === undefined
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    source: sourceValue,
    url: urlValue,
    type: value.type,
    status: value.status,
    addedAt: addedAtValue,
    finishedAt: finishedAtValue,
    note: noteValue,
  };
}

function parseItems(values: unknown[], allowLegacyFields: boolean): Item[] {
  const seenIds = new Set<string>();

  return values.flatMap((value) => {
    const item = parseItem(value, allowLegacyFields);

    if (item === null || seenIds.has(item.id)) {
      return [];
    }

    seenIds.add(item.id);
    return [item];
  });
}

function parseStoredItems(value: unknown): Item[] {
  if (Array.isArray(value)) {
    return parseItems(value, true);
  }

  if (!isRecord(value) || !Array.isArray(value.items)) {
    return [];
  }

  if (value.version === CURRENT_VERSION) {
    return parseItems(value.items, false);
  }

  if (value.version === undefined || value.version === 0) {
    return parseItems(value.items, true);
  }

  return [];
}

export function loadItems(fallbackItems: Item[]): Item[] {
  let storedValue: string | null;

  try {
    storedValue = localStorage.getItem(STORAGE_KEY);
  } catch {
    return fallbackItems;
  }

  if (storedValue === null) {
    return fallbackItems;
  }

  try {
    return parseStoredItems(JSON.parse(storedValue));
  } catch {
    return [];
  }
}

export function saveItems(items: Item[]): void {
  const storedData: StoredItemData = {
    version: CURRENT_VERSION,
    items,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
  } catch {
    // Keep the in-memory session usable if browser storage is unavailable.
  }
}
