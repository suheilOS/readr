import { env } from 'cloudflare:workers';
import { applyD1Migrations, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../worker/index';
import { inferUrlType, parseCaptureResult, parseItemMetadata } from '../../shared/capture';
import { enrichItem, readMetadata, recoverEnrichment } from '../../worker/enrichment';
import { extractPageMetadata } from '../../worker/metadata';
import { ensureArticleContentJob, extractArticleContent } from '../../worker/articleContent';

const contexts: ReturnType<typeof createExecutionContext>[] = [];
const page = '<title>Source title</title><meta name="author" content="Ada"><meta property="og:image" content="/image.jpg">';
const articlePage = '<!doctype html><html><head><title>A Quiet Article</title></head><body><article><h1>A Quiet Article</h1><p>This article has enough readable content for Defuddle.</p><p>It is persisted for later reads.</p></article></body></html>';

beforeAll(async () => { await applyD1Migrations(env.READR_DB, env.TEST_MIGRATIONS); });
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => html(page))); });
afterEach(async () => { await settle(); vi.unstubAllGlobals(); });

describe('URL capture', () => {
  it('commits an item and durable work before the source responds', async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const user = crypto.randomUUID();
    const response = await request(user, '/api/capture', { url: 'https://example.com/slow?utm_source=test#heading' });
    expect(response.status).toBe(201);
    const result = parseCaptureResult(await response.json());
    expect(result?.item).toMatchObject({ title: 'example.com', url: 'https://example.com/slow', type: 'article', status: 'inbox' });
    const row = await env.READR_DB.prepare('SELECT state FROM item_metadata WHERE item_id = ?').bind(result!.item.id).first();
    expect(row).not.toBeNull();
    // Let both durable extraction jobs reach fetch before releasing the upstream requests.
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release(html(page));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    release(html(page));
    await settle();
    const details = await request(user, `/api/items/${result!.item.id}/metadata`);
    expect(await details.json()).toMatchObject({ item: { title: 'Source title' }, metadata: { enrichment: { kind: 'ready' } } });
    const list = await request(user, '/api/items');
    expect(await list.json()).toMatchObject({
      items: [{ metadataSummary: {
        imageUrl: 'https://example.com/image.jpg',
        imageKind: 'article-image',
        siteName: 'example.com',
        author: 'Ada',
      } }],
    });
  });

  it('converges simultaneous normalized URL captures without orphan items', async () => {
    const user = crypto.randomUUID();
    const responses = await Promise.all([
      request(user, '/api/capture', { url: 'https://example.com/same?utm_medium=a' }),
      request(user, '/api/capture', { url: 'https://example.com/same#section' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const results = await Promise.all(responses.map(async (response) => parseCaptureResult(await response.json())));
    expect(results[0]?.item.id).toBe(results[1]?.item.id);
    const rows = await env.READR_DB.prepare('SELECT id FROM items WHERE user_id = ?').bind(user).all();
    expect(rows.results).toHaveLength(1);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stores article content during capture and reuses it on read', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => html(calls++ === 0 ? page : articlePage)));
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/stored-article' });
    await settle();

    const firstRead = await request(user, `/api/items/${item.id}/article-content`);
    expect(firstRead.status).toBe(200);
    expect(await firstRead.json()).toMatchObject({
      content: { sourceUrl: 'https://example.com/stored-article', title: 'A Quiet Article' },
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    const secondRead = await request(user, `/api/items/${item.id}/article-content`);
    expect(secondRead.status).toBe(200);
    expect(await secondRead.json()).toMatchObject({ content: { title: 'A Quiet Article' } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('extracts a historical article on first read and stores the fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html(articlePage)));
    const user = crypto.randomUUID();
    const response = await request(user, '/api/items', {
      title: 'Historical article', type: 'article', url: 'https://example.com/historical-article',
    });
    const body = await response.json() as { item: { id: string } };

    const firstRead = await request(user, `/api/items/${body.item.id}/article-content`);
    expect(firstRead.status).toBe(200);
    expect(await firstRead.json()).toMatchObject({ content: { title: 'A Quiet Article' } });

    const secondRead = await request(user, `/api/items/${body.item.id}/article-content`);
    expect(secondRead.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not steal a live background article extraction lease', async () => {
    let release!: (response: Response) => void;
    const upstream = vi.fn()
      .mockResolvedValueOnce(html(page))
      .mockImplementation(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal('fetch', upstream);
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/background-lease' });
    try {
      await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2));
      const before = await env.READR_DB.prepare('SELECT lease_token, attempts FROM article_content WHERE item_id = ?').bind(item.id).first();
      const responses = await Promise.all([
        request(user, `/api/items/${item.id}/article-content`),
        request(user, `/api/items/${item.id}/article-content`),
      ]);
      for (const response of responses) {
        expect(response.status).toBe(202);
        expect(response.headers.get('Retry-After')).toBe('1');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({ status: 'processing' });
      }
      expect(upstream).toHaveBeenCalledTimes(2);
      expect(await env.READR_DB.prepare('SELECT lease_token, attempts FROM article_content WHERE item_id = ?').bind(item.id).first()).toEqual(before);
    } finally {
      release(html(articlePage));
      await settle();
    }
    expect((await request(user, `/api/items/${item.id}/article-content`)).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent foreground article extractions', async () => {
    let release!: (response: Response) => void;
    const upstream = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal('fetch', upstream);
    const user = crypto.randomUUID();
    const created = await request(user, '/api/items', { title: 'Historical', type: 'article', url: 'https://example.com/concurrent' });
    const { item } = await created.json() as { item: { id: string } };
    const first = request(user, `/api/items/${item.id}/article-content`);
    try {
      await vi.waitFor(() => expect(upstream).toHaveBeenCalledOnce());
      const second = await request(user, `/api/items/${item.id}/article-content`);
      expect(second.status).toBe(202);
      expect(upstream).toHaveBeenCalledOnce();
    } finally {
      release(html(articlePage));
    }
    expect((await first).status).toBe(200);
    expect((await request(user, `/api/items/${item.id}/article-content`)).status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it.each(['expired', 'failed'] as const)('allows a foreground retry for an %s extraction', async (state) => {
    vi.stubGlobal('fetch', vi.fn(async () => html(articlePage)));
    const user = crypto.randomUUID();
    const created = await request(user, '/api/items', { title: 'Retry', type: 'article', url: 'https://example.com/retry' });
    const { item } = await created.json() as { item: { id: string } };
    await ensureArticleContentJob(env.READR_DB, item.id, 'https://example.com/retry');
    await env.READR_DB.prepare(`UPDATE article_content SET state = ?, attempts = 3,
      lease_token = ?, lease_until = ? WHERE item_id = ?`)
      .bind(state === 'expired' ? 'processing' : 'failed', state === 'expired' ? 'old' : null, state === 'expired' ? 0 : null, item.id).run();
    const response = await request(user, `/api/items/${item.id}/article-content`);
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns ready content when extraction completes between the first read and claim', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html(articlePage)));
    const user = crypto.randomUUID();
    const sourceUrl = 'https://example.com/completion-race';
    const created = await request(user, '/api/items', { title: 'Race', type: 'article', url: sourceUrl });
    const { item } = await created.json() as { item: { id: string } };
    await ensureArticleContentJob(env.READR_DB, item.id, sourceUrl);
    // Complete the real background job at the async boundary between the
    // initial read and claim. No SQL matching or partial D1 impersonation.
    const rateLimiter: Env['EXTRACT_RATE_LIMITER'] = {
      limit: async () => {
        await extractArticleContent(env.READR_DB, item.id);
        return { success: true };
      },
    };
    const response = await request(user, `/api/items/${item.id}/article-content`, undefined, 'https://readr.test', rateLimiter);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: { title: 'A Quiet Article' } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('keeps duplicate library state, notes, and explicit fields', async () => {
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/manual', title: 'My title', type: 'book' });
    await settle();
    await request(user, `/api/items/${item.id}/finish`, {});
    await env.READR_DB.prepare('UPDATE items SET note = ? WHERE id = ?').bind('My note', item.id).run();
    const duplicate = parseCaptureResult(await (await request(user, '/api/capture', { url: item.url })).json());
    expect(duplicate).toMatchObject({ created: false, item: { id: item.id, title: 'My title', type: 'book', status: 'library', note: 'My note' } });
    expect(duplicate?.item.finishedAt).not.toBeNull();
    expect(await readMetadata(env.READR_DB, user, item.id)).toMatchObject({ sourceTitle: 'Source title' });
  });

  it('adopts historical items without rewriting manual fields or deleting duplicates', async () => {
    const user = crypto.randomUUID();
    for (const title of ['First title', 'Second title']) {
      await request(user, '/api/items', { title, type: 'book', url: 'https://example.com/history?utm_source=old' });
    }
    const result = await request(user, '/api/capture', { url: 'https://example.com/history' });
    expect(result.status).toBe(200);
    await settle();
    const rows = await env.READR_DB.prepare('SELECT title, type FROM items WHERE user_id = ?').bind(user).all();
    expect(rows.results).toHaveLength(2);
    expect(rows.results.every((row) => row.type === 'book' && row.title !== 'Source title')).toBe(true);
  });

  it('does not scan capture-indexed historical items for a new URL identity', async () => {
    const user = crypto.randomUUID();
    const historicalResponse = await request(user, '/api/items', {
      title: 'Historical item', type: 'article', url: 'https://example.com/history?utm_source=old',
    });
    const historical = await historicalResponse.json() as { item: { id: string } };
    await env.READR_DB.prepare(
      'INSERT INTO capture_urls (user_id, normalized_url, item_id) VALUES (?, ?, ?)',
    ).bind(user, 'https://example.com/another-url', historical.item.id).run();

    const captured = await request(user, '/api/capture', { url: 'https://example.com/history?utm_medium=new' });
    expect(captured.status).toBe(201);
    expect(parseCaptureResult(await captured.json())?.item.id).not.toBe(historical.item.id);
  });

  it('shares YouTube identity with the legacy capture route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ title: 'Video', author_name: 'Channel' })));
    const user = crypto.randomUUID();
    const response = await request(user, '/api/media/youtube/capture', {
      kind: 'youtube_capture', videoId: 'dQw4w9WgXcQ', sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Captured video', author: null, description: null, thumbnailUrl: null, transcript: { kind: 'unavailable' },
    });
    const legacy = parseCaptureResult(await response.json());
    const generic = parseCaptureResult(await (await request(user, '/api/capture', { url: 'https://youtu.be/dQw4w9WgXcQ?t=30' })).json());
    expect(generic?.item.id).toBe(legacy?.item.id);
    expect(generic?.created).toBe(false);
  });

  it('isolates identities and metadata by owner', async () => {
    const firstUser = crypto.randomUUID();
    const secondUser = crypto.randomUUID();
    const first = await capture(firstUser, { url: 'https://example.com/private' });
    const second = await capture(secondUser, { url: 'https://example.com/private' });
    expect(second.id).not.toBe(first.id);
    expect((await request(secondUser, `/api/items/${first.id}/metadata`)).status).toBe(404);
    expect((await request(secondUser, `/api/items/${first.id}/enrichment/retry`, {})).status).toBe(404);
  });

  it('requires authentication and same-origin writes', async () => {
    expect((await request(null, '/api/capture', { url: 'https://example.com' })).status).toBe(401);
    expect((await request(crypto.randomUUID(), '/api/capture', { url: 'https://example.com' }, 'https://evil.test')).status).toBe(403);
  });

  it.each(['http://127.0.0.1/a', 'https://localhost/a', 'file:///tmp/a', 'https://example.com:444/a', 'https://me:secret@example.com/a'])('rejects unsafe input %s', async (url) => {
    const response = await request(crypto.randomUUID(), '/api/capture', { url });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds request size and validates optional fields', async () => {
    expect((await request(crypto.randomUUID(), '/api/capture', { url: 'https://example.com', title: 'a'.repeat(9000) })).status).toBe(413);
    expect((await request(crypto.randomUUID(), '/api/capture', { url: 'https://example.com', type: 'unknown' })).status).toBe(400);
  });
});

describe('durable enrichment', () => {
  it('retries transient failures through scheduled recovery', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/retry' });
    await settle();
    expect(await readMetadata(env.READR_DB, user, item.id)).toMatchObject({ enrichment: { kind: 'queued' } });
    await env.READR_DB.prepare('UPDATE item_metadata SET next_attempt_at = 0 WHERE item_id = ?').bind(item.id).run();
    vi.stubGlobal('fetch', vi.fn(async () => html(page)));
    await recoverEnrichment(env.READR_DB);
    expect(await readMetadata(env.READR_DB, user, item.id)).toMatchObject({ sourceTitle: 'Source title', enrichment: { kind: 'ready' } });
  });

  it('recovers expired leases and terminates an interrupted final attempt', async () => {
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/interrupted' });
    await settle();
    await env.READR_DB.prepare("UPDATE item_metadata SET state = 'processing', attempts = 1, lease_token = 'old', lease_until = 0 WHERE item_id = ?").bind(item.id).run();
    await recoverEnrichment(env.READR_DB);
    expect((await readMetadata(env.READR_DB, user, item.id))?.enrichment.kind).toBe('ready');
    await env.READR_DB.prepare("UPDATE item_metadata SET state = 'processing', attempts = 3, lease_token = 'old', lease_until = 0 WHERE item_id = ?").bind(item.id).run();
    await recoverEnrichment(env.READR_DB);
    expect((await readMetadata(env.READR_DB, user, item.id))?.enrichment).toEqual({ kind: 'failed', errorCode: 'interrupted' });
    expect((await request(user, `/api/items/${item.id}/enrichment/retry`, {})).status).toBe(202);
    await settle();
    expect((await readMetadata(env.READR_DB, user, item.id))?.enrichment.kind).toBe('ready');
  });

  it('bounds automatic retry attempts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/fails' });
    await settle();
    for (let attempt = 0; attempt < 3; attempt++) {
      await env.READR_DB.prepare('UPDATE item_metadata SET next_attempt_at = 0 WHERE item_id = ?').bind(item.id).run();
      await enrichItem(env.READR_DB, item.id);
    }
    expect(fetch).toHaveBeenCalledTimes(4);
    expect((await readMetadata(env.READR_DB, user, item.id))?.enrichment.kind).toBe('failed');
  });

  it('does not recreate an item discarded during extraction', async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/discarded' });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await env.READR_DB.prepare('DELETE FROM items WHERE id = ?').bind(item.id).run();
    release(html(page));
    await settle();
    expect(await readMetadata(env.READR_DB, user, item.id)).toBeNull();
    expect(await env.READR_DB.prepare('SELECT * FROM capture_urls WHERE item_id = ?').bind(item.id).first()).toBeNull();
  });

  it('does not allow a superseded worker to overwrite metadata', async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/lease' });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await env.READR_DB.prepare("UPDATE item_metadata SET lease_token = 'replacement' WHERE item_id = ?").bind(item.id).run();
    release(html(page));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    release(html(page));
    await settle();
    expect((await readMetadata(env.READR_DB, user, item.id))?.sourceTitle).toBeNull();
    await env.READR_DB.prepare("UPDATE item_metadata SET state = 'failed', error_code = 'interrupted', lease_token = NULL, lease_until = NULL WHERE item_id = ?").bind(item.id).run();
  });

  it('recognizes a PDF from MIME without downloading its content', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'application/pdf' } })));
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/download' });
    await settle();
    expect(cancel).toHaveBeenCalledOnce();
    expect(await readMetadata(env.READR_DB, user, item.id)).toMatchObject({ inference: { type: 'paper', source: 'mime' }, enrichment: { kind: 'ready' } });
  });

  it('rejects private redirects without requesting their target', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } })));
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/redirect' });
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await readMetadata(env.READR_DB, user, item.id))?.enrichment.kind).not.toBe('ready');
  });

  it('rejects oversized HTML while preserving the saved item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html('x'.repeat(1024 * 1024 + 1))));
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://example.com/large' });
    await settle();
    expect((await readMetadata(env.READR_DB, user, item.id))?.enrichment).toEqual({ kind: 'failed', errorCode: 'response_too_large' });
  });

  it('bounds YouTube metadata responses too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ title: 'x'.repeat(64 * 1024) })));
    const user = crypto.randomUUID();
    const item = await capture(user, { url: 'https://youtu.be/dQw4w9WgXcQ' });
    await settle();
    expect((await readMetadata(env.READR_DB, user, item.id))?.enrichment).toEqual({ kind: 'failed', errorCode: 'response_too_large' });
  });
});

