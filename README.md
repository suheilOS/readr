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

- Capture a title, optional link, and type: article, book, paper, video, or podcast.
- Search titles and links across the inbox, desk, and library.
- Read linked articles and papers in the app with extracted title, author, reading time, and word count.
- Watch supported YouTube links with a sticky player, timestamp seeking, transcript follow mode, chapters, keyboard controls, and saved playback position.
- Fall back to the original link when extraction is not available.
- Light and dark themes, with optional sound cues.
- Server-backed item data that follows your account across devices.

Readr requires an Overhawl account. Item data lives in the Readr D1 database; the browser stores only theme and sound preferences.

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
POST   /api/items/:id/move-to-desk
POST   /api/items/:id/move-to-inbox
POST   /api/items/:id/finish
DELETE /api/items/:id
POST   /api/items/:candidateId/swap
POST   /api/extract
POST   /api/media/youtube
GET    /api/items/:id/media-progress
PUT    /api/items/:id/media-progress
```

The item API owns IDs, timestamps, ownership checks, validation, desk capacity, lifecycle changes, and swaps. Discard is permanent.

### Reader endpoint

The Worker exposes the extraction route:

```http
POST /api/extract
Content-Type: application/json

{"url":"https://example.com/article"}
```

The Worker accepts public HTTP(S) page URLs, removes common tracking parameters, fetches the HTML server-side, and extracts the readable content with Defuddle. The client sanitizes the returned HTML before rendering it. The endpoint rejects unsafe URLs, unsupported content, oversized requests or pages, rate-limited clients, and upstream failures with structured error responses.

The YouTube endpoint accepts watch, short, embed, live, and `youtu.be` URLs, reduces them to a validated video ID, and returns structured metadata and transcript data from Defuddle's asynchronous extractor. It never returns extracted iframe HTML. Transcript failures degrade to the player and original link. Playback progress lives in a separate `media_progress` table and saves periodically while playing and when playback pauses or the page closes.

## Project structure

- `src/` — React interface, API client, reader, themes, and sound cues.
- `worker/` — Hono routes, Auth Service session checks, D1 item handlers, URL checks, and extraction.
- `migrations/` — Readr D1 schema migrations.
- `shared/` — Types and validation shared by the client and Worker.
- `tests/` — Worker, lifecycle, sanitization, and Chromium reader tests.
- `docs/` — Product description, project brief, and launch notes.

## Deployment

The app is configured for Cloudflare Workers static assets, Readr D1, and an Auth Service Binding to the deployed `overhawl-auth` Worker. Deploy Auth before Readr. After authenticating with Wrangler and reviewing `wrangler.jsonc`, deploy with:

```sh
bun run deploy
```

## License

MIT. See [LICENSE](LICENSE).
