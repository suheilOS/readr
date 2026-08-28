# Readr backend and shared identity implementation plan

## Status

Complete for the current launch. Overhawl Auth is deployed, its D1 schema is applied, and Email Sending is enabled for `overhawl.app`. Readr is deployed with its own D1 schema, Auth Service Binding, authenticated Hono API, and server-backed client. The production app is live and in use.

No user data exists, so this is a clean launch. There is no account migration, item migration, localStorage recovery flow, or anonymous-data merge to support.

The media reader work in phases 7, 9, 10, and 11 is now implemented for YouTube. Readr has canonical URL parsing, independent oEmbed metadata and async Defuddle transcript extraction, an IFrame API player, synchronized transcripts and chapters, graceful caption fallback, and account-backed resume state. Phase 8 currently exposes thumbnail metadata through the media API; the visual desk-card treatment remains a separate presentation pass.

## Decision

Overhawl will use one identity service and one database per product.

```text
auth.overhawl.app
  Better Auth Worker
  Auth D1
  users, accounts, sessions, verification

readr.overhawl.app
  React app + Readr Worker
  Readr D1
  reading data only

horizons.overhawl.app
  React app + Horizons Worker
  Horizons D1
  task data only
```

All product subdomains are controlled by Overhawl and exist only for Overhawl products. Better Auth will issue a secure session cookie scoped to `overhawl.app`. Product Workers will validate that session through an internal Cloudflare Service Binding to the Auth Worker.

The boundary is:

> Shared identity and session, separate product databases, server-authoritative writes.

The products will not access Auth D1 directly. They will receive an authenticated opaque `userId` and use it as the owner key for their own rows.

The repositories will remain siblings rather than becoming one monorepo:

```text
/home/suheil/Code/personal/
  readr/
  horizons/
  overhawl-auth/
```

`overhawl-auth` is the shared service. Readr and Horizons remain independently deployable products.

## Current Readr state

The existing repository has these relevant boundaries:

- `shared/item.ts` defines the item model, item options, URL validation, and presentation helpers.
- `src/itemApi.ts` owns the same-origin Readr API calls and applies the shared response parser.
- `src/useItemLibrary.ts` loads and mutates server-backed item state.
- `worker/index.ts` serves static assets and exposes authenticated Hono API routes, including `POST /api/extract`.
- `wrangler.jsonc` has Readr D1, the Auth Service Binding, static assets, and the extraction rate limiter.
- Theme and sound preferences already use separate localStorage keys and will remain local.

The product brief and README now describe account-backed item data and local-only theme and sound preferences.

## Scope

### In scope

- New Overhawl Auth repository and Worker.
- Better Auth with email and password authentication.
- Auth D1 for identity and sessions.
- Shared session cookie across trusted Overhawl product subdomains.
- Readr D1 and authenticated item APIs.
- Readr client conversion from local item storage to the API.
- Authentication, password reset, and email verification flows.
- Cloudflare Email Service integration for transactional Auth email.
- Hono routing and middleware in the Auth and product Workers.
- Tests for authentication, authorization, item ownership, and server-side lifecycle rules.

### Out of scope

- Social login, passkeys, OAuth clients, or OIDC between first-party products.
- Anonymous Readr data.
- Offline item editing or local-first synchronization.
- A shared cross-product data database.
- Tags, collections, statistics, or other changes to Readr's product model.
- Horizons implementation. Horizons will consume the same Auth contract later.

## Auth service plan

Create a separate Auth repository with its own Worker and deployment configuration.

### Auth owns

- Users and their stable IDs.
- Email/password accounts.
- Sessions and logout.
- Email verification records.
- Password reset records.
- Authentication secrets and cookie configuration.

Use Better Auth's built-in SQLite/D1 support. Keep Auth D1 limited to Better Auth tables and identity-related fields. Do not put Readr or Horizons rows in it.

