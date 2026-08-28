import type { Context } from "hono";
import type { AppEnv } from "./auth";
import { ExtractionError, readJsonRequestBody } from "./extract";
import {
  isYouTubeCapturedContent,
  parseYouTubeUrl,
  YOUTUBE_CAPTURE_LIMITS,
  type YouTubeCapturedContent,
} from "../shared/media";
import { findItem, toItem, type ItemRow } from "./items";

const MAX_CAPTURE_REQUEST_BYTES = YOUTUBE_CAPTURE_LIMITS.payloadBytes + 8 * 1024;

export async function captureYouTubeContent(context: Context<AppEnv>): Promise<Response> {
  try {
    const userId = context.get("userId");
    const rateLimit = await context.env.EXTRACT_RATE_LIMITER.limit({
      key: `youtube:capture:${userId}`,
    });
    if (!rateLimit.success) {
      return mediaContentError(
        context,
        "rate_limited",
        "Too many videos were captured recently. Try again in a minute.",
        429,
        { "Retry-After": "60" },
      );
    }

    const body = await readJsonRequestBody(context.req.raw, MAX_CAPTURE_REQUEST_BYTES);
    if (!isYouTubeCapturedContent(body)) {
      return mediaContentError(context, "bad_request", "The captured video data is invalid.", 400);
    }

    const now = new Date().toISOString();
    let existing = await findItemByVideoId(context.env.READR_DB, userId, body.videoId);
    let created = false;
    if (existing === null) {
      const itemId = crypto.randomUUID();
      const insertResult = await context.env.READR_DB.prepare(`
        INSERT OR IGNORE INTO items (
          id, user_id, title, url, youtube_video_id, type, status, added_at, finished_at, note, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'video', 'inbox', ?, NULL, NULL, ?)
      `).bind(itemId, userId, body.title, body.sourceUrl, body.videoId, now, now).run();
      created = insertResult.meta.changes === 1;
      existing = await findItemByVideoId(context.env.READR_DB, userId, body.videoId);
    }

    if (existing === null) {
      return mediaContentError(context, "internal_error", "The captured video could not be saved.", 500);
    }

    await context.env.READR_DB.batch([
      context.env.READR_DB.prepare(
        "UPDATE items SET updated_at = ? WHERE id = ? AND user_id = ?",
      ).bind(now, existing.id, userId),
      mediaUpsertStatement(context.env.READR_DB, existing.id, body, now),
    ]);

    const item = await findItem(context.env.READR_DB, userId, existing.id);
    if (item === null) {
      return mediaContentError(context, "internal_error", "The captured video could not be saved.", 500);
    }

    return mediaContentJson(context, { item: toItem(item), created }, created ? 201 : 200);
  } catch (error) {
    if (error instanceof ExtractionError) {
      return mediaContentError(context, error.code, error.message, error.status);
    }

    console.error(JSON.stringify({
      message: "YouTube capture persistence failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return mediaContentError(context, "internal_error", "The captured video could not be saved.", 500);
  }
}

export async function getYouTubeContent(context: Context<AppEnv>): Promise<Response> {
  const userId = context.get("userId");
  const itemId = context.req.param("id");
  if (itemId === undefined) {
    return mediaContentError(context, "not_found", "The item could not be found.", 404);
  }
  const row = await context.env.READR_DB.prepare(`
    SELECT
      media_content.item_id,
      media_content.video_id,
      media_content.title,
      media_content.author,
      media_content.description,
      media_content.thumbnail_url,
      media_content.transcript_json,
      items.url AS item_url
    FROM media_content
    INNER JOIN items ON items.id = media_content.item_id
    WHERE media_content.item_id = ? AND items.user_id = ?
  `).bind(itemId, userId).first<MediaContentRow>();

  if (row === null) {
    const item = await findItem(context.env.READR_DB, userId, itemId);
    return item === null
      ? mediaContentError(context, "not_found", "The item could not be found.", 404)
      : mediaContentJson(context, { content: null });
  }

  const itemUrl = parseYouTubeUrl(row.item_url);
  if (itemUrl === null || itemUrl.videoId !== row.video_id) {
    return mediaContentError(context, "internal_error", "The stored video data is invalid.", 500);
  }

  let transcript: unknown;
  try {
    transcript = JSON.parse(row.transcript_json);
  } catch {
    return mediaContentError(context, "internal_error", "The stored video data is invalid.", 500);
  }

  const content: unknown = {
    kind: "youtube_capture",
    videoId: row.video_id,
    sourceUrl: itemUrl.canonicalUrl,
    title: row.title,
    author: row.author,
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
    transcript,
  };
  if (!isYouTubeCapturedContent(content)) {
    return mediaContentError(context, "internal_error", "The stored video data is invalid.", 500);
  }

  return mediaContentJson(context, { content });
}

function mediaUpsertStatement(
  db: D1Database,
  itemId: string,
  content: YouTubeCapturedContent,
  capturedAt: string,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO media_content (
      item_id, video_id, title, author, description, thumbnail_url, transcript_json, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      video_id = excluded.video_id,
      title = excluded.title,
      author = excluded.author,
      description = excluded.description,
      thumbnail_url = excluded.thumbnail_url,
      transcript_json = excluded.transcript_json,
      captured_at = excluded.captured_at
  `).bind(
    itemId,
    content.videoId,
    content.title,
    content.author,
    content.description,
    content.thumbnailUrl,
    JSON.stringify(content.transcript),
    capturedAt,
  );
}

async function findItemByVideoId(db: D1Database, userId: string, videoId: string): Promise<ItemRow | null> {
  const rows = await db.prepare(`
    SELECT id, user_id, title, url, type, status, added_at, finished_at, note, updated_at, youtube_video_id
    FROM items
    WHERE user_id = ? AND (youtube_video_id = ? OR url IS NOT NULL)
    ORDER BY youtube_video_id IS NULL ASC, added_at ASC, id ASC
  `).bind(userId, videoId).all<ItemRow>();

  return rows.results.find((row) => row.youtube_video_id === videoId || parseYouTubeUrl(row.url)?.videoId === videoId) ?? null;
}

function mediaContentError(
  context: Context<AppEnv>,
  code: string,
  message: string,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return mediaContentJson(context, { error: { code, message } }, safeStatus(status), headers);
}

function mediaContentJson(
  context: Context<AppEnv>,
  body: Record<string, unknown>,
  status: 200 | 201 | 400 | 404 | 413 | 415 | 422 | 429 | 500 | 502 | 504 = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return context.json(body, status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
}

function safeStatus(status: number): 400 | 404 | 413 | 415 | 422 | 429 | 500 | 502 | 504 {
  switch (status) {
    case 400:
    case 404:
    case 413:
    case 415:
    case 422:
    case 429:
    case 500:
    case 502:
    case 504:
      return status;
    default:
      return 500;
  }
}

type MediaContentRow = {
  item_id: string;
  video_id: string;
  title: string;
  author: string | null;
  description: string | null;
  thumbnail_url: string | null;
  transcript_json: string;
  item_url: string | null;
};
