import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../../shared/item";
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
  vi.resetAllMocks();
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
  it("keeps capture available while a lifecycle mutation is pending", async () => {
    const movement = deferred<Item>();
    const creation = deferred<Item>();
    api.moveItemToDesk.mockReturnValue(movement.promise);
    api.createItem.mockReturnValue(creation.promise);

    let movePromise: Promise<Item | null> | null = null;
    let addPromise: Promise<Item | null> | null = null;
    await act(async () => {
      movePromise = getLibrary().moveToDesk(item.id);
      await Promise.resolve();
      addPromise = getLibrary().addItem({
        title: item.title,
        url: item.url,
        type: item.type,
      });
      await Promise.resolve();
    });

    expect(getLibrary().pendingAction).toEqual({ kind: "move-to-desk", itemId: item.id });
    expect(getLibrary().capturePending).toBe(true);
    expect(api.moveItemToDesk).toHaveBeenCalledOnce();
    expect(api.createItem).toHaveBeenCalledOnce();

    await act(async () => {
      creation.resolve(item);
      await addPromise;
    });
    expect(getLibrary().capturePending).toBe(false);
    expect(getLibrary().pendingAction).toEqual({ kind: "move-to-desk", itemId: item.id });

    await act(async () => {
      movement.resolve({ ...item, status: "desk" });
      await movePromise;
    });
    expect(getLibrary().pendingAction).toBeNull();
    expect(getLibrary().items).toEqual([{ ...item, status: "desk" }]);
  });

  it("prevents a second conflicting lifecycle mutation", async () => {
    const movement = deferred<Item>();
    api.moveItemToDesk.mockReturnValue(movement.promise);

    let movePromise: Promise<Item | null> | null = null;
    await act(async () => {
      movePromise = getLibrary().moveToDesk(item.id);
      await Promise.resolve();
    });

    let secondResult: Item | null = item;
    await act(async () => {
      secondResult = await getLibrary().finish(item.id);
    });

    expect(secondResult).toBeNull();
    expect(api.finishItem).not.toHaveBeenCalled();
    expect(getLibrary().pendingAction).toEqual({ kind: "move-to-desk", itemId: item.id });

    await act(async () => {
      movement.resolve({ ...item, status: "desk" });
      await movePromise;
    });
  });

  it("prevents duplicate add submissions and reports add loading state", async () => {
    const creation = deferred<Item>();
    api.createItem.mockReturnValue(creation.promise);

    let firstAdd: Promise<Item | null> | null = null;
    let secondResult: Item | null = item;
    await act(async () => {
      firstAdd = getLibrary().addItem({ title: item.title, url: item.url, type: item.type });
      await Promise.resolve();
      secondResult = await getLibrary().addItem({ title: item.title, url: item.url, type: item.type });
    });

    expect(secondResult).toBeNull();
    expect(api.createItem).toHaveBeenCalledOnce();
    expect(getLibrary().capturePending).toBe(true);

    await act(async () => {
      creation.resolve(item);
      await firstAdd;
    });
    expect(getLibrary().capturePending).toBe(false);
    expect(getLibrary().pendingAction).toBeNull();
    expect(getLibrary().items).toEqual([item]);
  });

  it("clears capture pending state after a failed add", async () => {
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
    expect(getLibrary().capturePending).toBe(false);
    expect(getLibrary().pendingAction).toBeNull();
    expect(getLibrary().error).toBe("Could not save item.");
  });
});

describe("useItemLibrary reconciliation", () => {
  it("inserts new server items and updates existing server items without reloading", async () => {
    await act(async () => {
      getLibrary().reconcileItem(item);
    });
    expect(getLibrary().items).toEqual([item]);

    const updatedItem: Item = {
      ...item,
      title: "Updated captured title",
      status: "library",
      finishedAt: "2026-08-24T12:00:00.000Z",
    };
    await act(async () => {
      getLibrary().reconcileItem(updatedItem);
    });

    expect(getLibrary().items).toEqual([updatedItem]);
    expect(api.fetchItems).toHaveBeenCalledOnce();
  });

  it("does not let an initial fetch overwrite a capture during a silent refresh", async () => {
    const initialFetch = deferred<Item[]>();
    const silentFetch = deferred<Item[]>();
    api.fetchItems.mockReset();
    api.fetchItems.mockReturnValueOnce(initialFetch.promise).mockReturnValueOnce(silentFetch.promise);

    await act(async () => {
      root?.unmount();
      document.body.replaceChildren();
      const container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      root.render(createElement(Probe));
      await Promise.resolve();
    });

    await act(async () => {
      getLibrary().reconcileItem(item);
      getLibrary().refreshSilently();
      await Promise.resolve();
    });
    expect(api.fetchItems).toHaveBeenCalledTimes(2);

    await act(async () => {
      initialFetch.resolve([{ ...item, title: "Stale library response" }]);
      silentFetch.resolve([item]);
      await Promise.all([initialFetch.promise, silentFetch.promise]);
    });

    expect(getLibrary().items).toEqual([item]);
    expect(getLibrary().loading).toBe(false);
  });

  it("does not let a silent refresh overwrite a newer lifecycle response", async () => {
    const silentFetch = deferred<Item[]>();
    const movement = deferred<Item>();
    api.fetchItems.mockReturnValue(silentFetch.promise);
    api.moveItemToDesk.mockReturnValue(movement.promise);

    await act(async () => {
      getLibrary().reconcileItem(item);
      getLibrary().refreshSilently();
      await Promise.resolve();
    });
    let movePromise: Promise<Item | null> | null = null;
    await act(async () => {
      movePromise = getLibrary().moveToDesk(item.id);
      await Promise.resolve();
    });

    await act(async () => {
      silentFetch.resolve([{ ...item, status: "inbox" }]);
      movement.resolve({ ...item, status: "desk" });
      await Promise.all([silentFetch.promise, movePromise]);
    });

    expect(getLibrary().items).toEqual([{ ...item, status: "desk" }]);
  });
});
