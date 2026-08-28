import { env } from "cloudflare:workers";
import {
  applyD1Migrations,
  createExecutionContext,
  type D1Migration,
  waitOnExecutionContext,
} from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

const passwordlessSession = {
  sessionId: "readr-test-session",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const REVISION_1 = "1756339200000-00000000000000000000000000000001-0000000001";
const REVISION_2 = "1756339200001-00000000000000000000000000000001-0000000001";

beforeAll(async () => {
  await applyD1Migrations(env.READR_DB, env.TEST_MIGRATIONS);
});

declare global {
  interface Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Readr item API", () => {
  it("uses the migrated media progress schema", async () => {
    const columns = await env.READR_DB.prepare("PRAGMA table_info(media_progress)")
      .all<{ name: string }>();
    const names = columns.results.map((column) => column.name);
    expect(names).toContain("revision");
    expect(names).not.toContain("user_id");
  });

  it("enforces one captured YouTube item per user", async () => {
    const columns = await env.READR_DB.prepare("PRAGMA table_info(items)").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toContain("youtube_video_id");

    const userId = `capture-unique-${crypto.randomUUID()}`;
    const capture = {
      kind: "youtube_capture",
      videoId: "dQw4w9WgXcQ",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Captured video",
      author: null,
      description: null,
      thumbnailUrl: null,
      transcript: { kind: "unavailable" },
    };
    const responses = await Promise.all([
      request(userId, "/api/media/youtube/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(capture),
      }),
      request(userId, "/api/media/youtube/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(capture),
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const items = await request(userId, "/api/items");
    expect((await items.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  it("rejects a duplicate manually-added YouTube item with a conflict", async () => {
    const userId = `duplicate-youtube-${crypto.randomUUID()}`;
    const input = {
      title: "Video",
      url: "https://youtu.be/dQw4w9WgXcQ",
      type: "video",
    };
    expect((await request(userId, "/api/items", {
      method: "POST",
      body: JSON.stringify(input),
    })).status).toBe(201);

    const duplicate = await request(userId, "/api/items", {
      method: "POST",
      body: JSON.stringify(input),
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: { code: "duplicate_item" } });
  });

  it("keeps item data isolated by authenticated user", async () => {
    const ownerId = `owner-${crypto.randomUUID()}`;
    const otherUserId = `other-${crypto.randomUUID()}`;

    const created = await request(ownerId, "/api/items", {
      method: "POST",
      body: JSON.stringify({ title: "Private article", url: "https://example.com/private", type: "article" }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { item: { id: string } };

    const otherItems = await request(otherUserId, "/api/items");
    expect(otherItems.status).toBe(200);
    expect(await otherItems.json()).toEqual({ items: [] });

    const otherDelete = await request(otherUserId, `/api/items/${createdBody.item.id}`, { method: "DELETE" });
    expect(otherDelete.status).toBe(404);

    const ownerItems = await request(ownerId, "/api/items");
    expect(ownerItems.status).toBe(200);
    expect(await ownerItems.json()).toMatchObject({ items: [{ title: "Private article" }] });
  });

  it("enforces the five-item desk capacity on the server", async () => {
    const userId = `desk-${crypto.randomUUID()}`;
    const ids: string[] = [];

    for (let index = 0; index < 6; index += 1) {
      const response = await request(userId, "/api/items", {
        method: "POST",
        body: JSON.stringify({ title: `Item ${index}`, url: null, type: "article" }),
      });
      const body = await response.json() as { item: { id: string } };
      ids.push(body.item.id);
    }

    for (const id of ids.slice(0, 5)) {
      const response = await request(userId, `/api/items/${id}/move-to-desk`, { method: "POST" });
      expect(response.status).toBe(200);
    }

    const fullResponse = await request(userId, `/api/items/${ids[5]}/move-to-desk`, { method: "POST" });
    expect(fullResponse.status).toBe(409);
    expect(await fullResponse.json()).toMatchObject({ error: { code: "desk_full" } });
  });

  it("swaps a candidate into the desk atomically", async () => {
    const userId = `swap-${crypto.randomUUID()}`;
    const displacedResponse = await request(userId, "/api/items", {
      method: "POST",
      body: JSON.stringify({ title: "Displaced", url: null, type: "article" }),
    });
    const candidateResponse = await request(userId, "/api/items", {
      method: "POST",
      body: JSON.stringify({ title: "Candidate", url: null, type: "article" }),
    });
    const displaced = await displacedResponse.json() as { item: { id: string } };
    const candidate = await candidateResponse.json() as { item: { id: string } };

    expect((await request(userId, `/api/items/${displaced.item.id}/move-to-desk`, { method: "POST" })).status).toBe(200);

    const swapped = await request(userId, `/api/items/${candidate.item.id}/swap`, {
      method: "POST",
      body: JSON.stringify({ displacedId: displaced.item.id }),
    });
    expect(swapped.status).toBe(200);
    expect(await swapped.json()).toMatchObject({ item: { id: candidate.item.id, status: "desk" } });

    const list = await request(userId, "/api/items");
    const body = await list.json() as { items: Array<{ id: string; status: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: candidate.item.id, status: "desk" });
  });

  it("forwards sign-out through the auth service", async () => {
    const response = await request("sign-out-user", "/api/auth/sign-out", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cookie: "session=sign-out-user" });
    expect(response.headers.get("set-cookie")).toContain("session=; Max-Age=0");
  });

  it("protects the sign-out boundary", async () => {
    const rejected = await request(null, "/api/auth/sign-out", {
      method: "POST",
      headers: { Origin: "https://malicious.test" },
    });
    expect(rejected.status).toBe(403);

    const wrongMethod = await request(null, "/api/auth/sign-out");
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const unavailable = await request(
        null,
        "/api/auth/sign-out",
        { method: "POST" },
        async () => { throw new Error("service unavailable"); },
      );
      expect(unavailable.status).toBe(503);
      expect(await unavailable.json()).toMatchObject({
        error: { code: "auth_unavailable" },
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("rejects anonymous API calls", async () => {
    const response = await request(null, "/api/items");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("stores media progress separately and isolates it by user", async () => {
    const ownerId = `progress-${crypto.randomUUID()}`;
    const created = await request(ownerId, "/api/items", {
      method: "POST",
      body: JSON.stringify({
        title: "A long video",
        url: "https://youtu.be/dQw4w9WgXcQ",
        type: "video",
      }),
    });
    const body = await created.json() as { item: { id: string } };
    const path = `/api/items/${body.item.id}/media-progress`;

    const saved = await request(ownerId, path, {
      method: "PUT",
      body: JSON.stringify({ positionSeconds: 125.5, durationSeconds: 600, revision: REVISION_1 }),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      progress: { positionSeconds: 125.5, durationSeconds: 600, revision: REVISION_1 },
    });

    const loaded = await request(ownerId, path);
    expect(await loaded.json()).toMatchObject({
      progress: { positionSeconds: 125.5, durationSeconds: 600, revision: REVISION_1 },
    });

    const otherUser = await request(`other-${crypto.randomUUID()}`, path);
    expect(await otherUser.json()).toEqual({ progress: null });
  });

  it("rejects stale media progress revisions", async () => {
    const userId = `revision-${crypto.randomUUID()}`;
    const created = await request(userId, "/api/items", {
      method: "POST",
      body: JSON.stringify({ title: "Video", url: "https://youtu.be/dQw4w9WgXcQ", type: "video" }),
    });
    const body = await created.json() as { item: { id: string } };
    const path = `/api/items/${body.item.id}/media-progress`;

    await request(userId, path, {
      method: "PUT",
      body: JSON.stringify({ positionSeconds: 80, durationSeconds: 300, revision: REVISION_2 }),
    });
    const stale = await request(userId, path, {
      method: "PUT",
      body: JSON.stringify({ positionSeconds: 20, durationSeconds: 300, revision: REVISION_1 }),
    });

    expect(stale.status).toBe(200);
    expect(await stale.json()).toMatchObject({
      progress: { positionSeconds: 80, durationSeconds: 300, revision: REVISION_2 },
    });

    const equalRevision = await request(userId, path, {
      method: "PUT",
      body: JSON.stringify({ positionSeconds: 120, durationSeconds: 300, revision: REVISION_2 }),
    });
    expect(await equalRevision.json()).toMatchObject({
      progress: { positionSeconds: 80, durationSeconds: 300, revision: REVISION_2 },
    });
  });

  it("persists browser captures without duplicating a matching YouTube item", async () => {
    const userId = `capture-${crypto.randomUUID()}`;
    const created = await request(userId, "/api/items", {
      method: "POST",
      body: JSON.stringify({
        title: "My saved title",
        url: "https://youtu.be/dQw4w9WgXcQ",
        type: "article",
      }),
    });
    const createdBody = await created.json() as { item: { id: string } };
    const indexed = await env.READR_DB.prepare(
      "SELECT youtube_video_id FROM items WHERE id = ?",
    ).bind(createdBody.item.id).first<{ youtube_video_id: string | null }>();
    expect(indexed?.youtube_video_id).toBe("dQw4w9WgXcQ");

    await env.READR_DB.prepare(
      "UPDATE items SET youtube_video_id = NULL WHERE id = ?",
    ).bind(createdBody.item.id).run();
    const capture = {
      kind: "youtube_capture",
      videoId: "dQw4w9WgXcQ",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Captured video",
      author: "Captured channel",
      description: "Captured description",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      transcript: {
        kind: "available",
        language: "en",
        segments: [{ startSeconds: 0, text: "Captured transcript." }],
        chapters: [],
      },
    };

    const saved = await request(userId, "/api/media/youtube/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(capture),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      created: false,
      item: { id: createdBody.item.id, title: "My saved title" },
    });

    const backfilled = await env.READR_DB.prepare(
      "SELECT youtube_video_id FROM items WHERE id = ?",
    ).bind(createdBody.item.id).first<{ youtube_video_id: string | null }>();
    expect(backfilled?.youtube_video_id).toBe("dQw4w9WgXcQ");

    const repeated = await request(userId, "/api/media/youtube/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(capture),
    });
    expect(repeated.status).toBe(200);

    const content = await request(userId, `/api/items/${createdBody.item.id}/media-content`);
    expect(content.status).toBe(200);
    expect(await content.json()).toMatchObject({
      content: {
        kind: "youtube_capture",
        title: "Captured video",
        transcript: { kind: "available", segments: [{ text: "Captured transcript." }] },
      },
    });

    const otherContent = await request(`other-${crypto.randomUUID()}`, `/api/items/${createdBody.item.id}/media-content`);
    expect(otherContent.status).toBe(404);

    const items = await request(userId, "/api/items");
    expect((await items.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  it("creates a video inbox item when a browser capture has no match", async () => {
    const userId = `capture-new-${crypto.randomUUID()}`;
    const response = await request(userId, "/api/media/youtube/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "youtube_capture",
        videoId: "dQw4w9WgXcQ",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=shared",
        title: "New captured video",
        author: null,
        description: null,
        thumbnailUrl: null,
        transcript: { kind: "unavailable" },
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      created: true,
      item: { title: "New captured video", type: "video", status: "inbox" },
    });
    const items = await request(userId, "/api/items");
    expect(await items.json()).toMatchObject({
      items: [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }],
    });
  });

  it("rejects malformed browser captures before writing", async () => {
    const userId = `capture-invalid-${crypto.randomUUID()}`;
    const response = await request(userId, "/api/media/youtube/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "youtube_capture",
        videoId: "dQw4w9WgXcQ",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "x".repeat(501),
        author: null,
        description: null,
        thumbnailUrl: null,
        transcript: { kind: "unavailable" },
      }),
    });

    expect(response.status).toBe(400);
    expect(await (await request(userId, "/api/items")).json()).toEqual({ items: [] });
  });

  it("keeps browser capture writes behind the existing same-origin boundary", async () => {
    const response = await request(`capture-csrf-${crypto.randomUUID()}`, "/api/media/youtube/capture", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: "https://malicious.test",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "csrf_rejected" } });
  });
});

async function request(
  userId: string | null,
  path: string,
  init: RequestInit = {},
  signOut: (cookie: string) => Promise<Response> = mockSignOut,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", "https://readr.test");
  if (userId !== null) headers.set("Cookie", `session=${userId}`);

  const request = new Request(`https://readr.test${path}`, {
    ...init,
    headers,
  });
  const context = createExecutionContext();
  const testEnv = Object.assign({}, env, {
    AUTH_SERVICE: {
      getSession: async (cookie: string) => cookie.startsWith("session=")
        ? {
          ...passwordlessSession,
          userId: cookie.slice("session=".length),
        }
        : null,
      signOut,
    },
  }) as Env;
  const response = await worker.fetch(request, testEnv, context);
  await waitOnExecutionContext(context);
  return response;
}

async function mockSignOut(cookie: string): Promise<Response> {
  return Response.json({ cookie }, {
    headers: { "Set-Cookie": "session=; Max-Age=0; Path=/" },
  });
}
