import { Hono, type Context } from 'hono';
import { inferUrlType, parseCaptureInput } from '../shared/capture';
import { parseYouTubeUrl } from '../shared/media';
import { requireAuth, type AppEnv } from './auth';
import { requireSameOrigin } from './csrf';
import { enrichItem, readItemWithMetadata, readMetadata } from './enrichment';
import { ExtractionError, readJsonRequestBody } from './extract';
import { jsonError } from './http';
import { findItem, findYouTubeItem, toItem } from './itemRepository';
import { normalizeCaptureUrl } from './metadata';

export const captureRoutes = new Hono<AppEnv>();
captureRoutes.use("*", requireAuth);
captureRoutes.use("*", requireSameOrigin);
captureRoutes.use("*", async (context, next) => {
  context.header("Cache-Control", "no-store");
  await next();
});

captureRoutes.post('/capture', async (context) => {
  const rateLimit = await checkRateLimit(context);
  if (rateLimit !== null) return rateLimit;
  try {
    const input = parseCaptureInput(await readJsonRequestBody(context.req.raw));
    if (input === null) return error('bad_request', 'Enter a valid link and optional title or type.', 400);
    const url = normalizeCaptureUrl(input.url);
    if (url === null) return error('unsafe_url', 'That URL cannot be captured.', 422);
    const db = context.env.READR_DB;
    const userId = context.get('userId');
    const inference = inferUrlType(url);
    const youtubeId = parseYouTubeUrl(url.href)?.videoId ?? null;
    const existingId = await findCaptureItem(db, userId, url);
    const id = existingId ?? crypto.randomUUID();
    const now = new Date().toISOString();
    // The identity claim, item, and pending work commit together. Concurrent captures cannot orphan items.
    const [insert] = await db.batch([
      db.prepare(`
        INSERT OR IGNORE INTO items (
          id, user_id, title, url, youtube_video_id, type, status, added_at, updated_at, title_source, type_source
        ) SELECT ?, ?, ?, ?, ?, ?, 'inbox', ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM capture_urls WHERE user_id = ? AND normalized_url = ?)
      `).bind(id, userId, input.title ?? url.hostname.replace(/^www\./, ''), url.href,
        youtubeId, input.type ?? inference.type, now, now,
        input.title === undefined ? 'automatic' : 'manual', input.type === undefined ? 'automatic' : 'manual', userId, url.href),
      db.prepare(`
        INSERT OR IGNORE INTO capture_urls (user_id, normalized_url, item_id)
        SELECT user_id, ?, id FROM items
        WHERE user_id = ? AND (id = ? OR youtube_video_id = ?)
        ORDER BY added_at, id LIMIT 1
      `).bind(url.href, userId, id, youtubeId),
      db.prepare(`
        INSERT OR IGNORE INTO item_metadata (item_id, source_url, inferred_type, inference_source, next_attempt_at)
        SELECT item_id, ?, ?, ?, ? FROM capture_urls WHERE user_id = ? AND normalized_url = ?
      `).bind(url.href, inference.type, inference.source, Date.now(), userId, url.href),
    ]);
    const identity = await db.prepare('SELECT item_id FROM capture_urls WHERE user_id = ? AND normalized_url = ?')
      .bind(userId, url.href).first<{ item_id: string }>();
    const item = identity === null ? null : await findItem(db, userId, identity.item_id);
    if (item === null) return error('capture_conflict', 'The item changed during capture. Try again.', 409);
    // The response is built from the committed row, before upstream enrichment can affect it.
    const response = context.json({ item: toItem(item), created: insert.meta.changes === 1 }, insert.meta.changes === 1 ? 201 : 200);
    context.executionCtx.waitUntil(enrichItem(db, item.id));
    return response;
  } catch (cause) {
    if (cause instanceof ExtractionError) return error(cause.code, cause.message, cause.status);
    throw cause;
  }
});

captureRoutes.get('/items/:id/metadata', async (context) => {
  const result = await readItemWithMetadata(
    context.env.READR_DB,
    context.get('userId'),
    context.req.param('id'),
  );
  if (result === null) return error('not_found', 'The item could not be found.', 404);
  return context.json({ item: toItem(result.item), metadata: result.metadata });
});

captureRoutes.post('/items/:id/enrichment/retry', async (context) => {
  const rateLimit = await checkRateLimit(context);
  if (rateLimit !== null) return rateLimit;
  const db = context.env.READR_DB;
  const item = await findItem(db, context.get('userId'), context.req.param('id'));
  if (item === null) return error('not_found', 'The item could not be found.', 404);
  const metadata = await readMetadata(db, context.get('userId'), item.id);
  if (metadata === null) return error('not_found', 'Capture this link to fetch its details.', 404);
  await db.prepare(`UPDATE item_metadata SET state = 'queued', attempts = 0, error_code = NULL,
    lease_token = NULL, lease_until = NULL, next_attempt_at = ?
    WHERE item_id = ? AND state = 'failed'`).bind(Date.now(), item.id).run();
  context.executionCtx.waitUntil(enrichItem(db, item.id));
  return context.json({ ok: true }, 202);
});

async function findCaptureItem(db: D1Database, userId: string, url: URL): Promise<string | null> {
  const indexed = await db.prepare('SELECT item_id FROM capture_urls WHERE user_id = ? AND normalized_url = ?')
    .bind(userId, url.href).first<{ item_id: string }>();
  if (indexed !== null) return indexed.item_id;
  const youtube = parseYouTubeUrl(url.href);
  if (youtube !== null) return (await findYouTubeItem(db, userId, youtube.videoId))?.id ?? null;
  // Lazy adoption preserves historical duplicates and their notes/progress without a destructive migration.
  const historical = await db.prepare(`
    SELECT items.id, items.url
    FROM items
    WHERE items.user_id = ? AND items.url IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM capture_urls
        WHERE capture_urls.user_id = items.user_id AND capture_urls.item_id = items.id
      )
    ORDER BY items.added_at, items.id
  `).bind(userId).all<{ id: string; url: string }>();
  return historical.results.find((row) => normalizeCaptureUrl(row.url)?.href === url.href)?.id ?? null;
}

async function checkRateLimit(context: Context<AppEnv>): Promise<Response | null> {
  const result = await context.env.EXTRACT_RATE_LIMITER.limit({ key: `capture:${context.get('userId')}` });
  return result.success ? null : jsonError({ error: { code: 'rate_limited', message: 'Too many captures. Try again in a minute.' } }, 429, { 'Retry-After': '60' });
}

function error(code: string, message: string, status: number): Response {
  return jsonError({ error: { code, message } }, status);
}
