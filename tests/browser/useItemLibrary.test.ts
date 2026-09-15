import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseItemUrl, type Item, type ItemListItem } from "../../shared/item";
import { useItemLibrary, type ItemLibrary } from "../../src/useItemLibrary";

const api = vi.hoisted(() => ({
  createItem: vi.fn(),
  captureUrl: vi.fn(),
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

const item: ItemListItem = {
  id: "item-1",
  title: "A useful article",
  url: null,
  type: "article",
  status: "inbox",
  addedAt: "2026-08-23T12:00:00.000Z",
  finishedAt: null,
  note: null,
  metadataSummary: null,
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
  let rejectPromise: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
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
  Reflect.deleteProperty(document, "startViewTransition");
  vi.unstubAllGlobals();
});

describe("useItemLibrary mutation state", () => {
  it.each([
    ["moveToDesk", "moveItemToDesk", "desk"],
    ["moveToInbox", "moveItemToInbox", "inbox"],
    ["finish", "finishItem", "library"],
  ] as const)("%s updates before the response and uses the server timestamp", async (method, apiMethod, status) => {
    const movement = deferred<Item>();
    api[apiMethod].mockReturnValue(movement.promise);
    const original = { ...item, status: "library" as const, finishedAt: "2026-08-20T12:00:00.000Z" };
    await act(async () => getLibrary().reconcileItem(original));
    let result!: Promise<Item | null>;
    await act(async () => { result = getLibrary()[method](item.id); });
    expect(getLibrary().items[0].status).toBe(status);
    expect(getLibrary().pendingAction).not.toBeNull();
    if (status === "library") expect(getLibrary().items[0].finishedAt).not.toBe(original.finishedAt);
    else expect(getLibrary().items[0].finishedAt).toBeNull();
    const finishedAt = status === "library" ? "2026-08-25T12:00:00.000Z" : null;
    await act(async () => {
      movement.resolve({ ...original, status, finishedAt });
      await result;
    });
    expect(getLibrary().items[0]).toMatchObject({ status, finishedAt });
    expect(getLibrary().pendingAction).toBeNull();
  });

  it.each([true, false])("starts persistence before the visual commit and handles an early response (success: %s)", async (succeeds) => {
    await act(async () => getLibrary().reconcileItem(item));
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const commits: Array<() => void> = [];
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (update: () => void) => ({
        updateCallbackDone: new Promise<void>((resolve) => { commits.push(() => { update(); resolve(); }); }),
      }),
    });
    if (succeeds) api.moveItemToDesk.mockResolvedValue({ ...item, status: "desk" });
    else api.moveItemToDesk.mockRejectedValue(new Error("Move failed"));
    let result!: Promise<Item | null>;
    await act(async () => { result = getLibrary().moveToDesk(item.id); });
    expect(api.moveItemToDesk).toHaveBeenCalledOnce();
    expect(getLibrary().items[0].status).toBe("inbox");
    expect(getLibrary().pendingAction).not.toBeNull();
    expect(commits).toHaveLength(1);
    await act(async () => { commits[0](); });
    if (!succeeds) {
      expect(commits).toHaveLength(2);
      expect(getLibrary().items[0].status).toBe("desk");
      await act(async () => { commits[1](); });
    }
    await act(async () => { await result; });
    expect(getLibrary().items[0].status).toBe(succeeds ? "desk" : "inbox");
    expect(getLibrary().pendingAction).toBeNull();
  });

  it("rolls back lifecycle fields without losing concurrent metadata or captures", async () => {
    const movement = deferred<Item>();
    api.moveItemToDesk.mockReturnValue(movement.promise);
    await act(async () => getLibrary().reconcileItem(item));
    let result!: Promise<Item | null>;
    await act(async () => { result = getLibrary().moveToDesk(item.id); });
    await act(async () => {
      getLibrary().reconcileItemMetadata({ ...item, title: "Enriched title" }, null);
      getLibrary().reconcileItem({ ...item, id: "new-capture" });
    });
    await act(async () => {
      movement.reject(new Error("Your desk is full."));
      await result;
    });
    expect(getLibrary().items).toEqual([
      { ...item, id: "new-capture" },
      { ...item, title: "Enriched title" },
    ]);
    expect(getLibrary().error).toBe("Your desk is full.");
    expect(getLibrary().pendingAction).toBeNull();
  });

  it("preserves newer metadata when the lifecycle response arrives", async () => {
    const movement = deferred<Item>();
    api.moveItemToDesk.mockReturnValue(movement.promise);
    await act(async () => getLibrary().reconcileItem(item));
    let result!: Promise<Item | null>;
    await act(async () => { result = getLibrary().moveToDesk(item.id); });
    await act(async () => getLibrary().reconcileItemMetadata({ ...item, title: "Enriched title" }, null));
    await act(async () => {
      movement.resolve({ ...item, status: "desk" });
      await result;
    });
    expect(getLibrary().items[0]).toMatchObject({ title: "Enriched title", status: "desk" });
  });

  it("keeps the swap locked until its single transition commits", async () => {
    const displaced = { ...item, id: "displaced", status: "desk" as const };
    await act(async () => {
      getLibrary().reconcileItem(item);
      getLibrary().reconcileItem(displaced);
    });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    let callback!: () => void;
    const transition = vi.fn((update: () => void) => ({
      updateCallbackDone: new Promise<void>((resolve) => { callback = () => { update(); resolve(); }; }),
    }));
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: transition });
    api.swapItems.mockResolvedValue({ item: { ...item, status: "desk" }, displacedId: displaced.id });
    let result!: Promise<Item | null>;
    await act(async () => { result = getLibrary().swap(item.id, displaced.id); });
    expect(getLibrary().pendingAction).not.toBeNull();
    expect(getLibrary().items).toHaveLength(2);
    await act(async () => { callback(); await result; });
    expect(transition).toHaveBeenCalledOnce();
    expect(getLibrary().items).toEqual([{ ...item, status: "desk" }]);
    expect(getLibrary().pendingAction).toBeNull();
  });

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

  it("keeps a lifecycle mutation independent from URL capture", async () => {
    const movement = deferred<Item>();
    const capture = deferred<{ item: Item; created: boolean }>();
    api.moveItemToDesk.mockReturnValue(movement.promise);
    api.captureUrl.mockReturnValue(capture.promise);

    let movePromise: Promise<Item | null> | null = null;
    let capturePromise: Promise<{ item: Item; created: boolean } | null> | null = null;
    await act(async () => {
      getLibrary().reconcileItem(item);
      movePromise = getLibrary().moveToDesk(item.id);
      await Promise.resolve();
      capturePromise = getLibrary().captureUrl({ url: "https://example.com/article" });
      await Promise.resolve();
    });

    expect(getLibrary().pendingAction).toEqual({ kind: "move-to-desk", itemId: item.id });
    expect(getLibrary().capturePending).toBe(true);
    expect(api.moveItemToDesk).toHaveBeenCalledOnce();
    expect(api.captureUrl).toHaveBeenCalledOnce();

    const capturedUrl = parseItemUrl("https://example.com/article");
    if (capturedUrl === null) throw new Error("Test URL should be valid.");
    const capturedItem = { ...item, id: "item-2", url: capturedUrl };
    await act(async () => {
      capture.resolve({ item: capturedItem, created: true });
      await capturePromise;
    });
    expect(getLibrary().capturePending).toBe(false);
    expect(getLibrary().pendingAction).toEqual({ kind: "move-to-desk", itemId: item.id });
    expect(getLibrary().items).toEqual([capturedItem, { ...item, status: "desk" }]);

    await act(async () => {
      movement.resolve({ ...item, status: "desk" });
      await movePromise;
    });
    expect(getLibrary().items).toEqual([capturedItem, { ...item, status: "desk" }]);
  });

  it("prevents simultaneous URL captures", async () => {
    const capture = deferred<{ item: Item; created: boolean }>();
    api.captureUrl.mockReturnValue(capture.promise);

    let firstCapture: Promise<{ item: Item; created: boolean } | null> | null = null;
    let secondResult: { item: Item; created: boolean } | null = { item, created: true };
    await act(async () => {
      firstCapture = getLibrary().captureUrl({ url: "https://example.com/article" });
      await Promise.resolve();
      secondResult = await getLibrary().captureUrl({ url: "https://example.com/article" });
    });

    expect(secondResult).toBeNull();
    expect(api.captureUrl).toHaveBeenCalledOnce();
    expect(getLibrary().capturePending).toBe(true);

    await act(async () => {
      capture.resolve({ item, created: true });
      await firstCapture;
    });
    expect(getLibrary().capturePending).toBe(false);
  });
});

