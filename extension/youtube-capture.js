(function () {
  "use strict";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isCaptureRequest(message)) return false;

    try {
      sendResponse({ ok: true, content: captureCurrentVideo() });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "The YouTube page could not be captured.",
      });
    }
    return false;
  });

  function captureCurrentVideo() {
    const videoId = readVideoId();
    if (videoId === null) throw new Error("This is not a supported YouTube video page.");

    const title = readText([
      ["h1.ytd-watch-metadata", "text"],
      ["h1.title", "text"],
      ["meta[property=\"og:title\"]", "content"],
    ]) || document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim();
    if (title.length === 0 || title.length > 500) {
      throw new Error("The video title is not available yet. Try again after the page finishes loading.");
    }

    const segments = readTranscriptSegments();
    if (segments.length === 0) {
      throw new Error("Open YouTube’s Show transcript panel, then try capture again.");
    }

    return {
      kind: "youtube_capture",
      videoId,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      author: readText([
        ["ytd-video-owner-renderer #channel-name a[href^=\"/@\"]", "text"],
        ["#owner-name a[href^=\"/@\"]", "text"],
      ]) || null,
      description: readText([
        ["ytd-text-inline-expander#description-inline-expander", "text"],
        ["#description-inline-expander", "text"],
      ]) || null,
      thumbnailUrl: readThumbnail(videoId),
      transcript: {
        kind: "available",
          language: null,
        segments,
        chapters: [],
      },
    };
  }

  function readVideoId() {
    const value = new URL(window.location.href).searchParams.get("v");
    return value !== null && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
  }

  function readTranscriptSegments() {
    const selectors = [
      ["ytd-transcript-segment-renderer", ".segment-timestamp", ".segment-text"],
      ["transcript-segment-view-model", ".ytwTranscriptSegmentViewModelTimestamp", "span.yt-core-attributed-string"],
    ];

    for (const [segmentSelector, timestampSelector, textSelector] of selectors) {
      const segments = Array.from(document.querySelectorAll(segmentSelector))
        .map((segment) => {
          const timestamp = parseTimestamp(segment.querySelector(timestampSelector)?.textContent || "");
          const text = cleanText(segment.querySelector(textSelector)?.textContent || "");
          return timestamp === null || text.length === 0 ? null : { startSeconds: timestamp, text };
        })
        .filter((segment) => segment !== null);
      if (segments.length > 0) return segments;
    }
    return [];
  }

  function parseTimestamp(value) {
    const parts = value.trim().split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part)) || (parts.length !== 2 && parts.length !== 3)) return null;
    const seconds = parts.length === 2
      ? parts[0] * 60 + parts[1]
      : parts[0] * 3600 + parts[1] * 60 + parts[2];
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  function readText(selectors) {
    for (const [selector, source] of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const value = source === "content" ? element.getAttribute("content") : element.textContent;
      const text = cleanText(value || "");
      if (text.length > 0) return text;
    }
    return "";
  }

  function readThumbnail(videoId) {
    const value = document.querySelector("meta[property=\"og:image\"]")?.getAttribute("content") || "";
    if (value.startsWith("https://")) {
      try {
        if (/(?:^|\.)ytimg\.com$/i.test(new URL(value).hostname)) return value;
      } catch {
        // Fall back to YouTube's predictable thumbnail URL.
      }
    }
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  function cleanText(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function isCaptureRequest(value) {
    return value !== null && typeof value === "object" && value.type === "capture-youtube";
  }
}());
