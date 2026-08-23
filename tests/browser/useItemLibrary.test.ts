import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../../src/item";
import { useItemLibrary, type ItemLibrary } from "../../src/useItemLibrary";

const api = vi.hoisted(() => ({
  createItem: vi.fn(),
  discardItem: vi.fn(),
  fetchItems: vi.fn(),
  finishItem: vi.fn(),
  moveItemToDesk: vi.fn(),
  moveItemToInbox: vi.fn(),
  swapItems: vi.fn(),
}));

vi.mock("../../src/itemApi", () => ({
  ...api,
  ItemApiError: class ItemApiError extends Error {
    status = 500;
  },
}));

const item: Item = {
  id: "item-1",
  title: "A useful article",
  url: null,
  type: "article",
  status: "inbox",
  addedAt: "2026-08-23T12:00:00.000Z",
  finishedAt: null,
  note: null,
};

let currentLibrary: ItemLibrary | null = null;
let root: Root | null = null;

function Probe() {
  currentLibrary = useItemLibrary();
  return createElement("span", null, currentLibrary.pendingAction?.kind ?? "idle");
}

function getLibrary(): ItemLibrary {
  if (currentLibrary === null) throw new Error("Item library has not rendered.");
  return currentLibrary;
}

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

beforeEach(async () => {
  vi.clearAllMocks();
  api.fetchItems.mockResolvedValue([]);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(createElement(Probe));
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  currentLibrary = null;
  document.body.replaceChildren();
});

describe("useItemLibrary mutation state", () => {
  it("identifies the pending mutation and rejects overlapping work", async () => {
    const creation = deferred<Item>();
    api.createItem.mockReturnValue(creation.promise);

    let addPromise: Promise<Item | null> | null = null;
    await act(async () => {
      addPromise = getLibrary().addItem({
        title: item.title,
        url: item.url,
        type: item.type,
      });
      await Promise.resolve();
    });

    expect(getLibrary().pendingAction).toEqual({ kind: "add" });

    let discarded = true;
    await act(async () => {
      discarded = await getLibrary().discard("item-2");
    });

    expect(discarded).toBe(false);
    expect(api.discardItem).not.toHaveBeenCalled();

    await act(async () => {
      creation.resolve(item);
      await addPromise;
    });

    expect(getLibrary().pendingAction).toBeNull();
    expect(getLibrary().items).toEqual([item]);
  });

  it("clears pending state after a failed mutation", async () => {
    api.createItem.mockRejectedValue(new Error("Could not save item."));

    let result: Item | null = item;
    await act(async () => {
      result = await getLibrary().addItem({
        title: item.title,
        url: item.url,
        type: item.type,
      });
    });

    expect(result).toBeNull();
    expect(getLibrary().pendingAction).toBeNull();
    expect(getLibrary().error).toBe("Could not save item.");
  });
});
