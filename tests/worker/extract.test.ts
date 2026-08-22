import { env } from "cloudflare:workers";
import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { normalizePublicUrl } from "../../worker/urlSafety";

const articleHtml = `<!doctype html>
<html>
  <head><title>A Quiet Article</title></head>
  <body>
    <canvas aria-hidden="true"></canvas>
    <nav>Skip this navigation</nav>
    <article>
      <h1>A Quiet Article</h1>
      <p>This is the first paragraph with enough text to identify the article.</p>
      <p>This is a second paragraph about careful reading and attention.</p>
    </article>
  </body>
</html>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizePublicUrl", () => {
  it("removes tracking parameters while preserving useful parameters", () => {
    const result = normalizePublicUrl(
      "https://example.com/story?utm_source=mail&keep=1#comments",
    );

    expect(result?.toString()).toBe("https://example.com/story?keep=1");
  });

  it("preserves functional ref parameters", () => {
    const result = normalizePublicUrl("https://example.com/story?ref=chapter-2&utm_source=mail");
    expect(result?.toString()).toBe("https://example.com/story?ref=chapter-2");
  });

  it("rejects private and non-http destinations", () => {
    expect(normalizePublicUrl("http://127.0.0.1/article")).toBeNull();
    expect(normalizePublicUrl("http://[::1]/article")).toBeNull();
    expect(normalizePublicUrl("file:///tmp/article")).toBeNull();
  });
});

describe("POST /api/extract", () => {
  it("returns a structured 429 after the extraction limit is exhausted", async () => {
    const clientIp = "203.0.113.44";
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await env.EXTRACT_RATE_LIMITER.limit({ key: `extract:${clientIp}` });
    }

    const request = new Request("https://readr.test/api/extract", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "CF-Connecting-IP": clientIp,
      },
      body: JSON.stringify({ url: "https://example.com/story" }),
    });
    const response = await runRequest(request);
    const body: unknown = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(body).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("extracts an article and returns normalized metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(articleHtml, {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    );

    const response = await callWorker({
      url: "https://example.com/story?utm_campaign=reader",
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sourceUrl: "https://example.com/story",
      title: "A Quiet Article",
    });
    expect(body).toHaveProperty("html");
    expect(body).toHaveProperty("wordCount");
  });

  it("revalidates redirects before following them", async () => {
    const upstreamFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        }),
      );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await callWorker({ url: "https://example.com/story" });
    const body: unknown = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: { code: "upstream_error" },
    });
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects non-HTML responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("not an article", {
          headers: { "content-type": "application/pdf" },
        }),
      ),
    );

    const response = await callWorker({ url: "https://example.com/file.pdf" });
    const body: unknown = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      error: { code: "unsupported_content" },
    });
  });

  it("decodes the charset declared by the upstream response", async () => {
    const windows1252Html = articleHtml.replaceAll("Quiet", "Café");
    const bytes = Uint8Array.from(windows1252Html, (character) => character.charCodeAt(0));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes, {
        headers: { "content-type": "text/html; charset=windows-1252" },
      })),
    );

    const response = await callWorker({ url: "https://example.com/cafe" });
    const body: unknown = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ title: "A Café Article" });
  });

  it("rejects malformed requests before fetching", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    const request = new Request("https://readr.test/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await runRequest(request);
    const body: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: { code: "bad_request" },
    });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies before fetching", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await callWorker({ url: `https://example.com/${"a".repeat(8_200)}` });
    const body: unknown = await response.json();

    expect(response.status).toBe(413);
    expect(body).toMatchObject({
      error: { code: "request_too_large" },
    });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});

async function callWorker(input: unknown): Promise<Response> {
  return runRequest(
    new Request("https://readr.test/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

async function runRequest(request: Request): Promise<Response> {
  const context = createExecutionContext();
  const response = await worker.fetch(request, env, context);
  await waitOnExecutionContext(context);
  return response;
}
