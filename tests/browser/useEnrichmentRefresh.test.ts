import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../../shared/item";
import { useEnrichmentRefresh, type EnrichmentRefresh } from "../../src/useEnrichmentRefresh";

const api = vi.hoisted(() => ({ fetchItemMetadata: vi.fn() }));

vi.mock("../../src/itemApi", () => ({
  fetchItemMetadata: api.fetchItemMetadata,
  ItemApiError: class ItemApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const item: Item = {
  id: "item-1",
  title: "Fallback title",
  url: "https://example.com/article",
  type: "article",
  status: "inbox",
  addedAt: "2026-08-23T12:00:00.000Z",
  finishedAt: null,
  note: null,
};

let root: Root | null = null;
let currentRefresh: EnrichmentRefresh | null = null;
let reconcileItemMetadata: ReturnType<typeof vi.fn>;

function Probe({ items }: { items: readonly Item[] }): ReactNode {
  currentRefresh = useEnrichmentRefresh(items, reconcileItemMetadata);
  return null;
}

function getRefresh(): EnrichmentRefresh {
  if (currentRefresh === null) throw new Error("Enrichment refresher has not rendered.");
  return currentRefresh;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  reconcileItemMetadata = vi.fn();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Probe, { items: [item] }));
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  currentRefresh = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("useEnrichmentRefresh", () => {
  it("reconciles a ready item without reloading the library", async () => {
    api.fetchItemMetadata
      .mockResolvedValueOnce({ item, metadata: { enrichment: { kind: "queued" } } })
      .mockResolvedValueOnce({
        item: { ...item, title: "Enriched title", type: "video" },
        metadata: { enrichment: { kind: "ready" } },
      });

    await act(async () => {
      getRefresh().watch(item.id);
      await Promise.resolve();
    });
    expect(api.fetchItemMetadata).toHaveBeenCalledOnce();
    expect(reconcileItemMetadata).toHaveBeenCalledWith(item);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(api.fetchItemMetadata).toHaveBeenCalledTimes(2);
    expect(reconcileItemMetadata).toHaveBeenLastCalledWith({
      ...item,
      title: "Enriched title",
      type: "video",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.fetchItemMetadata).toHaveBeenCalledTimes(2);
  });

  it("stops after a failed enrichment", async () => {
    api.fetchItemMetadata.mockResolvedValue({
      item,
      metadata: { enrichment: { kind: "failed", errorCode: "upstream_error" } },
    });

    await act(async () => {
      getRefresh().watch(item.id);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(api.fetchItemMetadata).toHaveBeenCalledOnce();
    expect(reconcileItemMetadata).toHaveBeenCalledWith(item);
  });

  it("pauses while hidden and refreshes when visible again", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    api.fetchItemMetadata.mockResolvedValue({
      item,
      metadata: { enrichment: { kind: "queued" } },
    });

    await act(async () => {
      getRefresh().watch(item.id);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(api.fetchItemMetadata).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(api.fetchItemMetadata).toHaveBeenCalledOnce();
  });

  it("bounds polling and aborts in-flight work on unmount", async () => {
    const request = new Promise<never>(() => undefined);
    api.fetchItemMetadata.mockReturnValue(request);

    await act(async () => {
      getRefresh().watch(item.id);
      await Promise.resolve();
    });
    const signal = api.fetchItemMetadata.mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false);

    await act(async () => root?.unmount());
    expect(signal?.aborted).toBe(true);
    root = null;
  });

  it("stops polling after the bounded retry window", async () => {
    api.fetchItemMetadata.mockResolvedValue({
      item,
      metadata: { enrichment: { kind: "processing" } },
    });

    await act(async () => {
      getRefresh().watch(item.id);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(api.fetchItemMetadata).toHaveBeenCalledTimes(12);
  });
});
