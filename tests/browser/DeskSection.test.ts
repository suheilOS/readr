import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemListItem } from "../../shared/item";
import { selectItemGroups } from "../../src/itemSelectors";
import { DeskSection } from "../../src/components/DeskSection";
import { validUrl } from "./testUrl";

let root: Root | null = null;

const deskItems: ItemListItem[] = Array.from({ length: 5 }, (_, index) => ({
  id: `desk-${index + 1}`,
  title: `Desk item ${index + 1}`,
  url: null,
  type: "article",
  status: "desk",
  addedAt: "2026-08-23T12:00:00.000Z",
  finishedAt: null,
  note: null,
  metadataSummary: null,
}));

function renderDesk(items: ItemListItem[], mode: "normal" | "swap", deskCount = 5, onCancelSwap = vi.fn()) {
  root?.render(createElement(DeskSection, {
    items,
    deskCount,
    mode,
    onFinish: vi.fn().mockResolvedValue(false),
    onSendToInbox: vi.fn().mockResolvedValue(false),
    onDiscard: vi.fn(),
    onRead: vi.fn(),
    onSelectSwapTarget: vi.fn().mockResolvedValue(false),
    onCancelSwap,
    pendingAction: null,
  }));
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
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

describe("DeskSection", () => {
  it("shows all five actual desk items for replacement when search has no desk matches", async () => {
    const groups = selectItemGroups([
      ...deskItems,
      {
        id: "candidate",
        title: "Candidate from inbox",
        url: null,
        type: "article",
        status: "inbox",
        addedAt: "2026-08-23T12:00:00.000Z",
        finishedAt: null,
        note: null,
        metadataSummary: null,
      },
    ], "candidate");

    expect(groups.deskItems).toHaveLength(5);
    expect(groups.visibleDeskItems).toHaveLength(0);

    await act(async () => renderDesk(groups.deskItems, "swap", groups.deskItems.length));

    expect(document.querySelectorAll(".desk-card.swappable")).toHaveLength(5);
    expect(document.querySelector(".swap-banner")?.textContent).toContain("Desk is full");
  });

  it("shows all desk items for replacement when search has some desk matches", async () => {
    const groups = selectItemGroups(deskItems, "Desk item 2");

    expect(groups.visibleDeskItems).toHaveLength(1);

    await act(async () => renderDesk(groups.deskItems, "swap", groups.deskItems.length));

    expect(document.querySelectorAll(".desk-card.swappable")).toHaveLength(5);
    expect(document.querySelector(".desk-card.swappable")?.textContent).toContain("Desk item 1");
  });

  it("keeps the attention budget counter independent from filtered desk results", async () => {
    await act(async () => renderDesk([deskItems[0]], "normal", deskItems.length));

    expect(document.querySelector(".counter")?.textContent).toBe("5 / 5");
    expect(document.querySelectorAll(".desk-card")).toHaveLength(1);
    expect(document.querySelector(".card-title")?.textContent).toBe("Desk item 1");
  });

  it("renders stored visual metadata without changing the card actions", async () => {
    const item = {
      ...deskItems[0],
      url: validUrl("https://example.com/article"),
      metadataSummary: {
        imageUrl: "https://example.com/article.jpg",
        imageKind: "article-image" as const,
        siteName: "Example",
        author: "Reader Test",
      },
    };

    await act(async () => renderDesk([item], "normal", deskItems.length));

    expect(document.querySelector(".desk-card .item-visual img")?.getAttribute("loading")).toBe("lazy");
    expect(document.querySelector(".desk-card .item-source-line")?.textContent).toBe("Example");
    expect(document.querySelector(".desk-card .item-source-line a")?.getAttribute("href"))
      .toBe("https://example.com/article");
    expect(document.querySelector(".desk-card .item-source-line .site-favicon")?.getAttribute("src"))
      .toBe("/api/favicon?host=example.com");
    expect(document.querySelector(".desk-card .pill-button")?.textContent).toContain("Read");
    expect(document.querySelector(".finish-button")?.textContent).toContain("Finish");
  });

  it("keeps the reserved visual space when an image fails", async () => {
    const item = {
      ...deskItems[0],
      metadataSummary: {
        imageUrl: "https://example.com/broken.jpg",
        imageKind: "thumbnail" as const,
        siteName: "Example",
        author: null,
      },
    };

    await act(async () => renderDesk([item], "normal", deskItems.length));
    const image = document.querySelector<HTMLImageElement>(".desk-card .item-visual img");
    expect(image).not.toBeNull();

    await act(async () => {
      image?.dispatchEvent(new Event("error"));
    });

    expect(document.querySelector(".desk-card .item-visual[data-image-state=broken]")).not.toBeNull();
    expect(document.querySelector(".desk-card .item-visual img")).toBeNull();
  });

  it("returns to normal filtered rendering when swap is cancelled", async () => {
    const onCancelSwap = vi.fn();
    await act(async () => renderDesk(deskItems, "swap", deskItems.length, onCancelSwap));
    document.querySelector<HTMLButtonElement>(".inline-link-button")?.click();
    expect(onCancelSwap).toHaveBeenCalledOnce();

    await act(async () => renderDesk([deskItems[2]], "normal", deskItems.length, onCancelSwap));

    expect(document.querySelectorAll(".desk-card.swappable")).toHaveLength(0);
    expect(document.querySelector(".card-title")?.textContent).toBe("Desk item 3");
    expect(document.querySelector(".swap-banner")).toBeNull();
    expect(document.querySelector(".counter")?.textContent).toBe("5 / 5");
  });
});
