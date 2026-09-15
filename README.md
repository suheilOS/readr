# readr

readr is a focused reading queue for deciding what deserves your attention.

Capture articles, papers, books, podcasts, and videos. Keep a small desk of up to five items, finish what you choose, and retain a quiet record in your library. Articles and papers open in a distraction-free reader. YouTube videos open with synchronized transcripts and resume playback when captions are available.

## How it works

Every item moves through a simple lifecycle:

- **Inbox** — capture an item without deciding what to do with it yet.
- **Desk** — choose up to five items for current attention.
- **Library** — finish an item and keep it as a record.
- **Discarded** — remove an item permanently.

The desk has a fixed capacity of five. When it is full, replacing an item discards the displaced item rather than returning it to the inbox.

## Features

- Capture a URL quickly or add a manual item with a title, optional link, and type: article, book, paper, video, or podcast.
- Search titles and links across the inbox, desk, and library.
- Read linked articles and papers in the app with extracted title, author, reading time, and word count.
- Watch supported YouTube links with a sticky player, timestamp seeking, transcript follow mode, chapters, keyboard controls, and saved playback position.
- Save the current browser tab with the companion Chrome MV3 extension; YouTube transcript and chapter enrichment is automatic and best-effort.
- Fall back to the original link when extraction is not available.
- Light and dark themes, with optional sound cues.
- Server-backed item data that follows your account across devices.

Readr requires an Overhawl account. Item data lives in the Readr D1 database; the browser stores only theme and sound preferences. Article content intentionally preserves public HTTPS image URLs from the source page, so opening an article can request those images from their original hosts.

## Local development

The project uses Bun. Apply the local D1 schema before running the Worker:

```sh
bun install
bunx wrangler d1 migrations apply readr --local
bun run dev
```

Use `bun run preview:cloudflare` to exercise the built app, Worker, D1 API, and Auth Service Binding locally.

Run the checks used by the project with:

```sh
bun run build
bun run lint
bun run test
bunx playwright install chromium
bun run test:e2e
```

To run the built app with the Cloudflare Worker route locally:

```sh
bun run preview:cloudflare
```

## API

All item and extraction requests require an Overhawl session. The Worker exposes these routes:

```http
GET    /api/items
POST   /api/items
POST   /api/capture
GET    /api/items/:id/metadata
GET    /api/items/:id/article-content
POST   /api/items/:id/enrichment/retry
POST   /api/items/:id/move-to-desk
POST   /api/items/:id/move-to-inbox
POST   /api/items/:id/finish
DELETE /api/items/:id
POST   /api/items/:candidateId/swap
POST   /api/extract
POST   /api/media/youtube/metadata
POST   /api/media/youtube/transcript
POST   /api/media/youtube       (legacy compatibility)
POST   /api/media/youtube/capture       (legacy browser-capture compatibility)
POST   /api/items/:id/media/youtube     (targeted browser media attachment)
GET    /api/items/:id/media-content
GET    /api/items/:id/media-progress
PUT    /api/items/:id/media-progress
```

The item API owns IDs, timestamps, ownership checks, validation, desk capacity, lifecycle changes, and swaps. Discard is permanent.

### URL capture foundation

`POST /api/capture` accepts `{"url":"https://example.com/article"}` with optional explicit `title` and `type`. It saves an Inbox item and pending enrichment atomically, then returns `{ item, created }` without waiting for the source website. Provider URL rules supply a provisional type and the hostname supplies a fallback title. An existing normalized URL returns its item with `created: false` and preserves its current section, note, and progress. Historical duplicate rows are retained.

Metadata runs after the response. `item_metadata` stores source title, author, site, description, visual, inference evidence, and processing status separately from lifecycle data. Automatically generated titles and types can be updated; manually supplied fields and all pre-existing titles/types are protected. `GET /api/items/:id/metadata` returns `{ item, metadata }`, including the current authoritative item; metadata is `null` for items not yet enrolled in enrichment. Failed enrichment can be retried with `POST /api/items/:id/enrichment/retry`. These routes use the existing session and same-origin write protection.

