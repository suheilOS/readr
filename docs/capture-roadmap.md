# Capture and discovery roadmap

Based on the September 12, 2026 "Audit Latest Commit" conversation, checked against local HEAD `35358e0`. Phases 1 and 2 are the current implementation baseline. This document supersedes the older browser-capture scope in `implementation-plan.md` for this work.

## Product decisions

Capture persists an Inbox item before contacting the source website. Enrichment failure never means capture failure. All capture clients will share one service. The five-item Desk, lifecycle actions, reader, transitions, and always-visible Inbox remain the product foundation.

- URL capture needs only an HTTP(S) URL. Manual capture remains available for offline items and deliberate title/type choices.
- Infer from specific provider paths first, then structured metadata and MIME type. Use `article` as the provisional fallback. Spotify tracks are not podcasts; Goodreads profiles are not books. Record evidence categories rather than invented confidence percentages.
- Explicit user titles and types take precedence over enrichment. Existing items count as manually specified.
- Repeated quick capture returns the existing item in its current section. It does not move a finished item back to Inbox, erase notes, or reset progress. A future reread flow can be explicit. Historical duplicate items are preserved, not silently merged or deleted.
- Keep source metadata separate from lifecycle data and long reader content. Distinguish landscape thumbnails/article images from portrait book covers.
- Show "Saved" once persistence succeeds. Transcript acquisition is independent and may complete later or fail without losing the URL.

## Sequence and acceptance gates

### 1. Shared capture and enrichment foundation

Implement `POST /api/capture`, returning the authoritative item and whether it was newly created. Add normalized capture identities, separate metadata, declared-field protection, a metadata/status read endpoint, and bounded retries. Keep existing item and YouTube capture APIs compatible.

Persist the item and pending enrichment together in a D1 transaction. Start a best-effort immediate attempt through `waitUntil`; a scheduled Worker recovers queued work and expired leases. This uses the existing database without a second delivery system. A Queue can replace the dispatcher if throughput requires it, while retaining the database job record. A lone `waitUntil` call is not durable scheduling.

Fetch only bounded public HTML/PDF metadata with redirect validation and a total timeout. Extract source title, author, site, description, image, and type evidence. Reader extraction and transcript fetching remain separate. Store fetched/canonical source URLs as metadata; never let an arbitrary page's canonical tag merge users' items.

Gate: real D1 tests prove capture before upstream response, concurrent duplicate handling, ownership/CSRF protection, persisted retry recovery, deletion during work, manual-field preservation, and metadata fetch limits. Build, lint, and existing suites pass. Apply the additive migration before deploying the Worker. Do not bulk-enrich old items on deployment.

### 2. Fast capture in the web app

Make URL entry the primary capture path while retaining manual entry. Route Ctrl+V/Cmd+V through the normal `paste` event outside editable controls. Ignore non-URL text, rich editors, dialogs, and already-handled events. No persistent clipboard permission or clipboard polling.

Reuse the capture channel in `useItemLibrary`; lifecycle operations stay independent. Reconcile returned items immediately, including duplicates. Refresh pending metadata without the startup loading screen, with bounded polling while visible and refresh on return. Keep current search and focus stable.

Gate: paste works on desktop and mobile where supported; editing still pastes normally; duplicate feedback names the actual section; slow enrichment does not block another capture or lifecycle action.

### 3. One-click extension and automatic YouTube transcripts

Remove the action popup. Clicking saves the current supported tab through the common capture path, with badge state and a browser notification. Keep sign-in recovery actionable. Preserve the existing signed-in Readr bridge initially; do not copy session cookies or introduce broad host access without need.

For YouTube, persist the URL first, then run bundled Defuddle against the live page and submit validated media enrichment to that item. Inspect the exact installed release before choosing its adapter. Prefer inline player/caption requests and use automatic DOM fallback only when needed. No instruction to the user to open the transcript panel.

Gate: test real Chrome pages with the transcript closed, manual and automatic captions, no captions, language variants, YouTube SPA navigation, expired login, and a closed Readr tab. Verify video identity before storing a result. A late failed attempt must not overwrite a usable stored transcript. Tests with fixtures alone do not establish YouTube reliability.

### 4. Richer Desk and Library presentation

Use stored metadata for YouTube thumbnails and article images. Keep Inbox compact. Reserve image dimensions, lazy-load, handle broken/missing images, and avoid layout shifts. Book covers keep their portrait proportions. Preserve keyboard actions, lifecycle transitions, and reduced motion.

Gate: real mixed-content data in light/dark themes, narrow/wide viewports, missing images, and keyboard-only use. No reader request is needed merely to draw a card.

### 5. Library Quick Look

Add an ephemeral accessible dialog, adapted for mobile, showing available visual, title, author/source, finish date, description, and existing note. Offer reader/original-link actions. Escape closes and focus returns to the trigger. Fetch missing metadata through the common layer. Do not add a fake "Write about this" integration before its destination exists.

Gate: no accidental navigation or lifecycle changes; keyboard and mobile dismissal work; sparse metadata remains useful.

### 6. Book identity and covers

Use validated ISBN or provider edition/work identifiers for enrichment. Add an explicit edition-selection flow for ambiguous title searches. Never silently choose an edition from title alone. Use provider limits and cache successful lookups.

Gate: ISBN variants, missing covers, multiple editions, provider errors, and manual corrections. This extends the metadata model without changing lifecycle semantics.

### 7. iOS share-sheet Shortcut

Introduce revocable, hashed-at-rest, capture-only credentials and an installation flow. The Shortcut sends a URL to the same capture service. Token authentication must not grant item reads, deletes, lifecycle changes, or account access; duplicate responses must not expose private notes/history to capture-only tokens.

Gate: test an actual shared Shortcut on iPhone, expired/revoked credentials, duplicate saves, and failure feedback. A browser session cookie is not Shortcut authentication.

## Corrections and evidence

The intended Shiori reference is Brian Lovin's `shiori.sh`, not `go-shiori/shiori`. Treat its capture interaction as inspiration, not evidence of its private transcript implementation.

The local extension currently scrapes rendered transcripts. The Worker already has independent metadata/transcript paths and stored browser captures. Preserve these useful boundaries.

The current [Defuddle YouTube extractor](https://github.com/kepano/defuddle/blob/main/src/extractors/youtube.ts) supports programmatic acquisition and automatic DOM fallback, but upstream main is not proof that the installed version behaves identically. Live page access improves the available inputs; it does not guarantee captions for every video. Review [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) alongside the pinned Defuddle source during phase 3.

[Cloudflare scheduled handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/) provide recovery dispatch. If moving to [Queues](https://developers.cloudflare.com/queues/reference/delivery-guarantees/), consumers must still tolerate repeated delivery.

## Implementation status

- Phase 1: implemented locally. URL capture, metadata/status and retry APIs, D1 persistence, scheduled recovery, and typed client helpers are available.
- Phase 2: implemented locally. The web form and global paste handler use the shared URL capture path, preserve manual capture, reconcile duplicates immediately, and refresh pending enrichment without blocking lifecycle actions.
- Phases 3–7: planned, not implemented by this change.
- Production rollout and live extension smoke tests: separate from local implementation and validation.

Validation includes 34 new capture/enrichment tests using the real local D1 runtime and controlled upstream responses. Existing Worker, DOM, and extension suites pass, along with TypeScript/build, lint, and the Wrangler deployment dry run. The migration is exercised by the Worker test setup. External websites and live Chrome extension capture were not used to claim transcript reliability.
