# Readr browser capture research

## Audience, date, and scope

- **Audience:** Readr maintainers
- **Date:** 2026-08-28
- **Scope:** The smallest Phase 12 vertical slice for reliable YouTube metadata and transcript capture from a signed-in browser. Article capture, cross-browser packaging, offline sync, and server-side YouTube redesign are out of scope.
- **Assumption:** The first release targets a Chrome Manifest V3 extension and the existing `readr.overhawl.app` web app.

## Executive answer

The production failures are consistent with YouTube returning HTTP 200 player responses without usable caption tracks to Cloudflare datacenter requests. A bounded retry could improve one symptom, but it cannot make that upstream response contractual. The focused next step is browser capture: inspect the real YouTube page in a content script, send only structured capture data through an extension service worker, and let the already-authenticated Readr tab persist it through its same-origin API.

The extension must not read or copy the Better Auth session cookie. Readr already authenticates through an HttpOnly shared-domain cookie and a private Auth Service Binding. Chrome documents that content scripts can inspect the page DOM and message a service worker, while privileged cross-origin work belongs in the extension service worker. The safest minimal bridge is therefore:

```text
YouTube content script
  -> structured message
extension service worker
  -> message to an open Readr tab
Readr content-script bridge
  -> window message to the Readr app
Readr app fetches its same-origin capture endpoint
  -> authenticated Worker validates and stores content in D1
```

This keeps the existing CSRF and session model intact. If no Readr tab is open, the extension opens the app and waits for the bridge to load. The first slice captures the transcript currently rendered by YouTube; it does not attempt to reproduce InnerTube or inject remote code.

## Evidence and decisions

### Extension boundaries

Chrome’s messaging model supports short-lived `runtime.sendMessage` calls between content scripts and an extension service worker, and long-lived ports when a session needs them. We only need a one-shot capture message ([Chrome message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)).

