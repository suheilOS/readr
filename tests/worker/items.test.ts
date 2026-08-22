import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

const passwordlessSession = {
  sessionId: "readr-test-session",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

beforeAll(async () => {
  await env.READR_DB.prepare(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      added_at TEXT NOT NULL,
      finished_at TEXT,
      note TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();
  await env.READR_DB.prepare("CREATE INDEX IF NOT EXISTS items_user_status_idx ON items (user_id, status)").run();
  await env.READR_DB.prepare("CREATE INDEX IF NOT EXISTS items_user_updated_idx ON items (user_id, updated_at)").run();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Readr item API", () => {
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

  it("rejects anonymous API calls", async () => {
    const response = await request(null, "/api/items");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });
});

async function request(userId: string | null, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Origin", "https://readr.test");
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
    },
  }) as Env;
  const response = await worker.fetch(request, testEnv, context);
  await waitOnExecutionContext(context);
  return response;
}