The D1 job record survives request termination. A one-minute scheduled handler recovers pending jobs and expired leases, processes at most ten jobs with concurrency two, and stops after three attempts. Source requests have a ten-second total timeout, a 1 MiB HTML limit, and public-URL checks on redirects. YouTube uses the existing oEmbed path with a four-second timeout and a 64 KiB response limit. PDF MIME detection cancels the body. Article reader extraction is a separate job; metadata enrichment does not fetch transcripts.

Apply migrations through `0009_capture_urls_owner_integrity.sql` before deploying this Worker. Local immediate enrichment works with the normal development server; scheduled recovery can be exercised with Wrangler's scheduled-event testing. Deployment does not bulk-enrich old items. The web form, paste shortcut, and one-click extension are implemented in Phases 2 and 3 of [the capture roadmap](docs/capture-roadmap.md).

### Reader endpoint

Article capture creates a durable D1-backed extraction job. The Worker starts it after capture with `waitUntil`, and the scheduled handler recovers queued or expired leases. Ready snapshots are served by:

```http
GET /api/items/:id/article-content
```

Historical items and failed background jobs use the same extraction path on first open and persist a successful result. The Worker accepts public HTTP(S) page URLs, removes common tracking parameters, fetches the HTML server-side, and extracts readable content with Defuddle. The client sanitizes returned HTML before rendering it. Stored content is bounded below D1's row limit; unusually large successful extractions are still returned for the current read but are not persisted. `POST /api/extract` remains as an authenticated compatibility endpoint and reports `Server-Timing` phases (`fetch-source`, `parse-html`, and `defuddle`).

The YouTube metadata and transcript endpoints accept watch, short, embed, live, and `youtu.be` URLs, reduce them to a validated video ID, and run independently. Metadata comes from YouTube's oEmbed endpoint; transcript segments and chapters come from Defuddle's asynchronous YouTube extraction path, which fetches player and timed-text data directly without relying on watch-page HTML. Neither endpoint returns extracted iframe HTML. Transcript failures degrade to the player and original link, while metadata failures leave the stored item title in place. The old combined `POST /api/media/youtube` response remains temporarily for already-open tabs during deployment and should not be used by new clients. Playback progress lives in a separate `media_progress` table and saves periodically while playing and when the page closes.

The companion Chrome MV3 extension has no popup: its action saves the active HTTP(S) URL through `POST /api/capture`, then shows a native notification. For YouTube, the live-page content script runs bundled Defuddle `0.19.2` after URL persistence and attaches validated transcript, chapter, and media data to the returned item through `POST /api/items/:id/media/youtube`. This enrichment is best-effort; unavailable captions or a failed extraction never undo a successful URL capture. The signed-in Readr tab bridge never reads or copies the session cookie. `GET /api/items/:id/media-content` returns stored media; the reader uses it before falling back to live extraction. Build and load `extension/dist/` with `bun run build:extension`; see [`extension/README.md`](extension/README.md).

## Project structure

- `src/` — React interface, API client, reader, themes, and sound cues.
- `worker/` — Hono routes, Auth Service session checks, D1 item handlers, URL checks, and extraction.
- `migrations/` — Readr D1 schema migrations.
- `shared/` — Types and validation shared by the client and Worker.
- `extension/` — Reviewable Chrome MV3 browser-capture files.
- `tests/` — Worker, lifecycle, sanitization, and Chromium reader tests.
- `docs/` — Product description, project brief, and launch notes.

## Deployment

The app is configured for Cloudflare Workers static assets, Readr D1, and an Auth Service Binding to the deployed `overhawl-auth` Worker. Deploy Auth before Readr. After authenticating with Wrangler and reviewing `wrangler.jsonc`, deploy with:

```sh
bun run deploy
```

The deploy command builds the app, applies pending migrations to the remote `readr` D1 database, and then deploys the Worker. If a migration fails, deployment stops before the Worker is updated.

## License

MIT. See [LICENSE](LICENSE).
