import type { Context } from 'hono';
import type { ArticleCapabilities, ArticleContentPendingResponse, ArticleContentResponse, ExtractedArticle, ExtractErrorCode } from '../shared/extraction';
import { isExtractedArticle, normalizeArticleCapabilities } from '../shared/extraction';
import { ENRICHMENT_RETRY_DELAYS_MS } from '../shared/capture';
import { findItem } from './itemRepository';
import {
  ExtractionError,
  extractFromUrlWithTimings,
  formatExtractionServerTiming,
  type ExtractionTimings,
  type TimedExtraction,
} from './extract';
import { jsonError } from './http';
import { normalizeCaptureUrl } from './metadata';
import { normalizePublicUrl } from './urlSafety';
import type { AppEnv } from './auth';

const MAX_ATTEMPTS = ENRICHMENT_RETRY_DELAYS_MS.length + 1;
const LEASE_MS = 60_000;
// D1 limits a row and an individual string to 2 MB. Leave room for the other
// columns and SQLite row overhead instead of persisting the full extraction cap.
export const MAX_STORED_HTML_BYTES = 1_500_000;

export function queueArticleContentForCapture(
  db: D1Database,
  userId: string,
  sourceUrl: string,
  queuedAt: number,
): D1PreparedStatement {
  return db.prepare(`
    INSERT OR IGNORE INTO article_content (item_id, source_url, state, attempts, next_attempt_at)
    SELECT capture_urls.item_id, ?, 'queued', 0, ?
    FROM capture_urls
    INNER JOIN items ON items.id = capture_urls.item_id
    WHERE capture_urls.user_id = ? AND capture_urls.normalized_url = ?
      AND items.type = 'article' AND items.youtube_video_id IS NULL
  `).bind(sourceUrl, queuedAt, userId, sourceUrl);
}

export async function ensureArticleContentJob(
  db: D1Database,
  itemId: string,
  sourceUrl: string,
): Promise<void> {
  await db.prepare(`
    INSERT OR IGNORE INTO article_content (item_id, source_url, state, attempts, next_attempt_at)
    VALUES (?, ?, 'queued', 0, ?)
  `).bind(itemId, sourceUrl, Date.now()).run();
}

/** Run one best-effort background extraction claimed by the durable D1 job row. */
export async function extractArticleContent(db: D1Database, itemId: string): Promise<void> {
  const item = await db.prepare('SELECT type FROM items WHERE id = ?').bind(itemId).first<{ type: string }>();
  if (item === null) return;
  if (item.type !== 'article') {
    await db.prepare(`
      UPDATE article_content SET state = 'failed', error_code = 'unsupported_content',
        lease_token = NULL, lease_until = NULL
      WHERE item_id = ? AND state <> 'ready'
    `).bind(itemId).run();
    return;
  }

  const job = await claimArticleContent(db, itemId, 'background');
  if (job === null) return;
  await runArticleExtraction(db, job);
}

/** Recover queued and expired article jobs from the scheduled Worker handler. */
export async function recoverArticleContent(db: D1Database): Promise<void> {
  const now = Date.now();
  await db.prepare(`
    UPDATE article_content
    SET state = 'failed', error_code = 'interrupted', lease_token = NULL, lease_until = NULL
    WHERE state = 'processing' AND lease_until <= ? AND attempts >= ?
  `).bind(now, MAX_ATTEMPTS).run();

  const due = await db.prepare(`
    SELECT item_id FROM article_content WHERE attempts < ? AND (
      (state = 'queued' AND next_attempt_at <= ?) OR
      (state = 'processing' AND lease_until <= ?)
    ) ORDER BY next_attempt_at LIMIT 10
  `).bind(MAX_ATTEMPTS, now, now).all<{ item_id: string }>();

  // Bound concurrent upstream fetches and Worker memory in each cron tick.
  for (let index = 0; index < due.results.length; index += 2) {
    await Promise.all(due.results.slice(index, index + 2).map((row) => extractArticleContent(db, row.item_id)));
  }
}

