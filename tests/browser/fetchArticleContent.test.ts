import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchArticleContent } from "../../src/reader/fetchArticleContent";

const article = { sourceUrl: "https://example.com/story", title: "Article", author: null, html: "<p>Text</p>", wordCount: 1 };
const pending = () => Response.json({ status: "processing" }, { status: 202, headers: { "Retry-After": "1" } });
let upstream = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.useFakeTimers();
  upstream = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("article processing retries", () => {
  it("waits for processing and returns ready content", async () => {
    upstream.mockResolvedValueOnce(pending()).mockResolvedValueOnce(Response.json({ content: article }));
    const result = fetchArticleContent("article", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(999);
    expect(upstream).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual(article);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("bounds polling rather than waiting indefinitely", async () => {
    upstream.mockImplementation(async () => pending());
    const result = expect(fetchArticleContent("article", new AbortController().signal))
      .rejects.toMatchObject({ code: "processing" });
    await vi.runAllTimersAsync();
    await result;
    expect(upstream).toHaveBeenCalledTimes(21);
  });

  it("cancels the retry timer when aborted", async () => {
    upstream.mockImplementation(async () => pending());
    const controller = new AbortController();
    const result = expect(fetchArticleContent("article", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await result;
    await vi.runAllTimersAsync();
    expect(upstream).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([401, 429, 500])("does not retry HTTP %s", async (status) => {
    upstream.mockResolvedValue(Response.json({ error: { code: "internal_error", message: "Failed" } }, { status }));
    await expect(fetchArticleContent("article", new AbortController().signal)).rejects.toMatchObject({
      code: status === 401 ? "unauthorized" : "internal_error",
    });
    expect(upstream).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, "<html>Sign in</html>"])("preserves unauthorized responses without a JSON body (%s)", async (body) => {
    upstream.mockResolvedValue(new Response(body, { status: 401 }));
    await expect(fetchArticleContent("article", new AbortController().signal)).rejects.toMatchObject({ code: "unauthorized" });
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("rejects a malformed processing response", async () => {
    upstream.mockResolvedValue(Response.json({ status: "unknown" }, { status: 202 }));
    await expect(fetchArticleContent("article", new AbortController().signal)).rejects.toMatchObject({ code: "invalid_response" });
    expect(upstream).toHaveBeenCalledOnce();
  });
});