Enable email/password authentication only. Email verification and password reset are launch requirements because the application will have no other recovery method.

Use Cloudflare Email Service for Auth's transactional email. The existing Workers Paid subscription is sufficient for this intended use, provided the Auth Worker is deployed in that account. The Auth Worker will use a `send_email` binding and send both HTML and plain-text versions of verification and password-reset messages. Before public signup is enabled, onboard `overhawl.app` or a dedicated sending subdomain for Email Sending, confirm that its DNS is managed by Cloudflare, and configure SPF, DKIM, and DMARC. Email Routing is not required for this outbound flow. Cloudflare Email Sending is intended for transactional email, not marketing or bulk mail.

### Cookie and origin rules

Configure Better Auth to share its session cookie across the trusted parent domain:

- Parent cookie scope: `overhawl.app`.
- `HttpOnly` and `Secure` in production.
- `SameSite=Lax` unless an actual flow requires another value.
- Explicit `trustedOrigins` for `auth.overhawl.app`, `readr.overhawl.app`, and future product origins.
- No wildcard CORS responses.
- No unrelated, user-controlled, or third-party subdomains under the shared cookie scope.

The Auth Worker will own login and account screens at `auth.overhawl.app`. Products will link or redirect there rather than duplicating authentication forms. Auth will return the user to an allowlisted product URL after login.

Use Hono as the HTTP routing and middleware layer in the Auth Worker. Mount Better Auth at `/api/auth/*` by passing Hono's raw request to `auth.handler`. Enable the Wrangler compatibility flag required by Better Auth's Hono integration.

### Internal session validation

Each product Worker will declare an Auth Service Binding. The product's request handler will:

1. Read the incoming session cookie.
2. Ask the Auth Worker for the current session.
3. Reject the request with `401` when the session is missing, expired, or revoked.
4. Pass only the returned `userId` into product handlers.

The browser will call the product's same-origin API. It will not call Auth for ordinary product data requests. This avoids adding Auth CORS requirements to every product API request.

Keep the internal Auth contract small. Expose `getSession(cookie)` through the Auth Worker's Service Binding RPC entrypoint; it returns the active session and stable user ID or `null`. Product Workers call this RPC with the incoming `Cookie` header. Do not expose a public internal session route or the Auth D1 binding to product Workers.

## Readr data plan

Create a new Readr D1 database. Since no users or user data exist, create the schema from scratch.

Use explicit D1 prepared statements and SQL migrations. The repository has no ORM today, and adding one is not needed for this data model. Use Hono for the Readr API routing, middleware, and typed Worker environment access while preserving the existing static asset and Vite setup.

### Initial item table

The database representation should cover the existing `Item` model:

```text
items
- id           TEXT PRIMARY KEY
- user_id      TEXT NOT NULL
- title        TEXT NOT NULL
- url          TEXT NULL
- type         TEXT NOT NULL
- status       TEXT NOT NULL
- added_at     TEXT NOT NULL
- finished_at  TEXT NULL
- note         TEXT NULL
- updated_at   TEXT NOT NULL
```

Add indexes for `(user_id, status)` and `(user_id, updated_at)`. `user_id` is an external identity reference, not a database foreign key. It must never be an email address.

The server generates item IDs and timestamps. The client sends only the fields the user entered.

Discard remains a hard delete, matching the current product behavior. Discarded items are not retained in a product table.

### API endpoints

Keep the API on the existing Readr Worker and preserve `POST /api/extract`. Hono will own the API routes and authenticated middleware; the existing Worker remains responsible for serving the frontend assets.

