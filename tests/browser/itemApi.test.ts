import { afterEach, describe, expect, it, vi } from "vitest";
import { discardItem } from "../../src/itemApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("item API discard", () => {
  it("treats a missing item as already discarded", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: "not_found", message: "The item could not be found." } }),
      { status: 404, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(discardItem("stale-item")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("propagates discard failures other than missing items", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: "internal_error", message: "The item could not be discarded." } }),
      { status: 500, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(discardItem("item-1")).rejects.toMatchObject({
      status: 500,
      code: "internal_error",
    });
  });
});