describe("useItemLibrary reconciliation", () => {
  it("preserves array and item identity for unchanged metadata", async () => {
    await act(async () => getLibrary().reconcileItem(item));
    const before = getLibrary().items;
    await act(async () => getLibrary().reconcileItemMetadata(item, null));
    expect(getLibrary().items).toBe(before);
    expect(getLibrary().items[0]).toBe(before[0]);
    await act(async () => getLibrary().reconcileItemMetadata({ ...item, id: "removed" }, null));
    expect(getLibrary().items).toBe(before);
  });

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

  it("updates metadata without overwriting lifecycle fields", async () => {
    const deskItem = { ...item, status: "desk" as const, note: "Keep this note." };
    await act(async () => {
      getLibrary().reconcileItem(deskItem);
      getLibrary().reconcileItemMetadata({
        id: item.id,
        title: "Enriched title",
        type: "video",
      }, {
        sourceUrl: "https://example.com/article",
        sourceTitle: "Enriched title",
        author: "Reader Test",
        siteName: "Example",
        description: null,
        visual: { kind: "thumbnail", url: "https://example.com/image.jpg" },
        inference: { type: "video", source: "schema" },
        enrichment: { kind: "ready", enrichedAt: "2026-08-24T12:00:00.000Z" },
      });
    });

    expect(getLibrary().items).toEqual([{
      ...deskItem,
      title: "Enriched title",
      type: "video",
      metadataSummary: {
        imageUrl: "https://example.com/image.jpg",
        imageKind: "thumbnail",
        siteName: "Example",
        author: "Reader Test",
      },
    }]);
  });

  it("allows a retry to complete after an unchanged metadata poll", async () => {
    await act(async () => getLibrary().reconcileItem(item));
    const retry = deferred<Item[]>();
    api.fetchItems.mockReturnValue(retry.promise);
    await act(async () => getLibrary().retry());
    expect(getLibrary().loading).toBe(true);
    await act(async () => getLibrary().reconcileItemMetadata(item, null));
    await act(async () => {
      retry.resolve([{ ...item, note: "Loaded by retry" }]);
      await retry.promise;
    });
    expect(getLibrary().items[0].note).toBe("Loaded by retry");
    expect(getLibrary().loading).toBe(false);
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
