import { describe, expect, it } from "vitest";
import {
  isItemStatus,
  isItemType,
  isItemUrl,
  parseItem,
  parseItemUrl,
} from "../../shared/item";

describe("shared item validation", () => {
  it("accepts only the canonical item types and statuses", () => {
    expect(isItemType("article")).toBe(true);
    expect(isItemType("newsletter")).toBe(false);
    expect(isItemStatus("library")).toBe(true);
    expect(isItemStatus("archived")).toBe(false);
  });

  it("normalizes valid item URLs", () => {
    expect(parseItemUrl("  HTTPS://WWW.Example.com/path  ")).toBe(
      "https://www.example.com/path",
    );
    expect(isItemUrl("https://example.com/article")).toBe(true);
    expect(isItemUrl(" HTTPS://Example.com/article ")).toBe(false);
  });

  it.each([
    "",
    "not a URL",
    "ftp://example.com/file",
    "https://user@example.com/private",
    "https://user:secret@example.com/private",
  ])("rejects an invalid item URL: %s", (value) => {
    expect(parseItemUrl(value)).toBeNull();
    expect(isItemUrl(value)).toBe(false);
  });

  it("parses and normalizes an item at a runtime boundary", () => {
    expect(parseItem({
      id: "item-1",
      title: "An article",
      url: " HTTPS://Example.com/read ",
      type: "article",
      status: "inbox",
      addedAt: "2026-08-23T12:00:00.000Z",
      finishedAt: null,
      note: null,
    })).toEqual({
      id: "item-1",
      title: "An article",
      url: "https://example.com/read",
      type: "article",
      status: "inbox",
      addedAt: "2026-08-23T12:00:00.000Z",
      finishedAt: null,
      note: null,
    });
  });

  it("rejects an item with an invalid domain field", () => {
    expect(parseItem({
      id: "item-1",
      title: "An article",
      url: "https://example.com/read",
      type: "newsletter",
      status: "inbox",
      addedAt: "2026-08-23T12:00:00.000Z",
      finishedAt: null,
      note: null,
    })).toBeNull();
  });
});
