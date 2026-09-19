import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedArticle } from "../../shared/extraction";
import type { Item } from "../../shared/item";
import { createArticleCache } from "../../src/reader/articleCache";
import { ArticleExtractionError, fetchArticleContent } from "../../src/reader/fetchArticleContent";
import { sanitizeArticleHtml } from "../../src/reader/sanitizeArticle";
import { validUrl } from "./testUrl";

vi.mock("../../src/reader/fetchArticleContent", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/reader/fetchArticleContent")>(),
  fetchArticleContent: vi.fn(),
}));
vi.mock("../../src/reader/sanitizeArticle", () => ({ sanitizeArticleHtml: vi.fn((html: string) => `${html} sanitized`) }));

const item: Pick<Item, "id" | "url" | "type"> = { id: "article-1", url: validUrl("https://example.com/story"), type: "article" };
const article: ExtractedArticle = { sourceUrl: "https://example.com/story", title: "Article", author: null, html: "<p>Text</p>", wordCount: 1, capabilities: null };
const fetchContent = vi.mocked(fetchArticleContent);

beforeEach(() => {
  vi.clearAllMocks();
  fetchContent.mockResolvedValue(article);
});
afterEach(() => vi.useRealTimers());

describe("session article cache", () => {
  it("deduplicates intent and reader requests and sanitizes once across reopenings", async () => {
    const cache = createArticleCache();
    cache.prefetch(item);
    const first = cache.load(item);
    expect(cache.load(item)).toBe(first);
    const result = await first;
    expect(result.html).toBe("<p>Text</p> sanitized");
    expect(cache.peek(item)).toBe(result);
    expect(await cache.load(item)).toBe(result);
    expect(fetchContent).toHaveBeenCalledOnce();
    expect(sanitizeArticleHtml).toHaveBeenCalledOnce();
  });

  it("isolates app sessions and clears cached content", async () => {
    const cache = createArticleCache();
    const otherSession = createArticleCache();
    await cache.load(item);
    expect(otherSession.peek(item)).toBeNull();
    await otherSession.load(item);
    cache.clear();
    expect(cache.peek(item)).toBeNull();
    await cache.load(item);
    expect(fetchContent).toHaveBeenCalledTimes(3);
  });

  it("invalidates removed items and changes to URL or type", async () => {
    const cache = createArticleCache();
    await cache.load(item);
    cache.retain([{ ...item, url: validUrl("https://example.com/new") }]);
    expect(cache.peek(item)).toBeNull();
    await cache.load(item);
    await cache.load({ ...item, type: "paper" });
    expect(fetchContent).toHaveBeenCalledTimes(3);
    expect(cache.peek(item)).toBeNull();
    cache.retain([]);
    expect(cache.peek({ ...item, type: "paper" })).toBeNull();
  });

  it("expires entries after five minutes", async () => {
    vi.useFakeTimers();
    const cache = createArticleCache();
    await cache.load(item);
    vi.setSystemTime(Date.now() + 5 * 60_000);
    expect(cache.peek(item)).toBeNull();
    await cache.load(item);
    expect(fetchContent).toHaveBeenCalledTimes(2);
  });

  it("bounds entries and evicts the least recently used article", async () => {
    const cache = createArticleCache();
    for (let id = 0; id < 5; id += 1) await cache.load({ ...item, id: `${id}` });
    await cache.load({ ...item, id: "0" });
    await cache.load({ ...item, id: "5" });
    expect(cache.peek({ ...item, id: "0" })).not.toBeNull();
    expect(cache.peek({ ...item, id: "1" })).toBeNull();
    expect(fetchContent).toHaveBeenCalledTimes(6);
  });

  it("opens oversized content without retaining it", async () => {
    fetchContent.mockResolvedValue({ ...article, html: "x".repeat(750_001) });
    const cache = createArticleCache();
    expect((await cache.load(item)).html.length).toBeGreaterThan(750_000);
    expect(cache.peek(item)).toBeNull();
  });

  it("does not retain errors and clears all entries after an unauthorized response", async () => {
    const cache = createArticleCache();
    await cache.load(item);
    fetchContent.mockRejectedValueOnce(new ArticleExtractionError("Sign in", "unauthorized"));
    await expect(cache.load({ ...item, id: "private" })).rejects.toThrow("Sign in");
    expect(cache.peek(item)).toBeNull();
    await cache.load(item);
    expect(fetchContent).toHaveBeenCalledTimes(3);
  });

  it("does not let a stale unauthorized request clear a newer cache entry", async () => {
    let reject!: (error: unknown) => void;
    fetchContent.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const cache = createArticleCache();
    const stale = expect(cache.load(item)).rejects.toMatchObject({ code: "unauthorized" });
    cache.clear();
    const current = await cache.load(item);
    reject(new ArticleExtractionError("Old session expired", "unauthorized"));
    await stale;
    expect(cache.peek(item)).toBe(current);
  });

  it("aborts pending requests on clear and cannot repopulate from late results", async () => {
    let resolve!: (value: ExtractedArticle) => void;
    fetchContent.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const cache = createArticleCache();
    const pending = cache.load(item);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const signal = fetchContent.mock.calls[0][1];
    cache.clear();
    expect(signal.aborted).toBe(true);
    resolve(article);
    await rejected;
    expect(cache.peek(item)).toBeNull();
    expect(sanitizeArticleHtml).not.toHaveBeenCalled();
  });
});