```text
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

Every endpoint requires an authenticated session. Every query includes the authenticated `user_id`, including lookups, updates, deletes, and swap operations. A client cannot read or modify another user's item by changing an ID in the URL.

The server, not browser state updates, enforces the product rules:

- A user's desk cannot contain more than five items.
- Only valid item types and statuses are accepted.
- Moving an item to the desk clears `finished_at`.
- Finishing an item sets `status = library` and records `finished_at`.
- Swapping moves the candidate to the desk and deletes the displaced desk item as one atomic operation.

Use conditional SQL and D1 atomic batches where a rule depends on more than one write. The client treats the API response as authoritative.

`POST /api/extract` keeps its existing URL safety, response-size, timeout, and rate-limit protections. It becomes authenticated because Readr no longer supports anonymous product usage.

## Readr client plan

Replace local item persistence with a small same-origin API client.

### Removed from the client

- Item storage under `reader:items`.
- `CURRENT_STORAGE_VERSION` and item migration code.
- Corrupt-storage recovery UI.
- `StorageRecovery` and item persistence warnings.
- Browser-generated item IDs and timestamps.
- Offline claims in the README and product brief.

### Keep

- `reader:theme` for the theme preference.
- `reader:sounds` for the sound preference.
- Item selectors and presentation types where they remain useful.
- Pure lifecycle tests that describe the product rules.
- The existing reader route and extraction UI.

`useItemLibrary` should load `GET /api/items` after the authenticated app renders. User actions should call the matching API command and replace the affected state with the server response. Do not add optimistic updates in the first backend version. A short request state is easier to reason about than rollback logic, and Readr does not need offline operation.

The app should have three authenticated states:

- Loading the current session and item list.
- Authenticated and ready to use.
- Unauthenticated or unable to load the session.

Unauthenticated users can see a sign-in path, but they cannot create or access Readr data.

## Implementation phases

0. **Foundation**
1. **Static interface**
2. **Core interactions**
3. **Authenticated persistence**
4. **In-app article reader**
5. **Responsive refinement**
6. **Product polish**
7. **Media capability foundation**
8. **Visual desk cards and thumbnails**
9. **YouTube player view**
10. **YouTube transcripts and chapters**
11. **Media completion and resume**
12. **Browser capture** — first vertical slice implemented: Chrome MV3 capture of a visible YouTube transcript, same-origin persistence through the signed-in Readr tab, D1 media content, and reader-first stored fallback. Article capture, OAuth, cross-browser packaging, and InnerTube retry changes remain out of scope until browser smoke-test evidence justifies them.

## Acceptance criteria

The change is ready when:

- A new user can create an account, verify their email, sign in, and reset their password.
- The same session works on `auth.overhawl.app` and `readr.overhawl.app`.
- Readr item data survives reloads and works from another device after login.
- Readr D1 contains only Readr data, and Auth D1 contains only identity data.
- The server enforces ownership and the five-item desk limit.
- The browser stores only harmless preferences, not the item collection.
- Anonymous requests cannot create, read, update, delete, or extract Readr data.

## Risks and controls

### Auth becomes a dependency for product requests

Use the internal Service Binding and keep session lookup small. If this later becomes a measured problem, introduce product-scoped sessions or OAuth/OIDC. Do not add that complexity before there is a need.

### Shared cookie scope expands the blast radius

This is acceptable only because every current and planned subdomain is controlled by Overhawl and reserved for products. Revisit the decision before adding user-generated or third-party subdomains.

### Client rules drift from server rules

Keep client selectors limited to display concerns. Write API tests for every rule that protects data or enforces the desk capacity.

### Password recovery depends on email delivery

Treat verification and reset email delivery as part of the Auth launch, not as a later polish task.

## Research references

- [Better Auth cookies](https://better-auth.com/docs/concepts/cookies)
- [Better Auth database](https://better-auth.com/docs/concepts/database)
- [Better Auth Hono integration](https://better-auth.com/docs/integrations/hono)
- [Cloudflare Email Service](https://developers.cloudflare.com/email-service/)
- [Cloudflare Email Sending](https://developers.cloudflare.com/email-service/get-started/send-emails/)
- [Cloudflare Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Cloudflare Hono guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/)
