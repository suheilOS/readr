import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

const videoId = "dQw4w9WgXcQ";
const captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}`;
const playerData = {
  videoDetails: { videoId, author: "Fixture channel" },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [{
        baseUrl: captionUrl,
        languageCode: "en",
        name: { simpleText: "English" },
      }],
    },
  },
};

afterEach(() => vi.restoreAllMocks());

describe("YouTube media extraction", () => {
  it("returns typed metadata and timestamped transcript data", async () => {
    const upstreamFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `https://www.youtube.com/watch?v=${videoId}`) {
        return new Response(youtubeHtml(), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (url.includes("youtubei/v1/player")) return Response.json(playerData);
      if (url.includes("youtubei/v1/next")) return Response.json({});
      if (url.startsWith(captionUrl)) {
        return new Response(
          '<transcript><text start="0" dur="2">Hello world.</text><text start="3" dur="2">Second sentence.</text></transcript>',
        );
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await callWorker({
      url: `https://youtu.be/${videoId}?t=10`,
      language: "en",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "youtube",
      videoId,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: "Fixture video",
      author: "Fixture channel",
      description: "A useful description.",
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      transcript: {
        kind: "available",
        language: "en",
        segments: [
          { startSeconds: 0, text: "Hello world." },
          { startSeconds: 3, text: "Second sentence." },
        ],
      },
    });
  });

  it("rejects non-YouTube URLs before any upstream request", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);
    const response = await callWorker({ url: "https://example.com/video" });
    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});

function youtubeHtml(): string {
  const schema = {
    "@type": "VideoObject",
    "@id": `https://www.youtube.com/watch?v=${videoId}`,
    name: "Fixture video",
    author: "Fixture channel",
    description: "A useful description.",
    thumbnailUrl: [`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`],
  };
  return `<html><head><script type="application/ld+json">${JSON.stringify(schema)}</script><script>var ytInitialPlayerResponse = ${JSON.stringify(playerData)};</script></head><body><main></main></body></html>`;
}

async function callWorker(body: unknown): Promise<Response> {
  const request = new Request("https://readr.test/api/media/youtube", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Cookie: "session=readr-test",
      Origin: "https://readr.test",
    },
    body: JSON.stringify(body),
  });
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
  const response = await worker.fetch(request, testEnv, context);
  await waitOnExecutionContext(context);
  return response;
}
