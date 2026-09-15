import { describe, expect, it } from "vitest";
import type { ItemListItem, ItemType } from "../../shared/item";
import { selectItemGroups } from "../../src/itemSelectors";

function item(
  id: string,
  title: string,
  status: ItemListItem["status"],
  type: ItemType,
  addedAt: string,
): ItemListItem {
  return {
    id,
    title,
    url: null,
    type,
    status,
    addedAt,
    finishedAt: status === "library" ? "2026-08-24T12:00:00.000Z" : null,
    note: null,
    metadataSummary: null,
  };
}

describe("item selectors", () => {
  it("sorts every section by title", () => {
    const groups = selectItemGroups([
      item("library-z", "Zebra", "library", "book", "2026-08-23T12:00:00.000Z"),
      item("inbox-a", "Alpha", "inbox", "article", "2026-08-22T12:00:00.000Z"),
      item("desk-m", "Middle", "desk", "paper", "2026-08-21T12:00:00.000Z"),
      item("library-b", "beta", "library", "video", "2026-08-20T12:00:00.000Z"),
    ], "", { sort: "title-asc" });

    expect(groups.visibleDeskItems.map(({ id }) => id)).toEqual(["desk-m"]);
    expect(groups.visibleInboxItems.map(({ id }) => id)).toEqual(["inbox-a"]);
    expect(groups.visibleLibraryItems.map(({ id }) => id)).toEqual(["library-b", "library-z"]);
  });

  it("filters visible items by type while keeping the full desk inventory", () => {
    const groups = selectItemGroups([
      item("desk-article", "Article", "desk", "article", "2026-08-23T12:00:00.000Z"),
      item("desk-book", "Book", "desk", "book", "2026-08-22T12:00:00.000Z"),
      item("inbox-book", "Book to read", "inbox", "book", "2026-08-21T12:00:00.000Z"),
      item("library-article", "Finished article", "library", "article", "2026-08-20T12:00:00.000Z"),
    ], "", { types: ["article"] });

    expect(groups.deskItems.map(({ id }) => id)).toEqual(["desk-article", "desk-book"]);
    expect(groups.visibleDeskItems.map(({ id }) => id)).toEqual(["desk-article"]);
    expect(groups.visibleInboxItems).toEqual([]);
    expect(groups.visibleLibraryItems.map(({ id }) => id)).toEqual(["library-article"]);
  });

  it("keeps the newest-added order as the default", () => {
    const groups = selectItemGroups([
      item("older", "Older", "inbox", "article", "2026-08-20T12:00:00.000Z"),
      item("newer", "Newer", "inbox", "article", "2026-08-23T12:00:00.000Z"),
      item("same-time-b", "Same time B", "inbox", "article", "2026-08-22T12:00:00.000Z"),
      item("same-time-a", "Same time A", "inbox", "article", "2026-08-22T12:00:00.000Z"),
    ], "");

    expect(groups.visibleInboxItems.map(({ id }) => id)).toEqual([
      "newer",
      "same-time-b",
      "same-time-a",
      "older",
    ]);
  });

  it.each([
    ["added-desc", ["newer", "older"]],
    ["added-asc", ["older", "newer"]],
    ["title-asc", ["newer", "older"]],
    ["title-desc", ["older", "newer"]],
  ] as const)("supports %s sorting", (sort, expectedIds) => {
    const groups = selectItemGroups([
      item("older", "Zulu", "inbox", "article", "2026-08-20T12:00:00.000Z"),
      item("newer", "Alpha", "inbox", "article", "2026-08-23T12:00:00.000Z"),
    ], "", { sort });

    expect(groups.visibleInboxItems.map(({ id }) => id)).toEqual(expectedIds);
  });

  it("combines text and type filters", () => {
    const groups = selectItemGroups([
      item("article-match", "React article", "inbox", "article", "2026-08-23T12:00:00.000Z"),
      item("video-match", "React video", "inbox", "video", "2026-08-22T12:00:00.000Z"),
      item("article-other", "Other article", "inbox", "article", "2026-08-21T12:00:00.000Z"),
    ], "react", { types: ["article"] });

    expect(groups.visibleInboxItems.map(({ id }) => id)).toEqual(["article-match"]);
  });
});
