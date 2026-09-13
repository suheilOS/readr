import {
  isItemType,
  parseItem,
  parseItemUrl,
  type Item,
  type ItemMetadataSummary,
  type ItemType,
} from './item';
import { parseYouTubeUrl } from './media';

export const ENRICHMENT_RETRY_DELAYS_MS = [60_000, 120_000] as const;

export type CaptureInput = { url: string; title?: string; type?: ItemType };
export type CaptureResult = { item: Item; created: boolean };
export type TypeInference = { type: ItemType; source: 'url' | 'schema' | 'opengraph' | 'mime' | 'fallback' };
export type ItemVisual =
  | { kind: 'none' }
  | { kind: 'thumbnail' | 'cover' | 'article-image'; url: string };
export type EnrichmentStatus =
  | { kind: 'queued' | 'processing' }
  | { kind: 'ready'; enrichedAt: string }
  | { kind: 'failed'; errorCode: string };
export type ItemMetadata = {
  sourceUrl: string;
  sourceTitle: string | null;
  author: string | null;
  siteName: string | null;
  description: string | null;
  visual: ItemVisual;
  inference: TypeInference;
  enrichment: EnrichmentStatus;
};

export function toItemMetadataSummary(metadata: ItemMetadata | null): ItemMetadataSummary | null {
  if (metadata === null) return null;

  const visual = metadata.visual.kind === 'none'
    ? { imageUrl: null, imageKind: null }
    : { imageUrl: metadata.visual.url, imageKind: metadata.visual.kind };

  return {
    ...visual,
    siteName: metadata.siteName,
    author: metadata.author,
  };
}

export function inferUrlType(url: URL): TypeInference {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname;
  if (parseYouTubeUrl(url.href) !== null ||
    (host === 'vimeo.com' && /^\/(?:\d+|channels\/[^/]+\/\d+)(?:\/|$)/.test(path)) ||
    (host === 'player.vimeo.com' && /^\/video\/\d+/.test(path))) {
    return { type: 'video', source: 'url' };
  }
  if ((host === 'open.spotify.com' && /^\/(?:intl-[^/]+\/)?(?:episode|show)\/[^/]+/.test(path)) ||
    (host === 'podcasts.apple.com' && /\/podcast\//.test(path)) ||
    (host === 'overcast.fm' && /^\/[A-Za-z0-9_-]+$/.test(path)) ||
    (host === 'pca.st' && path.length > 1)) {
    return { type: 'podcast', source: 'url' };
  }
  if ((host === 'openlibrary.org' && /^\/(?:books|works)\/OL\d+[MW](?:\/|$)/.test(path)) ||
    (host === 'goodreads.com' && /^\/book\/show\/\d+/.test(path)) ||
    ((host === 'books.google.com' || host === 'google.com') && path === '/books' && url.searchParams.has('id'))) {
    return { type: 'book', source: 'url' };
  }
  return /\.pdf$/i.test(path)
    ? { type: 'paper', source: 'url' }
    : { type: 'article', source: 'fallback' };
}

export function parseCaptureInput(value: unknown): CaptureInput | null {
  if (!isRecord(value) || typeof value.url !== 'string' || value.url.length > 2048 || parseItemUrl(value.url) === null) return null;
  if (value.title !== undefined && (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 500)) return null;
  if (value.type !== undefined && !isItemType(value.type)) return null;
  return {
    url: value.url.trim(),
    ...(typeof value.title === 'string' ? { title: value.title.trim() } : {}),
    ...(isItemType(value.type) ? { type: value.type } : {}),
  };
}

export function parseCaptureResult(value: unknown): CaptureResult | null {
  if (!isRecord(value) || typeof value.created !== 'boolean') return null;
  const item = parseItem(value.item);
  return item === null ? null : { item, created: value.created };
}

export function parseItemMetadata(value: unknown): ItemMetadata | null {
  if (!isRecord(value) || typeof value.sourceUrl !== 'string' || parseItemUrl(value.sourceUrl) === null ||
    !nullableString(value.sourceTitle) || !nullableString(value.author) ||
    !nullableString(value.siteName) || !nullableString(value.description)) return null;
  const inference = value.inference;
  if (!isRecord(inference) || !isItemType(inference.type) ||
    (inference.source !== 'url' && inference.source !== 'schema' && inference.source !== 'opengraph' && inference.source !== 'mime' && inference.source !== 'fallback')) return null;
  const visual = value.visual;
  if (!isRecord(visual)) return null;
  let parsedVisual: ItemVisual;
  if (visual.kind === 'none') parsedVisual = { kind: 'none' };
  else if ((visual.kind === 'thumbnail' || visual.kind === 'cover' || visual.kind === 'article-image') &&
    typeof visual.url === 'string' && parseItemUrl(visual.url) !== null) {
    parsedVisual = { kind: visual.kind, url: visual.url };
  } else return null;
  const status = value.enrichment;
  if (!isRecord(status)) return null;
  let enrichment: EnrichmentStatus;
  if (status.kind === 'queued' || status.kind === 'processing') enrichment = { kind: status.kind };
  else if (status.kind === 'ready' && typeof status.enrichedAt === 'string') enrichment = { kind: 'ready', enrichedAt: status.enrichedAt };
  else if (status.kind === 'failed' && typeof status.errorCode === 'string') enrichment = { kind: 'failed', errorCode: status.errorCode };
  else return null;
  return {
    sourceUrl: value.sourceUrl, sourceTitle: value.sourceTitle, author: value.author,
    siteName: value.siteName, description: value.description, visual: parsedVisual,
    inference: { type: inference.type, source: inference.source }, enrichment,
  };
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
