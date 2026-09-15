import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("favicon route", () => {
  it("rejects non-public hostnames without making an upstream request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await callWorker("localhost");

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unexpected upstream content types", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not an image", {
      headers: { "Content-Type": "text/html" },
    })));

    const response = await callWorker("not-an-image.example");

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("proxies a validated favicon with long-lived cache headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "image/png" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callWorker("example.com");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=604800");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("domain_url=https%3A%2F%2Fexample.com");
  });

  it("rejects oversized favicon responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(256 * 1024 + 1), {
      headers: { "Content-Type": "image/png" },
    })));

    const response = await callWorker("oversized-favicon.example");

    expect(response.status).toBe(404);
  });
});

async function callWorker(hostname: string): Promise<Response> {
  const context = createExecutionContext();
  const testEnv = Object.assign({}, env, {
    AUTH_SERVICE: {
      getSession: async () => ({
        userId: "readr-test-user",
        sessionId: "readr-test-session",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      signOut: async () => Response.json({ success: true }),
    },
  }) as Env;
  const response = await worker.fetch(new Request(
    `https://readr.test/api/favicon?host=${encodeURIComponent(hostname)}`,
    { headers: { Cookie: "session=readr-test" } },
  ), testEnv, context);
  await waitOnExecutionContext(context);
  return response;
}
