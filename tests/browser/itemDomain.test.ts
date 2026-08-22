import { beforeEach, describe, expect, it, vi } from "vitest";
import { DESK_CAPACITY, type Item, type ItemStatus } from "../../src/item";
import { itemReducer } from "../../src/itemReducer";
import { selectItemGroups } from "../../src/itemSelectors";
import {
  CURRENT_STORAGE_VERSION,
  ITEM_STORAGE_KEY,
  loadItems,
  saveItems,
} from "../../src/itemStorage";
import { parseItemUrl } from "../../src/itemUrl";

beforeEach(() => localStorage.clear());

describe("item storage", () => {
  it("preserves malformed data instead of replacing it", () => {
    const raw = "{not-json";
    localStorage.setItem(ITEM_STORAGE_KEY, raw);

    expect(loadItems()).toMatchObject({ kind: "corrupt", raw });
    expect(localStorage.getItem(ITEM_STORAGE_KEY)).toBe(raw);
  });

  it("preserves unsupported future versions", () => {
    const raw = JSON.stringify({ version: 99, items: [] });
    localStorage.setItem(ITEM_STORAGE_KEY, raw);

    expect(loadItems()).toEqual({ kind: "unsupported", raw, version: 99 });
    expect(localStorage.getItem(ITEM_STORAGE_KEY)).toBe(raw);
  });

  it("reports invalid records and recovers valid records", () => {
    const valid = makeItem("valid", "inbox");
    const raw = JSON.stringify({ version: CURRENT_STORAGE_VERSION, items: [valid, { id: 2 }] });
    localStorage.setItem(ITEM_STORAGE_KEY, raw);

    expect(loadItems()).toMatchObject({
      kind: "corrupt",
      recoveredItems: [valid],
      rejectedCount: 1,
    });
  });

  it("migrates legacy records and validates their URLs", () => {
    const legacy = { ...makeItem("legacy", "inbox"), note: undefined, finishedAt: undefined };
    localStorage.setItem(ITEM_STORAGE_KEY, JSON.stringify([legacy]));

    expect(loadItems()).toMatchObject({ kind: "ready", needsMigration: true });
  });

  it("reports write failures", () => {
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(saveItems([])).toEqual({ ok: false, operation: "write" });
    setItem.mockRestore();
  });
});

describe("item reducer", () => {
  it("enforces desk capacity inside the transition", () => {
    const items = Array.from({ length: DESK_CAPACITY }, (_, index) =>
      makeItem(`desk-${index}`, "desk"));
    const candidate = makeItem("candidate", "inbox");
    const state = [...items, candidate];

    expect(itemReducer(state, { type: "moveToDesk", id: candidate.id })).toBe(state);
  });

  it("swaps atomically and permanently discards the displaced item", () => {
    const displaced = makeItem("old", "desk");
    const candidate = makeItem("new", "inbox");
    const result = itemReducer([displaced, candidate], {
      type: "swapAndDiscard",
      displacedId: displaced.id,
      candidateId: candidate.id,
    });

    expect(result.map((item) => item.id)).toEqual([candidate.id]);
    expect(result[0]?.status).toBe("desk");
  });

  it("sets and clears finishedAt through lifecycle transitions", () => {
    const item = makeItem("one", "desk");
    const finished = itemReducer([item], {
      type: "finish",
      id: item.id,
      finishedAt: "2026-08-22T10:00:00.000Z",
    });
    expect(finished[0]).toMatchObject({ status: "library", finishedAt: "2026-08-22T10:00:00.000Z" });

    const returned = itemReducer(finished, { type: "moveToInbox", id: item.id });
    expect(returned[0]).toMatchObject({ status: "inbox", finishedAt: null });
  });
});

describe("item selectors", () => {
  it("groups statuses and searches titles and URLs case-insensitively", () => {
    const desk = makeItem("desk", "desk", "Reading Notes");
    const inbox = makeItem("inbox", "inbox", "Another item");
    const groups = selectItemGroups([desk, inbox], "EXAMPLE.COM");

    expect(groups.deskItems).toEqual([desk]);
    expect(groups.visibleDeskItems).toEqual([desk]);
    expect(groups.visibleInboxItems).toEqual([inbox]);
  });
});

function makeItem(id: string, status: ItemStatus, title = id): Item {
  const url = parseItemUrl(`https://example.com/${id}`);
  if (url === null) throw new Error("test URL should be valid");
  return {
    id,
    title,
    url,
    type: "article",
    status,
    addedAt: "2026-08-22T00:00:00.000Z",
    finishedAt: status === "library" ? "2026-08-22T01:00:00.000Z" : null,
    note: null,
  };
}
