import { parseHTML } from 'linkedom/worker';
import { inferUrlType, type ItemMetadata, type TypeInference } from '../shared/capture';
import { parseYouTubeUrl } from '../shared/media';
import { fetchPage } from './extract';
import { extractYouTubeMetadata } from './media';
import { normalizePublicUrl, resolvePublicUrl } from './urlSafety';

export type ExtractedMetadata = Omit<ItemMetadata, 'enrichment'>;

export async function fetchMetadata(url: URL): Promise<ExtractedMetadata> {
  const youtube = parseYouTubeUrl(url.href);
  if (youtube !== null) {
    const metadata = await extractYouTubeMetadata({ url: youtube.canonicalUrl, language: null }, youtube);
    return {
      sourceUrl: youtube.canonicalUrl, sourceTitle: cleanText(metadata.title, 500),
      author: cleanText(metadata.author, 500), siteName: 'YouTube', description: null,
      visual: metadata.thumbnailUrl === null ? { kind: 'none' } : { kind: 'thumbnail', url: metadata.thumbnailUrl },
      inference: { type: 'video', source: 'url' },
    };
  }
  const page = await fetchPage(url, { allowPdf: true, maxBytes: 1024 * 1024 });
  if (page.kind === 'pdf') return {
    sourceUrl: page.sourceUrl, sourceTitle: null, author: null,
    siteName: new URL(page.sourceUrl).hostname, description: null, visual: { kind: 'none' },
    inference: { type: 'paper', source: 'mime' },
  };
  return extractPageMetadata(page.html, new URL(page.sourceUrl));
}

export function extractPageMetadata(html: string, url: URL): ExtractedMetadata {
  const { document } = parseHTML(html);
  const meta = (name: string) => cleanText(document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content'), 2000);
  const entities: Record<string, unknown>[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { collectEntities(JSON.parse(script.textContent ?? ''), entities, 0); } catch { /* Invalid structured data is common. */ }
  }
  // Only use typed entities; arbitrary nested recommendations are not page identity.
  const entity = entities.find((entry) => schemaType(entry['@type']) !== null);
  const structuredType = entity === undefined ? null : schemaType(entity['@type']);
  const inferred = inferUrlType(url);
  const ogType = meta('og:type');
  const ogInference: TypeInference | null = ogType === 'book' ? { type: 'book', source: 'opengraph' }
    : ogType?.startsWith('video.') ? { type: 'video', source: 'opengraph' } : null;
  const inference: TypeInference = inferred.source === 'url' ? inferred
    : structuredType === null ? ogInference ?? inferred : { type: structuredType, source: 'schema' };
  const author = entity?.author;
  const image = entity?.image;
  const imageValue = typeof image === 'string' ? image : isRecord(image) ? image.url : null;
  const imageUrl = firstPublicUrl([
    meta('og:image'),
    meta('twitter:image'),
    cleanText(imageValue, 2048),
  ], url);
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const sourceUrl = canonical ? resolvePublicUrl(canonical, url)?.href ?? url.href : url.href;
  return {
    sourceUrl,
    sourceTitle: cleanText(meta('og:title') ?? meta('twitter:title') ?? cleanText(entity?.headline, 500) ?? cleanText(entity?.name, 500) ?? document.querySelector('title')?.textContent, 500),
    author: cleanText(meta('author') ?? (isRecord(author) ? author.name : author), 500),
    siteName: cleanText(meta('og:site_name'), 500) ?? url.hostname.replace(/^www\./, ''),
    description: cleanText(meta('og:description') ?? meta('description') ?? entity?.description, 2000),
    visual: imageUrl === null ? { kind: 'none' } : {
      kind: inference.type === 'book' ? 'cover' : inference.type === 'video' ? 'thumbnail' : 'article-image',
      url: imageUrl.href,
    },
    inference,
  };
}

export function normalizeCaptureUrl(input: string): URL | null {
  const url = normalizePublicUrl(input);
  if (url === null) return null;
  const youtube = parseYouTubeUrl(url.href);
  return youtube === null ? url : new URL(youtube.canonicalUrl);
}

function schemaType(value: unknown): TypeInference['type'] | null {
  const values = Array.isArray(value) ? value : [value];
  for (const type of values) {
    if (type === 'Book') return 'book';
    if (type === 'PodcastEpisode' || type === 'PodcastSeries') return 'podcast';
    if (type === 'VideoObject') return 'video';
    if (type === 'ScholarlyArticle') return 'paper';
    if (type === 'Article' || type === 'NewsArticle' || type === 'BlogPosting') return 'article';
  }
  return null;
}

function collectEntities(value: unknown, entities: Record<string, unknown>[], depth: number): void {
  if (depth > 4 || entities.length >= 100) return;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 100)) collectEntities(entry, entities, depth + 1);
  } else if (isRecord(value)) {
    entities.push(value);
    collectEntities(value['@graph'], entities, depth + 1);
    collectEntities(value.mainEntity, entities, depth + 1);
  }
}

function cleanText(value: unknown, limit: number): string | null {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) || null : null;
}

function firstPublicUrl(values: readonly (string | null)[], baseUrl: URL): URL | null {
  for (const value of values) {
    if (value === null) continue;
    const url = resolvePublicUrl(value, baseUrl);
    if (url !== null) return url;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
