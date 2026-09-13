import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { captureCurrentVideo, YouTubeCaptureError } from "../../extension/src/youtube-capture-core.js";
import { normalizeDefuddleYouTubeResult } from "../../shared/youtubeNormalization";

const videoId = "dQw4w9WgXcQ";
const secondVideoId = "9bZkp7q19f0";
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

describe("YouTube live-page capture", () => {
  it("uses Defuddle against a closed transcript panel", async () => {
    const dom = loadPage({
      title: "Defuddle video",
      description: "A live-page description.",
      tracks: [{ baseUrl: timedTextUrl(), languageCode: "fr", name: { simpleText: "Français" } }],
    }, "fr");
    const fetchImpl = captionFetch();

    const content = await captureCurrentVideo({
      document: dom.window.document,
      url: dom.window.location.href,
      expectedVideoId: videoId,
      fetchImpl,
    });

    expect(content).toMatchObject({
      kind: "youtube_capture",
      videoId,
      title: "Defuddle video",
      description: "A live-page description.",
      transcript: {
        kind: "available",
        language: "fr",
        segments: [
          { startSeconds: 0, text: "Bonjour." },
          { startSeconds: 3, text: "Deuxième phrase." },
        ],
      },
    });
    expect(fetchImpl).toHaveBeenCalled();
    expect(dom.window.document.querySelector("ytd-transcript-segment-renderer")).toBeNull();
  });

  it("supports manual and automatic caption tracks with language preference", async () => {
    const dom = loadPage({
      title: "Language variants",
      tracks: [
        { baseUrl: timedTextUrl("en"), languageCode: "en", kind: "asr" },
        { baseUrl: timedTextUrl("de"), languageCode: "de", kind: "asr" },
        { baseUrl: timedTextUrl("fr"), languageCode: "fr" },
      ],
    }, "de");
    const fetchImpl = vi.fn(async (input) => {
      if (String(input).includes("timedtext")) {
        return new Response('<transcript><text start="4">Deutsch.</text></transcript>');
      }
      return Response.json({});
    });

    const content = await captureCurrentVideo({
      document: dom.window.document,
      url: dom.window.location.href,
      expectedVideoId: videoId,
      fetchImpl,
    });
    expect(content.transcript).toMatchObject({ kind: "available", language: "de" });
  });

  it("keeps URL capture valid when captions are unavailable", async () => {
    const dom = loadPage({ title: "No captions", tracks: [] });
    const content = await captureCurrentVideo({
      document: dom.window.document,
      url: dom.window.location.href,
      expectedVideoId: videoId,
      fetchImpl: vi.fn(async () => Response.json({ videoDetails: { videoId } })),
    });
    expect(content.transcript).toEqual({ kind: "unavailable" });
  });

  it("normalizes Defuddle transcript blocks and chapters into the reader types", () => {
    const document = new JSDOM(`<body>
      <p>Description from Defuddle</p>
      <div class="transcript">
        <h3>Opening</h3>
        <div class="transcript-segment"><span data-timestamp="12">0:12</span>First line.</div>
        <div class="transcript-segment"><span data-timestamp="19">0:19</span>Second line.</div>
      </div>
    </body>`).window.document;

    expect(normalizeDefuddleYouTubeResult({
      description: "Fallback description",
      language: "fr",
    }, document)).toEqual({
      description: "Description from Defuddle",
      language: "fr",
      segments: [
        { startSeconds: 12, text: "First line." },
        { startSeconds: 19, text: "Second line." },
      ],
      chapters: [{ startSeconds: 12, title: "Opening" }],
    });
  });

  it("rejects a result when YouTube navigates to another video during extraction", async () => {
    const dom = loadPage({
      title: "Stale video",
      tracks: [{ baseUrl: timedTextUrl(), languageCode: "en" }],
    });
    let firstFetch = true;
    const fetchImpl = vi.fn(async (input) => {
      if (firstFetch) {
        firstFetch = false;
        dom.window.history.pushState({}, "", `/watch?v=${secondVideoId}`);
      }
      return String(input).includes("timedtext")
        ? new Response('<transcript><text start="0">Stale.</text></transcript>')
        : Response.json({});
    });

    await expect(captureCurrentVideo({
      document: dom.window.document,
      url: videoUrl,
      expectedVideoId: videoId,
      fetchImpl,
    })).rejects.toMatchObject<YouTubeCaptureError>({ code: "stale_video" });
  });
});

function timedTextUrl(language = "fr") {
  return `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${language}`;
}

function captionFetch() {
  return vi.fn(async (input) => String(input).includes("timedtext")
    ? new Response('<transcript><text start="0">Bonjour.</text><text start="3">Deuxième phrase.</text></transcript>')
    : Response.json({}));
}

function loadPage(
  details: { title: string; description?: string; tracks: Array<Record<string, unknown>> },
  language = "en",
) {
  const playerResponse = {
    videoDetails: { videoId, author: "Channel", shortDescription: details.description ?? "" },
    captions: { playerCaptionsTracklistRenderer: { captionTracks: details.tracks } },
  };
  const html = `<html lang="${language}"><head>
    <meta property="og:url" content="${videoUrl}">
    <meta property="og:image" content="https://i.ytimg.com/vi/${videoId}/hqdefault.jpg">
    <script type="application/ld+json">${JSON.stringify({
      "@type": "VideoObject",
      "@id": videoUrl,
      name: details.title,
      description: details.description ?? "",
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    })}</script>
    <script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>
    <script>var ytInitialData = ${JSON.stringify({ currentVideoEndpoint: { watchEndpoint: { videoId } } })};</script>
  </head><body><h1>${details.title}</h1></body></html>`;
  return new JSDOM(html, { url: videoUrl, runScripts: "outside-only" });
}
