import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemListItem } from "../../shared/item";
import { LibrarySection } from "../../src/components/LibrarySection";
import { validUrl } from "./testUrl";

let root: Root | null = null;

const libraryItem: ItemListItem = {
  id: "library-1",
  title: "How AI is changing software development",
  url: validUrl("https://www.theverge.com/story"),
  type: "article",
  status: "library",
  addedAt: "2026-08-10T12:00:00.000Z",
  finishedAt: "2026-09-12T12:00:00.000Z",
  note: "A useful note about the article.",
  metadataSummary: {
    imageUrl: "https://images.example.com/article.jpg",
    imageKind: "article-image",
    siteName: "The Verge",
    author: "Nilay Patel",
  },
};

function renderLibrary(items: ItemListItem[]) {
  root?.render(createElement(LibrarySection, {
    items,
    onSendToDesk: vi.fn().mockResolvedValue(false),
    onSendToInbox: vi.fn().mockResolvedValue(false),
    pendingAction: null,
  }));
}

beforeEach(() => {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("LibrarySection", () => {
  it("renders a dense media row with retrieval metadata and overflow actions", async () => {
    await act(async () => renderLibrary([libraryItem]));

    expect(document.querySelector(".library-item.has-visual")).not.toBeNull();
    expect(document.querySelector(".item-visual--article-image img")?.getAttribute("loading"))
      .toBe("lazy");
    expect(document.querySelector(".library-item-title")?.textContent)
      .toBe("How AI is changing software development");
    expect(document.querySelector(".library-item .item-source-line")?.textContent).toBe("The Verge");
    expect(document.querySelector(".library-item .item-source-line a")?.getAttribute("href"))
      .toBe("https://www.theverge.com/story");
    expect(document.querySelector(".library-item .item-source-line .site-favicon")?.getAttribute("src"))
      .toBe("/api/favicon?host=www.theverge.com");
    expect(document.querySelector(".library-item-finished")?.textContent)
      .toBe("Finished Sep 12");
    expect(document.querySelector(".library-item-note")?.textContent)
      .toBe("A useful note about the article.");
    expect(document.querySelector(".library-menu-trigger")?.getAttribute("aria-label"))
      .toBe("More actions for How AI is changing software development");
    expect(document.querySelector(".library-item .pill-button")).toBeNull();
  });

  it("marks YouTube thumbnails with a decorative play cue", async () => {
    const video: ItemListItem = {
      ...libraryItem,
      id: "library-video",
      title: "Building a Database From Scratch",
      url: validUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      type: "video",
      note: null,
      metadataSummary: {
        imageUrl: "https://images.example.com/video.jpg",
        imageKind: "thumbnail",
        siteName: "YouTube",
        author: "Tsoding",
      },
    };

    await act(async () => renderLibrary([video]));

    expect(document.querySelector(".item-visual-play")).not.toBeNull();
    expect(document.querySelector(".item-source-line")?.textContent).toBe("Tsoding");
    expect(document.querySelector(".item-source-line a")).toBeNull();
    expect(document.querySelector(".site-favicon")?.getAttribute("src"))
      .toBe("/api/favicon?host=www.youtube.com");
  });

  it("uses a portrait visual slot for books and no slot when metadata has no image", async () => {
    const book = {
      ...libraryItem,
      id: "library-book",
      title: "The Beginning of Infinity",
      type: "book" as const,
      note: null,
      metadataSummary: {
        imageUrl: "https://images.example.com/book.jpg",
        imageKind: "cover" as const,
        siteName: null,
        author: "David Deutsch",
      },
    };
    const noImage = { ...libraryItem, id: "library-no-image", metadataSummary: null };

    await act(async () => renderLibrary([book, noImage]));

    expect(document.querySelector(".item-visual--cover")).not.toBeNull();
    expect(document.querySelector(".library-item:not(.has-visual)")).not.toBeNull();
    expect(document.querySelectorAll(".library-item .item-visual")).toHaveLength(1);
  });

  it("keeps the reserved media space when an image fails", async () => {
    await act(async () => renderLibrary([libraryItem]));
    const image = document.querySelector<HTMLImageElement>(".library-item .item-visual img");
    expect(image).not.toBeNull();

    await act(async () => {
      image?.dispatchEvent(new Event("error"));
    });

    expect(document.querySelector(".library-item .item-visual[data-image-state=broken]")).not.toBeNull();
    expect(document.querySelector(".library-item .item-visual img")).toBeNull();
  });
});
