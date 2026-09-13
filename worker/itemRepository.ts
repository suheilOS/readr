import { parseItem, type Item } from "../shared/item";
import { parseYouTubeUrl, type YouTubeVideoId } from "../shared/media";

export const ITEM_COLUMNS = `
  id, user_id, title, url, youtube_video_id, type, status, added_at, finished_at, note, updated_at
`;

export type ItemRow = {
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
  youtube_video_id: string | null;
};

export async function findItem(db: D1Database, userId: string, id: string): Promise<ItemRow | null> {
  return db.prepare(`
    SELECT ${ITEM_COLUMNS}
    FROM items
    WHERE id = ? AND user_id = ?
  `).bind(id, userId).first<ItemRow>();
}

export async function findYouTubeItem(
  db: D1Database,
  userId: string,
  videoId: YouTubeVideoId,
): Promise<ItemRow | null> {
  const indexed = await db.prepare(`
    SELECT ${ITEM_COLUMNS}
    FROM items
    WHERE user_id = ? AND youtube_video_id = ?
    LIMIT 1
  `).bind(userId, videoId).first<ItemRow>();
  if (indexed !== null) return indexed;

  const historical = await db.prepare(`
    SELECT ${ITEM_COLUMNS}
    FROM items
    WHERE user_id = ? AND youtube_video_id IS NULL AND url IS NOT NULL
    ORDER BY added_at ASC, id ASC
  `).bind(userId).all<ItemRow>();

  return historical.results.find((row) => parseYouTubeUrl(row.url)?.videoId === videoId) ?? null;
}

export function toItem(row: ItemRow): Item {
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