export async function getArticleContent(
  context: Context<AppEnv>,
): Promise<Response> {
  const userId = context.get('userId');
  const itemId = context.req.param('id');
  if (itemId === undefined) {
    return articleContentError('not_found', 'The item could not be found.', 404);
  }

  const item = await findItem(context.env.READR_DB, userId, itemId);
  if (item === null) {
    return articleContentError('not_found', 'The item could not be found.', 404);
  }
  if (item.type !== 'article' && item.type !== 'paper') {
    return articleContentError('unsupported_content', 'This item cannot be opened as an article.', 422);
  }

  const stored = await readArticleResponse(context.env.READR_DB, itemId);
  if (stored !== null) {
    return articleContentJson(stored);
  }

  const sourceUrl = item.url === null ? null : normalizeCaptureUrl(item.url);
  if (sourceUrl === null) {
    return articleContentError('unsafe_url', 'That item does not have an openable URL.', 422);
  }

  const clientKey = context.req.header('CF-Connecting-IP') ?? 'unidentified';
  const rateLimit = await context.env.EXTRACT_RATE_LIMITER.limit({ key: `article-content:${clientKey}` });
  if (!rateLimit.success) {
    return articleContentError('rate_limited', 'Too many articles were opened recently. Try again in a minute.', 429);
  }

  await ensureArticleContentJob(context.env.READR_DB, itemId, sourceUrl.href);
  const job = await claimArticleContent(context.env.READR_DB, itemId, 'foreground');
  if (job === null) {
    // Another reader/background job may have claimed or completed extraction
    // since our first read. Never steal its live lease or report a false 500.
    const current = await readArticleResponse(context.env.READR_DB, itemId);
    if (current !== null) return articleContentJson(current);
    return articleContentError('internal_error', 'The article could not be opened.', 500);
  }

  try {
    const result = await extractAndStoreArticle(context.env.READR_DB, job);
    // Preserve the old reader behavior for unusually large articles even
    // though this result cannot be retained in a D1 row.
    return articleContentJson({ content: result.extraction.article }, result.extraction.timings);
  } catch (error) {
    await recordArticleExtractionFailure(context.env.READR_DB, job, error);
    if (error instanceof ExtractionError) {
      return articleContentError(error.code, error.message, error.status);
    }

    console.error(JSON.stringify({
      message: 'article content extraction failed',
      itemId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return articleContentError('internal_error', 'The page could not be opened.', 500);
  }
}

async function runArticleExtraction(
  db: D1Database,
  job: ArticleContentJob,
): Promise<void> {
  try {
    const result = await extractAndStoreArticle(db, job);
    if (!result.stored) {
      console.warn(JSON.stringify({ message: 'article content was too large to store', itemId: job.item_id }));
    }
  } catch (error) {
    await recordArticleExtractionFailure(db, job, error);
    console.warn(JSON.stringify({
      message: 'background article extraction failed',
      itemId: job.item_id,
      attempt: job.attempts,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function claimArticleContent(
  db: D1Database,
  itemId: string,
  mode: 'foreground' | 'background',
): Promise<ArticleContentJob | null> {
  const token = crypto.randomUUID();
  const now = Date.now();
  // Foreground reads may retry failed/exhausted work, but neither caller may
  // replace a live lease. Keep that invariant outside the retry policy.
  const retryPolicy = mode === 'foreground'
    ? `state <> 'ready'`
    : `attempts < ? AND ((state = 'queued' AND next_attempt_at <= ?) OR state = 'processing')`;
  const retryBindings = mode === 'foreground' ? [] : [MAX_ATTEMPTS, now];
  return db.prepare(`
    UPDATE article_content
    SET state = 'processing', lease_token = ?, lease_until = ?, attempts = attempts + 1
    WHERE item_id = ? AND (state <> 'processing' OR lease_until <= ?) AND ${retryPolicy}
    RETURNING item_id, source_url, attempts, lease_token
  `).bind(token, now + LEASE_MS, itemId, now, ...retryBindings).first<ArticleContentJob>();
}

async function extractAndStoreArticle(
  db: D1Database,
  job: ArticleContentJob,
): Promise<{ extraction: TimedExtraction; stored: boolean }> {
  const extraction = await extractFromUrlWithTimings(toSafeUrl(job.source_url));
  if (!canPersistArticle(extraction.article.html)) {
    await markArticleContentFailed(db, job, 'content_too_large', false);
    return { extraction, stored: false };
  }

  const stored = await saveArticleContent(db, job, extraction.article);
  return { extraction, stored };
}

async function saveArticleContent(
  db: D1Database,
  job: ArticleContentJob,
  article: ExtractedArticle,
): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const result = await db.prepare(`
    UPDATE article_content SET source_url = ?, title = ?, author = ?, word_count = ?, html = ?, capabilities_json = ?,
      state = 'ready', extracted_at = ?, error_code = NULL, lease_token = NULL, lease_until = NULL
    WHERE item_id = ? AND state = 'processing' AND lease_token = ?
  `).bind(
    article.sourceUrl,
    article.title,
    article.author,
    article.wordCount,
    article.html,
    serializeArticleCapabilities(article.capabilities),
    timestamp,
    job.item_id,
    job.lease_token,
  ).run();
  return result.meta.changes === 1;
}

async function recordArticleExtractionFailure(
  db: D1Database,
  job: ArticleContentJob,
  error: unknown,
): Promise<void> {
  try {
    const code = error instanceof ExtractionError ? error.code : 'internal_error';
    const retryable = code === 'upstream_error' || code === 'upstream_timeout' || code === 'internal_error';
    const retryDelay = retryable ? ENRICHMENT_RETRY_DELAYS_MS[job.attempts - 1] : undefined;
    await markArticleContentFailed(db, job, code, retryDelay !== undefined, retryDelay);
  } catch (recordingError) {
    console.error(JSON.stringify({
      message: 'article extraction failure could not be recorded',
      itemId: job.item_id,
      error: recordingError instanceof Error ? recordingError.message : String(recordingError),
    }));
  }
}

async function markArticleContentFailed(
  db: D1Database,
  job: ArticleContentJob,
  code: string,
  retry: boolean,
  retryDelay?: number,
): Promise<void> {
  const nextAttemptAt = retryDelay === undefined ? Date.now() : Date.now() + retryDelay;
  await db.prepare(`
    UPDATE article_content SET state = ?, error_code = ?, next_attempt_at = ?,
      lease_token = NULL, lease_until = NULL
    WHERE item_id = ? AND state = 'processing' AND lease_token = ?
  `).bind(
    retry ? 'queued' : 'failed',
    code,
    nextAttemptAt,
    job.item_id,
    job.lease_token,
  ).run();
}

async function readArticleResponse(
  db: D1Database,
  itemId: string,
): Promise<ArticleContentResponse | ArticleContentPendingResponse | null> {
  const row = await db.prepare(`
    SELECT state, source_url, title, author, word_count, html, capabilities_json
    FROM article_content
    WHERE item_id = ? AND (state = 'ready' OR (state = 'processing' AND lease_until > ?))
  `).bind(itemId, Date.now()).first<StoredArticleRow>();
  if (row === null) return null;
  if (row.state === 'processing') return { status: 'processing' };

  const article: unknown = {
    sourceUrl: row.source_url,
    title: row.title,
    author: row.author,
    wordCount: row.word_count,
    html: row.html,
    capabilities: parseStoredArticleCapabilities(row.capabilities_json),
  };
  if (!isExtractedArticle(article)) {
    throw new ExtractionError({
      code: 'internal_error',
      status: 500,
      message: 'The stored article data is invalid.',
    });
  }
  return { content: article };
}

function toSafeUrl(sourceUrl: string): URL {
  const url = normalizePublicUrl(sourceUrl);
  if (url === null) {
    throw new ExtractionError({
      code: 'unsafe_url',
      status: 422,
      message: 'That URL cannot be opened.',
    });
  }
  return url;
}

function canPersistArticle(html: string): boolean {
  return new TextEncoder().encode(html).byteLength <= MAX_STORED_HTML_BYTES;
}

function serializeArticleCapabilities(capabilities: ArticleCapabilities | null): string | null {
  return capabilities === null ? null : JSON.stringify(capabilities);
}

function parseStoredArticleCapabilities(value: string | null): ArticleCapabilities | null {
  if (value === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalidStoredArticleError();
  }

  const capabilities = normalizeArticleCapabilities(parsed);
  if (capabilities === null) {
    throw invalidStoredArticleError();
  }
  return capabilities;
}

function invalidStoredArticleError(): ExtractionError {
  return new ExtractionError({
    code: 'internal_error',
    status: 500,
    message: 'The stored article data is invalid.',
  });
}

function articleContentError(
  code: ExtractErrorCode,
  message: string,
  status: number,
): Response {
  return jsonError({ error: { code, message } }, status);
}

function articleContentJson(
  body: ArticleContentResponse | ArticleContentPendingResponse,
  timings?: ExtractionTimings,
): Response {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (timings !== undefined) headers['Server-Timing'] = formatExtractionServerTiming(timings);
  const pending = 'status' in body;
  if (pending) headers['Retry-After'] = '1';
  return Response.json(body, { status: pending ? 202 : 200, headers });
}

type ArticleContentJob = {
  item_id: string;
  source_url: string;
  attempts: number;
  lease_token: string;
};

type StoredArticleRow = {
  state: 'ready' | 'processing';
  source_url: string;
  title: string | null;
  author: string | null;
  word_count: number | null;
  html: string | null;
  capabilities_json: string | null;
};

