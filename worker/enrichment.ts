import { ENRICHMENT_RETRY_DELAYS_MS, parseItemMetadata, type ItemMetadata } from '../shared/capture';
import { ExtractionError } from './extract';
import { fetchMetadata, normalizeCaptureUrl } from './metadata';
import { ITEM_COLUMNS, type ItemRow } from './itemRepository';

const MAX_ATTEMPTS = ENRICHMENT_RETRY_DELAYS_MS.length + 1;
const LEASE_MS = 60_000;

export async function enrichItem(db: D1Database, itemId: string): Promise<void> {
  const now = Date.now();
  const token = crypto.randomUUID();
  const job = await db.prepare(`
    UPDATE item_metadata SET state = 'processing', lease_token = ?, lease_until = ?, attempts = attempts + 1
    WHERE item_id = ? AND attempts < ? AND (
      (state = 'queued' AND next_attempt_at <= ?) OR (state = 'processing' AND lease_until <= ?)
    ) RETURNING source_url, attempts
  `).bind(token, now + LEASE_MS, itemId, MAX_ATTEMPTS, now, now)
    .first<{ source_url: string; attempts: number }>();
  if (job === null) return;

  try {
    const url = normalizeCaptureUrl(job.source_url);
    if (url === null) throw new ExtractionError({ code: 'unsafe_url', status: 422, message: 'Invalid source URL' });
    const result = await fetchMetadata(url);
    const timestamp = new Date().toISOString();
    // Both writes are guarded by the lease. Discard or a replacement worker wins over stale work.
    await db.batch([
      db.prepare(`
        UPDATE items SET
          title = CASE WHEN title_source = 'automatic' THEN COALESCE(?, title) ELSE title END,
          type = CASE WHEN type_source = 'automatic' THEN ? ELSE type END,
          updated_at = ?
        WHERE id = ? AND EXISTS (
          SELECT 1 FROM item_metadata WHERE item_id = ? AND state = 'processing' AND lease_token = ?
        )
      `).bind(result.sourceTitle, result.inference.type, timestamp, itemId, itemId, token),
      db.prepare(`
        UPDATE item_metadata SET source_url = ?, source_title = ?, author = ?, site_name = ?,
          description = ?, image_url = ?, image_kind = ?, inferred_type = ?, inference_source = ?,
          state = 'ready', enriched_at = ?, error_code = NULL, lease_token = NULL, lease_until = NULL
        WHERE item_id = ? AND state = 'processing' AND lease_token = ?
      `).bind(result.sourceUrl, result.sourceTitle, result.author, result.siteName, result.description,
        result.visual.kind === 'none' ? null : result.visual.url,
        result.visual.kind === 'none' ? null : result.visual.kind,
        result.inference.type, result.inference.source, timestamp, itemId, token),
    ]);
  } catch (error) {
    const code = error instanceof ExtractionError ? error.code : 'upstream_error';
    const failedAt = Date.now();
    const retryable = code === 'upstream_error' || code === 'upstream_timeout' || code === 'internal_error';
    const retryDelay = retryable ? ENRICHMENT_RETRY_DELAYS_MS[job.attempts - 1] : undefined;
    const retry = retryDelay !== undefined;
    const nextAttemptAt = retryDelay === undefined ? failedAt : failedAt + retryDelay;
    await db.prepare(`
      UPDATE item_metadata SET state = ?, error_code = ?, next_attempt_at = ?, lease_token = NULL, lease_until = NULL
      WHERE item_id = ? AND state = 'processing' AND lease_token = ?
    `).bind(retry ? 'queued' : 'failed', code, nextAttemptAt, itemId, token).run();
    console.warn(JSON.stringify({ message: 'capture enrichment failed', itemId, code, attempt: job.attempts, retry }));
  }
}

