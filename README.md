# readr

readr is a focused reading queue for deciding what deserves your attention.

Capture articles, papers, books, podcasts, and videos. Keep a small desk of up to five items, finish what you choose, and retain a quiet record in your library. Articles and papers with links can open in a distraction-free reader; other media stay external.

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
- Fall back to the original link when extraction is not available.
- Light and dark themes, with optional sound cues.
- Versioned local storage that keeps the queue across reloads.

Queue management works in the browser without an account. Items, theme preferences, and sound preferences are stored locally for the page origin; readr does not provide accounts or cloud sync.

## Local development

The project uses Bun.

```sh
bun install
bun run dev
```

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

## Reader endpoint

The Worker exposes one application route:

```http
POST /api/extract
Content-Type: application/json

{"url":"https://example.com/article"}
```

The Worker accepts public HTTP(S) page URLs, removes common tracking parameters, fetches the HTML server-side, and extracts the readable content with Defuddle. The client sanitizes the returned HTML before rendering it. The endpoint rejects unsafe URLs, unsupported content, oversized requests or pages, rate-limited clients, and upstream failures with structured error responses.

## Project structure

- `src/` — React interface, local persistence, reader, themes, and sound cues.
- `worker/` — Cloudflare Worker entry point, URL checks, and article extraction.
- `shared/` — Types and validation shared by the client and Worker.
- `tests/` — Worker, storage, lifecycle, sanitization, and Chromium reader tests.
- `docs/` — Product description, project brief, and launch notes.

## Deployment

The app is configured for Cloudflare Workers static assets and the `/api/extract` Worker route. After authenticating with Wrangler and reviewing `wrangler.jsonc`, deploy with:

```sh
bun run deploy
```

## License

MIT. See [LICENSE](LICENSE).