Content scripts can read the YouTube DOM, but they run in the page’s security context. Chrome and MDN recommend using messaging for privileged work, and Chrome explicitly warns against accepting an arbitrary URL from a page and fetching it in an extension handler. The content script will therefore send a validated, structured payload rather than a URL for the service worker to fetch ([Chrome network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [MDN content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)).

Host permissions enable service-worker fetches, tab metadata, programmatic injection, and cookies. The first manifest will request only YouTube watch pages and the Readr origin; cookies are intentionally not requested ([Chrome permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)).

Manifest V3 requires extension code to be packaged rather than remotely hosted. The capture logic will be small, local, and reviewable ([Chrome Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)).

### Authentication

Better Auth documents that its session cookie is HttpOnly and that cross-subdomain cookies require an explicit domain and trusted origins ([Better Auth cookies](https://better-auth.com/docs/concepts/cookies)). Readr’s product Worker validates that cookie through the internal Auth Service Binding. Reading raw cookies in an extension would expand the secret’s exposure and is unnecessary.

The bridge instead runs on a Readr page and asks the page application to call its own relative API URL. No extension-origin CORS allowlist, global CSRF weakening, bearer cookie, OAuth provider, or `chrome.cookies` permission is needed. `chrome.identity` is not a fit because it provides Chrome-account OAuth or a generic web-auth callback, not Readr’s existing Better Auth session ([Chrome identity](https://developer.chrome.com/docs/extensions/reference/api/identity)).

### Persistence

Captured data is structured and bounded, so D1 is appropriate. Cloudflare recommends prepared statements and supports sequential transactional batches for related writes ([D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)). A single `media_content` row per Readr item is enough for the first slice:

```text
item_id       TEXT PRIMARY KEY, references items(id) with cascade
video_id      TEXT NOT NULL
title         TEXT NOT NULL
author        TEXT NULL
description   TEXT NULL
thumbnail_url TEXT NULL
transcript    TEXT NOT NULL         -- validated YouTubeTranscript JSON
captured_at   TEXT NOT NULL
```

The capture endpoint matches an existing user-owned item by canonical YouTube video ID and enriches it. If no match exists, it creates one inbox video item. This avoids duplicate captures while still making a first capture useful. It never accepts arbitrary HTML or an item ID from the extension.

### Reader behavior

The YouTube reader first requests stored media content. A stored capture supplies metadata and transcript immediately. If no capture exists, the existing independent oEmbed and Defuddle requests remain the fallback. A stored `unavailable` transcript does not permanently suppress fallback extraction.

## Compact gap matrix

| Claim or decision | Evidence | Confidence | Remaining gap | Next check |
| --- | --- | --- | --- | --- |
| Browser DOM capture can avoid datacenter InnerTube variance | Chrome/MDN content-script DOM and messaging model; local Defuddle selectors | High | YouTube may change selectors | Keep selectors isolated and return a clear “open transcript” error |
| Raw session-cookie access is unnecessary | Better Auth HttpOnly cookie + current Readr Auth Service Binding | High | Extension-to-page bridge needs browser smoke test | Add bridge message tests and manual unpacked-extension check |
| Same-origin app write preserves current auth/CSRF | Current `requireAuth` and `requireSameOrigin` implementation; Cloudflare CORS guidance | High | App tab may not be open | Service worker opens Readr and waits for bridge load |
| D1 can store bounded structured transcript JSON | Cloudflare D1 prepared statements and batch docs | High | Payload size needs an explicit product cap | Enforce body, segment, text, and description limits in shared validation |
| Server extraction remains useful as fallback | Existing independent endpoints and diagnostics | High | Upstream availability remains non-contractual | Do not remove the endpoints in this phase |

## Non-goals and limits

- No article capture in this phase.
- No OAuth/OIDC or product-scoped session redesign.
- No raw cookie access or wildcard CORS.
- No InnerTube retry policy change before browser-capture evidence is collected.
- No multi-language transcript store; the captured transcript’s language is retained as part of the structured value.
- No remote extension code, analytics, transcript logging, or background polling.

## Acceptance criteria for the first vertical slice

1. A Chrome MV3 content script can capture the active YouTube title, author, thumbnail, description, and visible transcript without sending cookies or arbitrary fetch URLs.
2. An open signed-in Readr tab receives that structured payload and persists it through an authenticated same-origin endpoint.
3. Existing matching YouTube items are enriched; a missing item is created once; repeat captures do not create duplicates.
4. The reader renders stored content before attempting server extraction and still degrades safely when capture or extraction is unavailable.
5. Server-side validation bounds every stored string, segment count, timestamp, and JSON body, and tests prove user isolation and idempotency.
6. The existing server extraction path, live player, and playback progress behavior remain unchanged when no capture exists.

## Claim-to-source ledger

| Source title | Publisher | URL | Used for |
| --- | --- | --- | --- |
| Message passing | Chrome for Developers | https://developer.chrome.com/docs/extensions/develop/concepts/messaging | Content-script/service-worker messaging |
| Cross-origin network requests | Chrome for Developers | https://developer.chrome.com/docs/extensions/develop/concepts/network-requests | Privileged fetch boundary and constrained messages |
| Content scripts | MDN | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts | DOM access and page-context limits |
| Declare permissions | Chrome for Developers | https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions | Narrow host permissions |
| What is Manifest V3? | Chrome for Developers | https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3 | Packaged extension code |
| Cookies | Better Auth | https://better-auth.com/docs/concepts/cookies | HttpOnly and cross-subdomain session model |
| Identity API | Chrome for Developers | https://developer.chrome.com/docs/extensions/reference/api/identity | Why generic Chrome OAuth is not the Readr auth path |
| D1 database API | Cloudflare | https://developers.cloudflare.com/d1/worker-api/d1-database/ | Prepared writes and transactional batches |
| Prepared statements | Cloudflare | https://developers.cloudflare.com/d1/worker-api/prepared-statements/ | Parameter binding |
| YouTube extractor | Defuddle | https://github.com/kepano/defuddle/blob/main/src/extractors/youtube.ts | Existing DOM selector shape and server fallback context |

## Research stop condition

The material decisions have primary support, the remaining uncertainty is implementation-specific rather than a missing platform rule, and another broad search is unlikely to change the minimal architecture. The next evidence will come from the repository tests and an unpacked-extension smoke test after the vertical slice is implemented.
