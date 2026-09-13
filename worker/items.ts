import type { Context } from "hono";
import { Hono } from "hono";
import {
  DESK_CAPACITY,
  isItemType,
  isItemVisualKind,
  parseItemUrl,
  type ItemListItem,
  type ItemMetadataSummary,
  type ItemUrl,
  type ItemType,
} from "../shared/item";
import { parseYouTubeUrl, type YouTubeVideoId } from "../shared/media";
import { parseSaveMediaProgressInput } from "../shared/mediaProgress";
import {
  ITEM_COLUMNS,
  findItem,
  findYouTubeItem,
  toItem,
  type ItemRow,
} from "./itemRepository";
import { requireAuth, type AppEnv } from "./auth";
import { requireSameOrigin } from "./csrf";

const itemRoutes = new Hono<AppEnv>();

itemRoutes.use("*", requireAuth);
itemRoutes.use("*", requireSameOrigin);

itemRoutes.get("/items", async (context) => {
  const rows = await context.env.READR_DB.prepare(`
    SELECT
      ${ITEM_COLUMNS},
      m.item_id AS metadata_item_id,
      m.image_url AS metadata_image_url,
      m.image_kind AS metadata_image_kind,
      m.site_name AS metadata_site_name,
      m.author AS metadata_author
    FROM items
    LEFT JOIN item_metadata m ON m.item_id = items.id
    WHERE items.user_id = ?
    ORDER BY items.added_at DESC, items.id DESC
  `).bind(context.get("userId")).all<ItemListRow>();

  return context.json({ items: rows.results.map(toListItem) });
});

