import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

const videoId = "dQw4w9WgXcQ";
const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
const captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}`;
const playerData = {
  videoDetails: {
    videoId,
    author: "Fixture channel",
    shortDescription: "A useful description.",
  },
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
  it("loads metadata from oEmbed without fetching the watch page", async () => {
    const upstreamFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://www.youtube.com/oembed?")) {
        return Response.json({
          title: "Fixture video",
          author_name: "Fixture channel",
          thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        });
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await callWorker("metadata", {
      url: `https://youtu.be/${videoId}?t=10`,
      language: "en",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "youtube_metadata",
      videoId,
      sourceUrl: canonicalUrl,
      title: "Fixture video",
      author: "Fixture channel",
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
    expect(upstreamFetch).not.toHaveBeenCalledWith(canonicalUrl, expect.anything());
  });

  it("loads a transcript directly from player data without fetching the watch page", async () => {
    const upstreamFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
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

    const response = await callWorker("transcript", { url: canonicalUrl, language: "en" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "youtube_transcript",
      videoId,
      sourceUrl: canonicalUrl,
      description: "A useful description.",
      transcript: {
        kind: "available",
        language: "en",
        segments: [
          { startSeconds: 0, text: "Hello world." },
          { startSeconds: 3, text: "Second sentence." },
        ],
      },
    });
    expect(upstreamFetch).not.toHaveBeenCalledWith(canonicalUrl, expect.anything());
  });

  it("rejects degraded metadata instead of replacing the stored title", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      title: "- YouTube",
      author_name: "",
    })));

    const response = await callWorker("metadata", { url: canonicalUrl });
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("- YouTube");
  });

  it("returns metadata when captions are independently unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://www.youtube.com/oembed?")) {
        return Response.json({ title: "Fixture video", author_name: "Fixture channel" });
      }
      if (url.includes("youtubei/v1/")) return Response.json({});
      return new Response("", { status: 404 });
    }));

    const [metadataResponse, transcriptResponse] = await Promise.all([
      callWorker("metadata", { url: canonicalUrl }),
      callWorker("transcript", { url: canonicalUrl }),
    ]);

    expect(metadataResponse.status).toBe(200);
    expect(await metadataResponse.json()).toMatchObject({ title: "Fixture video" });
    expect(transcriptResponse.status).toBe(200);
    expect(await transcriptResponse.json()).toMatchObject({
      transcript: { kind: "unavailable" },
    });
  });

  it("rejects non-YouTube URLs before any upstream request", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);
    const response = await callWorker("metadata", { url: "https://example.com/video" });
    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});

async function callWorker(resource: "metadata" | "transcript", body: unknown): Promise<Response> {
  const request = new Request(`https://readr.test/api/media/youtube/${resource}`, {
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
