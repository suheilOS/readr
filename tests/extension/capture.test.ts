import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const captureScript = readFileSync(resolve(process.cwd(), "extension/youtube-capture.js"), "utf8");

describe("YouTube capture content script", () => {
  it("prefers the visible title and captures the legacy transcript shape", () => {
    const { listener } = loadCapturePage(`
      <html lang="fr">
        <head>
          <meta property="og:title" content="Stale metadata title">
        </head>
        <body>
          <h1 class="ytd-watch-metadata">Visible video title</h1>
          <ytd-video-owner-renderer><div id="channel-name"><a href="/@channel">Channel</a></div></ytd-video-owner-renderer>
          <ytd-transcript-segment-renderer>
            <span class="segment-timestamp">1:02</span>
            <span class="segment-text">First line</span>
          </ytd-transcript-segment-renderer>
        </body>
      </html>
    `);

    const response = invoke(listener);
    expect(response).toEqual({
      ok: true,
      content: expect.objectContaining({
        title: "Visible video title",
        author: "Channel",
        transcript: {
          kind: "available",
          language: null,
          segments: [{ startSeconds: 62, text: "First line" }],
          chapters: [],
        },
      }),
    });
  });

  it("captures the current transcript shape and parses hour timestamps", () => {
    const { listener } = loadCapturePage(`
      <html><body>
        <meta property="og:title" content="Metadata title">
        <transcript-segment-view-model>
          <span class="ytwTranscriptSegmentViewModelTimestamp">1:02:03</span>
          <span class="ytAttributedStringHost" role="text">Second line</span>
        </transcript-segment-view-model>
      </body></html>
    `);

    const response = invoke(listener);
    expect(response).toEqual({
      ok: true,
      content: expect.objectContaining({
        title: "Metadata title",
        transcript: expect.objectContaining({
          language: null,
          segments: [{ startSeconds: 3723, text: "Second line" }],
        }),
      }),
    });
  });

  it("keeps supporting the legacy modern transcript text selector", () => {
    const { listener } = loadCapturePage(`
      <html><body>
        <meta property="og:title" content="Metadata title">
        <transcript-segment-view-model>
          <span class="ytwTranscriptSegmentViewModelTimestamp">0:12</span>
          <span class="yt-core-attributed-string">Legacy line</span>
        </transcript-segment-view-model>
      </body></html>
    `);

    expect(invoke(listener)).toEqual(expect.objectContaining({
      ok: true,
      content: expect.objectContaining({
        transcript: expect.objectContaining({
          segments: [{ startSeconds: 12, text: "Legacy line" }],
        }),
      }),
    }));
  });

  it("reports unsupported pages and missing transcripts without throwing", () => {
    const unsupported = loadCapturePage("<html><body></body></html>", "https://example.com/");
    expect(invoke(unsupported.listener)).toEqual({
      ok: false,
      error: "This is not a supported YouTube video page.",
    });

    const missingTranscript = loadCapturePage("<html><head><meta property=\"og:title\" content=\"Video\"></head></html>");
    expect(invoke(missingTranscript.listener)).toEqual({
      ok: false,
      error: "Open YouTube’s Show transcript panel, then try capture again.",
    });
  });
});

type RuntimeListener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | undefined;

function loadCapturePage(html: string, url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ") {
  const dom = new JSDOM(html, { runScripts: "outside-only", url });
  let listener: RuntimeListener | undefined;
  Object.defineProperty(dom.window, "chrome", {
    value: { runtime: { onMessage: { addListener: (next: RuntimeListener) => { listener = next; } } } },
  });
  dom.window.eval(captureScript);
  if (listener === undefined) throw new Error("Capture listener was not registered.");
  return { dom, listener };
}

function invoke(listener: RuntimeListener): unknown {
  let response: unknown;
  listener({ type: "capture-youtube" }, {}, (value) => { response = value; });
  return response;
}
