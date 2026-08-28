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
POST   /api/media/youtube/metadata
POST   /api/media/youtube/transcript
POST   /api/media/youtube       (legacy compatibility)
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

The YouTube metadata and transcript endpoints accept watch, short, embed, live, and `youtu.be` URLs, reduce them to a validated video ID, and run independently. Metadata comes from YouTube's oEmbed endpoint; transcript segments and chapters come from Defuddle's asynchronous YouTube extraction path, which fetches player and timed-text data directly without relying on watch-page HTML. Neither endpoint returns extracted iframe HTML. Transcript failures degrade to the player and original link, while metadata failures leave the stored item title in place. The old combined `POST /api/media/youtube` response remains temporarily for already-open tabs during deployment and should not be used by new clients. Playback progress lives in a separate `media_progress` table and saves periodically while playing and when the page closes.

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

The deploy command builds the app, applies pending migrations to the remote `readr` D1 database, and then deploys the Worker. If a migration fails, deployment stops before the Worker is updated.

## License

MIT. See [LICENSE](LICENSE).
