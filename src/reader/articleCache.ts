import type { ExtractedArticle } from "../../shared/extraction";
import type { Item } from "../../shared/item";
import { ArticleExtractionError, fetchArticleContent } from "./fetchArticleContent";

type ArticleIdentity = Pick<Item, "id" | "url" | "type">;
type Entry = {
  item: ArticleIdentity;
  controller: AbortController;
  expiresAt: number;
  article: ExtractedArticle | null;
  promise: Promise<ExtractedArticle>;
};

const MAX_ENTRIES = 5;
const MAX_HTML_CHARACTERS = 750_000;
const TTL_MS = 5 * 60_000;

export type ArticleCache = ReturnType<typeof createArticleCache>;

/** Private to one App mount; never persisted or shared between users. */
export function createArticleCache() {
  const entries = new Map<string, Entry>();
  function remove(id: string) {
    entries.get(id)?.controller.abort();
    entries.delete(id);
  }
  function clear() {
    for (const id of entries.keys()) remove(id);
  }
  function lookup(item: ArticleIdentity): Entry | undefined {
    const entry = entries.get(item.id);
    if (entry === undefined) return undefined;
    if (entry.item.url !== item.url || entry.item.type !== item.type || entry.expiresAt <= Date.now()) {
      remove(item.id);
      return undefined;
    }
    entries.delete(item.id);
    entries.set(item.id, entry);
    return entry;
  }
  function peek(item: ArticleIdentity): ExtractedArticle | null {
    const entry = entries.get(item.id);
    return entry !== undefined && entry.expiresAt > Date.now() &&
      entry.item.url === item.url && entry.item.type === item.type ? entry.article : null;
  }
  function load(item: ArticleIdentity): Promise<ExtractedArticle> {
    const existing = lookup(item);
    if (existing !== undefined) return existing.promise;

    const controller = new AbortController();
    const entry: Entry = {
      item: { id: item.id, url: item.url, type: item.type },
      controller,
      expiresAt: Date.now() + TTL_MS,
      article: null,
      promise: Promise.all([
        fetchArticleContent(item.id, controller.signal),
        // Keep DOMPurify out of the initial application bundle.
        import("./sanitizeArticle"),
      ]).then(([article, { sanitizeArticleHtml }]) => {
        controller.signal.throwIfAborted();
        const sanitized = { ...article, html: sanitizeArticleHtml(article.html, article.sourceUrl) };
        entry.article = sanitized;
        entry.expiresAt = Date.now() + TTL_MS;
        // Oversized articles still open, but don't remain in the session cache.
        if (sanitized.html.length > MAX_HTML_CHARACTERS) entries.delete(item.id);
        return sanitized;
      }).catch((error: unknown) => {
        // An invalidated request no longer owns this cache (including auth
        // failure handling). Its late result must not clear newer entries.
        if (entries.get(item.id) === entry) {
          if (error instanceof ArticleExtractionError && error.code === "unauthorized") clear();
          else remove(item.id);
        }
        throw error;
      }),
    };
    entries.set(item.id, entry);
    while (entries.size > MAX_ENTRIES) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) remove(oldest);
    }
    return entry.promise;
  }
  function prefetch(item: ArticleIdentity): void {
    // Speculative failures must neither notify the user nor poison future reads.
    void load(item).catch(() => undefined);
  }
  function retain(items: readonly ArticleIdentity[]): void {
    for (const [id, entry] of entries) {
      if (!items.some((item) => item.id === id && item.url === entry.item.url && item.type === entry.item.type)) {
        remove(id);
      }
    }
  }
  return { load, peek, prefetch, retain, clear };
}
