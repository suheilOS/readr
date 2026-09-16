import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import type { ItemListItem, ItemStatus, ItemType } from "../../shared/item";
import type { ItemLibrary } from "../../src/useItemLibrary";

const mocks = vi.hoisted(() => {
  const route = {
    readerItemId: null,
    openReaderRoute: vi.fn(),
    closeReaderRoute: vi.fn(),
  };
  const watch = vi.fn();

  return {
    useItemLibrary: vi.fn(),
    useReaderRoute: vi.fn(() => route),
    useEnrichmentRefresh: vi.fn(() => ({ watch })),
    useExtensionCapture: vi.fn(),
  };
});

vi.mock("../../src/useItemLibrary", () => ({ useItemLibrary: mocks.useItemLibrary }));
vi.mock("../../src/useReaderRoute", () => ({ useReaderRoute: mocks.useReaderRoute }));
vi.mock("../../src/useEnrichmentRefresh", () => ({ useEnrichmentRefresh: mocks.useEnrichmentRefresh }));
vi.mock("../../src/useExtensionCapture", () => ({ useExtensionCapture: mocks.useExtensionCapture }));
vi.mock("../../src/notifications", () => ({ notify: vi.fn() }));


let root: Root | null = null;

function item(
  id: string,
  title: string,
  status: ItemStatus,
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

function createLibrary(items: ItemListItem[]): ItemLibrary {
  return {
    items,
    loading: false,
    pendingAction: null,
    capturePending: false,
    error: null,
    unauthenticated: false,
    retry: vi.fn(),
    refreshSilently: vi.fn(),
    addItem: vi.fn().mockResolvedValue(null),
    captureUrl: vi.fn().mockResolvedValue(null),
    captureUrlWithError: vi.fn(),
    reconcileItem: vi.fn(),
    reconcileItemMetadata: vi.fn(),
    moveToDesk: vi.fn().mockResolvedValue(null),
    moveToInbox: vi.fn().mockResolvedValue(null),
    finish: vi.fn().mockResolvedValue(null),
    discard: vi.fn().mockResolvedValue(false),
    swap: vi.fn().mockResolvedValue(null),
  };
}

function renderApp(items: ItemListItem[]): void {
  mocks.useItemLibrary.mockReturnValue(createLibrary(items));
  root?.render(createElement(App));
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("Input value setter is unavailable.");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  localStorage.clear();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("App browse controls", () => {
  it("filters each rendered section by the selected type", async () => {
    await act(async () => renderApp([
      item("desk-article", "Desk article", "desk", "article", "2026-08-23T12:00:00.000Z"),
      item("desk-book", "Desk book", "desk", "book", "2026-08-22T12:00:00.000Z"),
      item("inbox-article", "Inbox article", "inbox", "article", "2026-08-21T12:00:00.000Z"),
      item("inbox-book", "Inbox book", "inbox", "book", "2026-08-20T12:00:00.000Z"),
      item("library-article", "Library article", "library", "article", "2026-08-19T12:00:00.000Z"),
      item("library-book", "Library book", "library", "book", "2026-08-18T12:00:00.000Z"),
    ]));

    const filterButton = document.querySelector<HTMLButtonElement>("[aria-label='Filter items']");
    expect(filterButton).not.toBeNull();
    await act(async () => filterButton?.click());

    const bookFilter = document.querySelector<HTMLInputElement>("input[name='item-filter-book']");
    expect(bookFilter).not.toBeNull();
    await act(async () => bookFilter?.click());

    expect(document.querySelectorAll(".desk-card")).toHaveLength(1);
    expect(document.querySelector(".desk .card-title")?.textContent).toBe("Desk book");
    expect(document.querySelectorAll(".inbox .row")).toHaveLength(1);
    expect(document.querySelector(".inbox .row-title")?.textContent).toBe("Inbox book");
    expect(document.querySelectorAll(".library-item")).toHaveLength(1);
    expect(document.querySelector(".library-item-title")?.textContent).toBe("Library book");
  });

  it("sorts the section contents through the shared browse state", async () => {
    await act(async () => renderApp([
      item("inbox-z", "Zulu", "inbox", "article", "2026-08-20T12:00:00.000Z"),
      item("inbox-a", "Alpha", "inbox", "article", "2026-08-23T12:00:00.000Z"),
      item("library-z", "Zulu finished", "library", "article", "2026-08-19T12:00:00.000Z"),
      item("library-a", "Alpha finished", "library", "article", "2026-08-18T12:00:00.000Z"),
    ]));

    const sortButton = document.querySelector<HTMLButtonElement>("[aria-label='Sort items: Newest added']");
    expect(sortButton).not.toBeNull();
    await act(async () => sortButton?.click());

    const titleDescending = document.querySelector<HTMLInputElement>("input[type='radio'][value='title-desc']");
    expect(titleDescending).not.toBeNull();
    await act(async () => titleDescending?.click());

    expect(Array.from(document.querySelectorAll(".inbox .row-title")).map((node) => node.textContent))
      .toEqual(["Zulu", "Alpha"]);
    expect(Array.from(document.querySelectorAll(".library-item-title")).map((node) => node.textContent))
      .toEqual(["Zulu finished", "Alpha finished"]);
  });

  it("describes and clears a combined search and type filter with no matches", async () => {
    await act(async () => renderApp([
      item("article", "React article", "inbox", "article", "2026-08-23T12:00:00.000Z"),
      item("video", "React video", "library", "video", "2026-08-22T12:00:00.000Z"),
    ]));

    const filterButton = document.querySelector<HTMLButtonElement>("[aria-label='Filter items']");
    await act(async () => filterButton?.click());
    const articleFilter = document.querySelector<HTMLInputElement>("input[name='item-filter-article']");
    await act(async () => articleFilter?.click());

    const searchInput = document.querySelector<HTMLInputElement>(".search-input");
    expect(searchInput).not.toBeNull();
    await act(async () => setInputValue(searchInput as HTMLInputElement, "Video"));

    expect(document.querySelector(".search-empty")?.textContent)
      .toContain("No items match both “Video” and the selected filters.");
    expect(document.querySelector(".search-empty .empty-state-icon svg")).not.toBeNull();
    const clearButton = document.querySelector<HTMLButtonElement>(".search-empty .inline-link-button");
    expect(clearButton?.textContent).toBe("Clear search and filters");

    await act(async () => clearButton?.click());

    expect(document.querySelector(".search-empty")).toBeNull();
    expect(document.querySelectorAll(".inbox .row")).toHaveLength(1);
    expect(document.querySelectorAll(".library-item")).toHaveLength(1);
  });

  it("uses the full desk inventory while replacing a filtered-out desk view", async () => {
    const deskItems = Array.from({ length: 5 }, (_, index) => item(
      `desk-${index + 1}`,
      `Desk item ${index + 1}`,
      "desk",
      "article",
      "2026-08-23T12:00:00.000Z",
    ));
    const candidate = item("candidate", "Candidate from inbox", "inbox", "article", "2026-08-24T12:00:00.000Z");

    await act(async () => renderApp([...deskItems, candidate]));

    const searchInput = document.querySelector<HTMLInputElement>(".search-input");
    await act(async () => setInputValue(searchInput as HTMLInputElement, "Candidate"));
    expect(document.querySelectorAll(".desk-card")).toHaveLength(0);

    const moveButton = document.querySelector<HTMLButtonElement>("[aria-label='Move to desk: Candidate from inbox']");
    expect(moveButton).not.toBeNull();
    await act(async () => moveButton?.click());

    expect(document.querySelector(".swap-banner")?.textContent).toContain("Desk is full");
    expect(document.querySelectorAll(".desk-card.swappable")).toHaveLength(5);
  });
});