itemRoutes.post("/items", async (context) => {
  const input = await readCreateInput(context);
  if (input === null) {
    return apiError(context, "bad_request", "Enter a title, valid link, and item type.", 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const insertedItem = await context.env.READR_DB.prepare(`
    INSERT OR IGNORE INTO items (
      id, user_id, title, url, youtube_video_id, type, status, added_at, finished_at, note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'inbox', ?, NULL, NULL, ?)
    RETURNING ${ITEM_COLUMNS}
  `).bind(
    id,
    context.get("userId"),
    input.title,
    input.url,
    input.youtubeVideoId,
    input.type,
    now,
    now,
  ).first<ItemRow>();

  if (insertedItem === null) {
    const existing = input.youtubeVideoId === null
      ? null
      : await findYouTubeItem(context.env.READR_DB, context.get("userId"), input.youtubeVideoId);
    return existing === null
      ? apiError(context, "internal_error", "The item could not be created.", 500)
      : apiError(context, "duplicate_item", "That YouTube video is already in your library.", 409);
  }

  return context.json({ item: toItem(insertedItem) }, 201);
});

itemRoutes.post("/items/:id/move-to-desk", async (context) => {
  const userId = context.get("userId");
  const id = context.req.param("id");
  const existing = await findItem(context.env.READR_DB, userId, id);
  if (existing === null) {
    return apiError(context, "not_found", "The item could not be found.", 404);
  }

  if (existing.status === "desk") {
    return context.json({ item: toItem(existing) });
  }

  const updatedAt = new Date().toISOString();
  const item = await context.env.READR_DB.prepare(`
    UPDATE items
    SET status = 'desk', finished_at = NULL, updated_at = ?
    WHERE id = ?
      AND user_id = ?
      AND status <> 'desk'
      AND (
        SELECT COUNT(*)
        FROM items
        WHERE user_id = ? AND status = 'desk'
      ) < ?
    RETURNING ${ITEM_COLUMNS}
  `).bind(updatedAt, id, userId, userId, DESK_CAPACITY).first<ItemRow>();

  return item === null
    ? apiError(context, "desk_full", "Your desk is full. Replace an item before moving this one.", 409)
    : context.json({ item: toItem(item) });
});

itemRoutes.post("/items/:id/move-to-inbox", async (context) => {
  const userId = context.get("userId");
  const id = context.req.param("id");
  const updatedAt = new Date().toISOString();
  const item = await context.env.READR_DB.prepare(`
    UPDATE items
    SET status = 'inbox', finished_at = NULL, updated_at = ?
    WHERE id = ? AND user_id = ?
    RETURNING ${ITEM_COLUMNS}
  `).bind(updatedAt, id, userId).first<ItemRow>();

  if (item !== null) return context.json({ item: toItem(item) });
  return apiError(context, "not_found", "The item could not be found.", 404);
});

itemRoutes.post("/items/:id/finish", async (context) => {
  const userId = context.get("userId");
  const id = context.req.param("id");
  const finishedAt = new Date().toISOString();
  const item = await context.env.READR_DB.prepare(`
    UPDATE items
    SET status = 'library', finished_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
    RETURNING ${ITEM_COLUMNS}
  `).bind(finishedAt, finishedAt, id, userId).first<ItemRow>();

  if (item !== null) return context.json({ item: toItem(item) });
  return apiError(context, "not_found", "The item could not be found.", 404);
});

itemRoutes.delete("/items/:id", async (context) => {
  const userId = context.get("userId");
  const id = context.req.param("id");
  await context.env.READR_DB.prepare(
    "DELETE FROM items WHERE id = ? AND user_id = ?",
  ).bind(id, userId).run();

  // Discard is idempotent from the user's perspective. A different tab or
  // device may have removed the item after this client loaded it.
  return context.json({ ok: true });
});

itemRoutes.post("/items/:candidateId/swap", async (context) => {
  const userId = context.get("userId");
  const candidateId = context.req.param("candidateId");
  const body = await readJson(context);
  const displacedId = isRecord(body) && typeof body.displacedId === "string"
    ? body.displacedId
    : null;

  if (displacedId === null || candidateId === displacedId) {
    return apiError(context, "bad_request", "Choose a different desk item to replace.", 400);
  }

  const [candidate, displaced] = await Promise.all([
    findItem(context.env.READR_DB, userId, candidateId),
    findItem(context.env.READR_DB, userId, displacedId),
  ]);

  if (candidate === null || displaced === null) {
    return apiError(context, "not_found", "The item could not be found.", 404);
  }

  if (candidate.status === "desk" || displaced.status !== "desk") {
    return apiError(context, "invalid_swap", "Choose an inbox item and a desk item to replace.", 409);
  }

  const updatedAt = new Date().toISOString();
  const [deleteResult, moveResult] = await context.env.READR_DB.batch<ItemRow>([
    context.env.READR_DB.prepare(`
      DELETE FROM items
      WHERE id = ?
        AND user_id = ?
        AND status = 'desk'
        AND EXISTS (
          SELECT 1 FROM items
          WHERE id = ? AND user_id = ? AND status <> 'desk'
        )
    `).bind(displacedId, userId, candidateId, userId),
    context.env.READR_DB.prepare(`
      UPDATE items
      SET status = 'desk', finished_at = NULL, updated_at = ?
      WHERE id = ? AND user_id = ? AND status <> 'desk'
      RETURNING ${ITEM_COLUMNS}
    `).bind(updatedAt, candidateId, userId),
  ]);

  if (deleteResult.meta.changes !== 1 || moveResult.meta.changes !== 1 || moveResult.results.length !== 1) {
    return apiError(context, "invalid_swap", "The items changed. Try the swap again.", 409);
  }

  return context.json({ item: toItem(moveResult.results[0]), displacedId });
});

itemRoutes.get("/items/:id/media-progress", async (context) => {
  const row = await findMediaProgress(
    context.env.READR_DB,
    context.get("userId"),
    context.req.param("id"),
  );

  return context.json({
    progress: row === null ? null : toMediaProgress(row),
  });
});

itemRoutes.put("/items/:id/media-progress", async (context) => {
  const input = parseSaveMediaProgressInput(await readJson(context));
  if (input === null) {
    return apiError(context, "bad_request", "Enter valid playback progress.", 400);
  }

  const userId = context.get("userId");
  const itemId = context.req.param("id");
  const updatedAt = new Date().toISOString();
  await context.env.READR_DB.prepare(`
    INSERT INTO media_progress (
      item_id, position_seconds, duration_seconds, revision, updated_at
    )
    SELECT id, ?, ?, ?, ?
    FROM items
    WHERE id = ? AND user_id = ?
    ON CONFLICT(item_id) DO UPDATE SET
      position_seconds = excluded.position_seconds,
      duration_seconds = excluded.duration_seconds,
      revision = excluded.revision,
      updated_at = excluded.updated_at
    WHERE excluded.revision > media_progress.revision
  `).bind(
    input.positionSeconds,
    input.durationSeconds,
    input.revision,
    updatedAt,
    itemId,
    userId,
  ).run();

  const progress = await findMediaProgress(context.env.READR_DB, userId, itemId);
  if (progress !== null) return context.json({ progress: toMediaProgress(progress) });

  const item = await findItem(context.env.READR_DB, userId, itemId);
  return item === null
    ? apiError(context, "not_found", "The item could not be found.", 404)
    : apiError(context, "internal_error", "Playback progress could not be saved.", 500);
});

export { itemRoutes };

async function readCreateInput(context: Context<AppEnv>): Promise<CreateItemInput | null> {
  const body = await readJson(context);
  if (!isRecord(body)) return null;

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const type = body.type;
  const url = parseItemUrl(body.url);
  const youtubeVideoId = parseYouTubeUrl(url)?.videoId ?? null;

  if (
    title.length === 0 || title.length > 500 ||
    !isItemType(type) ||
    (body.url !== null && body.url !== undefined && body.url !== "" && url === null)
  ) {
    return null;
  }

  return { title, type, url, youtubeVideoId };
}

async function readJson(context: Context<AppEnv>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function toListItem(row: ItemListRow): ItemListItem {
  return {
    ...toItem(row),
    metadataSummary: toMetadataSummary(row),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiError(
  context: Context<AppEnv>,
  code: string,
  message: string,
  status: 400 | 404 | 409 | 500,
): Response {
  return context.json({ error: { code, message } }, status);
}

type CreateItemInput = {
  title: string;
  url: ItemUrl | null;
  youtubeVideoId: YouTubeVideoId | null;
  type: ItemType;
};

type ItemListRow = ItemRow & {
  metadata_item_id: string | null;
  metadata_image_url: string | null;
  metadata_image_kind: string | null;
  metadata_site_name: string | null;
  metadata_author: string | null;
};

function toMetadataSummary(row: ItemListRow): ItemMetadataSummary | null {
  if (row.metadata_item_id === null) return null;
  const imageKind = row.metadata_image_kind === null
    ? null
    : isItemVisualKind(row.metadata_image_kind) ? row.metadata_image_kind : undefined;
  if (imageKind === undefined || (row.metadata_image_url === null && imageKind !== null) ||
    (row.metadata_image_url !== null && imageKind === null)) {
    throw new Error(`Invalid metadata row for item: ${row.id}`);
  }
  return {
    imageUrl: row.metadata_image_url,
    imageKind,
    siteName: row.metadata_site_name,
    author: row.metadata_author,
  };
}

type MediaProgressRow = {
  position_seconds: number;
  duration_seconds: number;
  revision: string;
  updated_at: string;
};

async function findMediaProgress(
  db: D1Database,
  userId: string,
  itemId: string,
): Promise<MediaProgressRow | null> {
  return db.prepare(`
    SELECT p.position_seconds, p.duration_seconds, p.revision, p.updated_at
    FROM media_progress p
    INNER JOIN items i ON i.id = p.item_id
    WHERE p.item_id = ? AND i.user_id = ?
  `).bind(itemId, userId).first<MediaProgressRow>();
}

function toMediaProgress(row: MediaProgressRow) {
  return {
    positionSeconds: row.position_seconds,
    durationSeconds: row.duration_seconds,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}
