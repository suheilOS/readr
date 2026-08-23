import type { Context } from "hono";
import { Hono } from "hono";
import {
  DESK_CAPACITY,
  isItemType,
  parseItem,
  parseItemUrl,
  type Item,
  type ItemUrl,
  type ItemType,
} from "../shared/item";
import { requireAuth, type AppEnv } from "./auth";
import { requireSameOrigin } from "./csrf";

const ITEM_COLUMNS = `
  id, user_id, title, url, type, status, added_at, finished_at, note, updated_at
`;

const itemRoutes = new Hono<AppEnv>();

itemRoutes.use("*", requireAuth);
itemRoutes.use("*", requireSameOrigin);

itemRoutes.get("/items", async (context) => {
  const rows = await context.env.READR_DB.prepare(`
    SELECT ${ITEM_COLUMNS}
    FROM items
    WHERE user_id = ?
    ORDER BY added_at DESC, id DESC
  `).bind(context.get("userId")).all<ItemRow>();

  return context.json({ items: rows.results.map(toItem) });
});

itemRoutes.post("/items", async (context) => {
  const input = await readCreateInput(context);
  if (input === null) {
    return apiError(context, "bad_request", "Enter a title, valid link, and item type.", 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await context.env.READR_DB.prepare(`
    INSERT INTO items (
      id, user_id, title, url, type, status, added_at, finished_at, note, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'inbox', ?, NULL, NULL, ?)
  `).bind(
    id,
    context.get("userId"),
    input.title,
    input.url,
    input.type,
    now,
    now,
  ).run();

  const item = await findItem(context.env.READR_DB, context.get("userId"), id);
  if (item === null) {
    return apiError(context, "internal_error", "The item could not be created.", 500);
  }

  return context.json({ item: toItem(item) }, 201);
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
  const result = await context.env.READR_DB.prepare(`
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
  `).bind(updatedAt, id, userId, userId, DESK_CAPACITY).run();

  if (result.meta.changes !== 1) {
    return apiError(context, "desk_full", "Your desk is full. Replace an item before moving this one.", 409);
  }

  const item = await findItem(context.env.READR_DB, userId, id);
  return item === null
    ? apiError(context, "internal_error", "The item could not be moved.", 500)
    : context.json({ item: toItem(item) });
});

itemRoutes.post("/items/:id/move-to-inbox", async (context) => {
  const userId = context.get("userId");
  const id = context.req.param("id");
  const updatedAt = new Date().toISOString();
  const result = await context.env.READR_DB.prepare(`
    UPDATE items
    SET status = 'inbox', finished_at = NULL, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(updatedAt, id, userId).run();

  if (result.meta.changes !== 1) {
    const existing = await findItem(context.env.READR_DB, userId, id);
    return existing === null
      ? apiError(context, "not_found", "The item could not be found.", 404)
      : context.json({ item: toItem(existing) });
  }

  const item = await findItem(context.env.READR_DB, userId, id);
  return item === null
    ? apiError(context, "internal_error", "The item could not be moved.", 500)
    : context.json({ item: toItem(item) });
});

itemRoutes.post("/items/:id/finish", async (context) => {
  const userId = context.get("userId");
  const id = context.req.param("id");
  const finishedAt = new Date().toISOString();
  const result = await context.env.READR_DB.prepare(`
    UPDATE items
    SET status = 'library', finished_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(finishedAt, finishedAt, id, userId).run();

  if (result.meta.changes !== 1) {
    const existing = await findItem(context.env.READR_DB, userId, id);
    return existing === null
      ? apiError(context, "not_found", "The item could not be found.", 404)
      : context.json({ item: toItem(existing) });
  }

  const item = await findItem(context.env.READR_DB, userId, id);
  return item === null
    ? apiError(context, "internal_error", "The item could not be finished.", 500)
    : context.json({ item: toItem(item) });
});

itemRoutes.delete("/items/:id", async (context) => {
  const userId = context.get("userId");
  const id = context.req.param("id");
  const result = await context.env.READR_DB.prepare(
    "DELETE FROM items WHERE id = ? AND user_id = ?",
  ).bind(id, userId).run();

  return result.meta.changes === 1
    ? context.json({ ok: true })
    : apiError(context, "not_found", "The item could not be found.", 404);
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
  const [deleteResult, moveResult] = await context.env.READR_DB.batch([
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
    `).bind(updatedAt, candidateId, userId),
  ]);

  if (deleteResult.meta.changes !== 1 || moveResult.meta.changes !== 1) {
    return apiError(context, "invalid_swap", "The items changed. Try the swap again.", 409);
  }

  const item = await findItem(context.env.READR_DB, userId, candidateId);
  return item === null
    ? apiError(context, "internal_error", "The item could not be moved.", 500)
    : context.json({ item: toItem(item), displacedId });
});

export { itemRoutes };

async function readCreateInput(context: Context<AppEnv>): Promise<CreateItemInput | null> {
  const body = await readJson(context);
  if (!isRecord(body)) return null;

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const type = body.type;
  const url = parseItemUrl(body.url);

  if (
    title.length === 0 || title.length > 500 ||
    !isItemType(type) ||
    (body.url !== null && body.url !== undefined && body.url !== "" && url === null)
  ) {
    return null;
  }

  return { title, type, url };
}

async function readJson(context: Context<AppEnv>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

async function findItem(db: D1Database, userId: string, id: string): Promise<ItemRow | null> {
  return db.prepare(`
    SELECT ${ITEM_COLUMNS}
    FROM items
    WHERE id = ? AND user_id = ?
  `).bind(id, userId).first<ItemRow>();
}

function toItem(row: ItemRow): Item {
  const item = parseItem({
    id: row.id,
    title: row.title,
    url: row.url,
    type: row.type,
    status: row.status,
    addedAt: row.added_at,
    finishedAt: row.finished_at,
    note: row.note,
  });
  if (item === null) {
    throw new Error(`Invalid item row: ${row.id}`);
  }
  return item;
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
  type: ItemType;
};

type ItemRow = {
  id: string;
  user_id: string;
  title: string;
  url: string | null;
  type: string;
  status: string;
  added_at: string;
  finished_at: string | null;
  note: string | null;
  updated_at: string;
};