describe('metadata evidence', () => {
  it.each([
    ['https://youtu.be/dQw4w9WgXcQ', 'video'], ['https://youtube.com/@channel', 'article'],
    ['https://open.spotify.com/episode/123', 'podcast'], ['https://open.spotify.com/track/123', 'article'],
    ['https://openlibrary.org/books/OL123M/title', 'book'], ['https://goodreads.com/user/show/1', 'article'],
    ['https://example.com/file.PDF?download=1', 'paper'], ['https://vimeo.com/123', 'video'],
  ])('infers %s as %s', (url, type) => { expect(inferUrlType(new URL(url)).type).toBe(type); });

  it('extracts structured metadata, resolves images, and records canonical URLs without using them as identity', () => {
    const metadata = extractPageMetadata(`<title>Fallback</title><link rel="canonical" href="/canonical">
      <script type="application/ld+json">{"@graph":[{"@type":"PodcastEpisode","name":"Episode","author":{"name":"Ada"},"image":"/cover.jpg"}]}</script>`, new URL('https://example.com/entry'));
    expect(metadata).toMatchObject({ sourceTitle: 'Episode', author: 'Ada', sourceUrl: 'https://example.com/canonical',
      inference: { type: 'podcast', source: 'schema' }, visual: { url: 'https://example.com/cover.jpg' } });
    expect(parseItemMetadata({ ...metadata, enrichment: { kind: 'ready', enrichedAt: new Date().toISOString() } })).not.toBeNull();
  });

  it('ignores malformed JSON and unsafe image URLs', () => {
    const metadata = extractPageMetadata('<title>Useful title</title><script type="application/ld+json">bad</script><meta property="og:image" content="javascript:alert(1)">', new URL('https://example.com'));
    expect(metadata.sourceTitle).toBe('Useful title');
    expect(metadata.visual).toEqual({ kind: 'none' });
  });

  it('falls back to the first safe image source', () => {
    const metadata = extractPageMetadata('<meta property="og:image" content="javascript:alert(1)"><meta name="twitter:image" content="/safe.jpg">', new URL('https://example.com'));
    expect(metadata.visual).toEqual({ kind: 'article-image', url: 'https://example.com/safe.jpg' });
  });

  it('uses Open Graph evidence and falls back from malformed structured titles', () => {
    const metadata = extractPageMetadata('<title>A film</title><meta property="og:type" content="video.movie"><script type="application/ld+json">{"@type":"VideoObject","name":42}</script>', new URL('https://example.com'));
    expect(metadata.sourceTitle).toBe('A film');
    expect(metadata.inference).toEqual({ type: 'video', source: 'schema' });
    expect(extractPageMetadata('<meta property="og:type" content="book">', new URL('https://example.com')).inference).toEqual({ type: 'book', source: 'opengraph' });
  });

  it('keeps provider URL evidence ahead of page schema evidence', () => {
    const metadata = extractPageMetadata('<script type="application/ld+json">{"@type":"Article"}</script>', new URL('https://vimeo.com/123'));
    expect(metadata.inference).toEqual({ type: 'video', source: 'url' });
  });

  it('rejects invalid metadata response shapes at the client boundary', () => {
    const metadata = extractPageMetadata(page, new URL('https://example.com'));
    expect(parseItemMetadata({ ...metadata, enrichment: { kind: 'ready' } })).toBeNull();
    expect(parseItemMetadata({ ...metadata, visual: { kind: 'cover', url: 'javascript:alert(1)' }, enrichment: { kind: 'queued' } })).toBeNull();
    expect(parseItemMetadata({ ...metadata, inference: { type: 'unknown', source: 'schema' }, enrichment: { kind: 'queued' } })).toBeNull();
  });
});

function html(body: string): Response { return new Response(body, { headers: { 'Content-Type': 'text/html' } }); }

async function capture(user: string, body: unknown) {
  const response = await request(user, '/api/capture', body);
  expect(response.status).toBe(201);
  const result = parseCaptureResult(await response.json());
  if (result === null) throw new Error('Invalid capture response');
  return result.item;
}

async function request(user: string | null, path: string, body?: unknown, origin = 'https://readr.test', rateLimiter = env.EXTRACT_RATE_LIMITER): Promise<Response> {
  const context = createExecutionContext();
  contexts.push(context);
  return worker.fetch(new Request(`https://readr.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, ...(user === null ? {} : { Cookie: `session=${user}` }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), {
    ...env,
    EXTRACT_RATE_LIMITER: rateLimiter,
    AUTH_SERVICE: {
      getSession: async () => user === null ? null : { userId: user, sessionId: 'test', expiresAt: '2099-01-01' },
      signOut: async () => new Response(),
    },
  }, context);
}

async function settle(): Promise<void> {
  await Promise.all(contexts.splice(0).map((context) => waitOnExecutionContext(context)));
}