export async function recoverEnrichment(db: D1Database): Promise<void> {
  const now = Date.now();
  // A worker interrupted on its final attempt still needs a terminal, recoverable state.
  await db.prepare(`
    UPDATE item_metadata SET state = 'failed', error_code = 'interrupted', lease_token = NULL, lease_until = NULL
    WHERE state = 'processing' AND lease_until <= ? AND attempts >= ?
  `).bind(now, MAX_ATTEMPTS).run();
  const due = await db.prepare(`
    SELECT item_id FROM item_metadata WHERE attempts < ? AND (
      (state = 'queued' AND next_attempt_at <= ?) OR (state = 'processing' AND lease_until <= ?)
    ) ORDER BY next_attempt_at LIMIT 10
  `).bind(MAX_ATTEMPTS, now, now).all<{ item_id: string }>();
  // Small concurrent batches bound source traffic and Worker memory.
  for (let index = 0; index < due.results.length; index += 2) {
    await Promise.all(due.results.slice(index, index + 2).map((row) => enrichItem(db, row.item_id)));
  }
}

export async function readMetadata(db: D1Database, userId: string, itemId: string): Promise<ItemMetadata | null> {
  const row = await db.prepare(`
    SELECT m.* FROM item_metadata m INNER JOIN items i ON i.id = m.item_id
    WHERE m.item_id = ? AND i.user_id = ?
  `).bind(itemId, userId).first<MetadataRow>();
  return row === null ? null : parseMetadataRow(row);
}

/** Read an item and its full metadata in one round trip for the polling endpoint. */
export async function readItemWithMetadata(
  db: D1Database,
  userId: string,
  itemId: string,
): Promise<{ item: ItemRow; metadata: ItemMetadata | null } | null> {
  const row = await db.prepare(`
    SELECT
      ${ITEM_COLUMNS},
      m.item_id,
      m.source_url,
      m.source_title,
      m.author,
      m.site_name,
      m.description,
      m.image_url,
      m.image_kind,
      m.inferred_type,
      m.inference_source,
      m.state,
      m.enriched_at,
      m.error_code
    FROM items
    LEFT JOIN item_metadata m ON m.item_id = items.id
    WHERE items.id = ? AND items.user_id = ?
  `).bind(itemId, userId).first<JoinedItemMetadataRow>();
  if (row === null) return null;
  if (row.item_id === null) return { item: row, metadata: null };
  if (!isCompleteMetadataRow(row)) throw new Error('Invalid stored metadata');
  return { item: row, metadata: parseMetadataRow(row) };
}

function parseMetadataRow(row: MetadataRow): ItemMetadata {
  const result = parseItemMetadata({
    sourceUrl: row.source_url, sourceTitle: row.source_title, author: row.author,
    siteName: row.site_name, description: row.description,
    visual: row.image_url === null ? { kind: 'none' } : { kind: row.image_kind, url: row.image_url },
    inference: { type: row.inferred_type, source: row.inference_source },
    enrichment: { kind: row.state, enrichedAt: row.enriched_at, errorCode: row.error_code },
  });
  if (result === null) throw new Error('Invalid stored metadata');
  return result;
}

type MetadataRow = {
  item_id: string;
  source_url: string; source_title: string | null; author: string | null;
  site_name: string | null; description: string | null; image_url: string | null;
  image_kind: string | null; inferred_type: string; inference_source: string;
  state: string; enriched_at: string | null; error_code: string | null;
};

type JoinedItemMetadataRow = ItemRow & {
  item_id: string | null;
  source_url: string | null;
  source_title: string | null;
  author: string | null;
  site_name: string | null;
  description: string | null;
  image_url: string | null;
  image_kind: string | null;
  inferred_type: string | null;
  inference_source: string | null;
  state: string | null;
  enriched_at: string | null;
  error_code: string | null;
};

function isCompleteMetadataRow(row: JoinedItemMetadataRow): row is ItemRow & MetadataRow {
  return row.item_id !== null && row.source_url !== null &&
    typeof row.inferred_type === 'string' &&
    typeof row.inference_source === 'string' &&
    typeof row.state === 'string';
}
