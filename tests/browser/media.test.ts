import { describe, expect, it } from "vitest";
import {
  isYouTubeCapturedContent,
  isYouTubeMetadata,
  isYouTubeTranscriptContent,
  parseYouTubeUrl,
  youtubePlayerOrigin,
} from "../../shared/media";
import { readerKindFor } from "../../shared/item";
import { activeTimedEntryIndex, formatPlaybackTime } from "../../src/reader/transcriptSync";

describe("YouTube media boundaries", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch/?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=12",
    "https://m.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://youtube.com/live/dQw4w9WgXcQ",
  ])("canonicalizes supported URL %s", (url) => {
    expect(parseYouTubeUrl(url)).toEqual({
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      playerHost: "standard",
    });
  });

  it("preserves privacy-enhanced embed mode", () => {
    const parsed = parseYouTubeUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(parsed?.playerHost).toBe("privacy-enhanced");
    expect(parsed === null ? null : youtubePlayerOrigin(parsed.playerHost))
      .toBe("https://www.youtube-nocookie.com");
  });

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=too-short",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ",
  ])("rejects unsupported URL %s", (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });

  it("classifies a YouTube link as an in-app reader regardless of manual item type", () => {
    expect(readerKindFor({
      type: "video",
      url: "https://youtu.be/dQw4w9WgXcQ",
    })).toBe("youtube");
  });

  it("validates structured transcript responses", () => {
    expect(isYouTubeTranscriptContent({
      kind: "youtube_transcript",
      videoId: "dQw4w9WgXcQ",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      description: null,
      transcript: {
        kind: "available",
        language: "en",
        segments: [{ startSeconds: 0, text: "Hello." }],
        chapters: [],
      },
    })).toBe(true);
  });

  it("rejects transcript data that would break binary search", () => {
    expect(isYouTubeTranscriptContent({
      kind: "youtube_transcript",
      videoId: "dQw4w9WgXcQ",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      description: null,
      transcript: {
        kind: "available",
        language: "en",
        segments: [
          { startSeconds: 10, text: "Later" },
          { startSeconds: 5, text: "Earlier" },
        ],
        chapters: [],
      },
    })).toBe(false);
  });

  it("validates independent metadata responses", () => {
    expect(isYouTubeMetadata({
      kind: "youtube_metadata",
      videoId: "dQw4w9WgXcQ",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "A video",
      author: "A channel",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    })).toBe(true);
  });

  it("rejects a captured transcript that claims availability without segments", () => {
    expect(isYouTubeCapturedContent({
      kind: "youtube_capture",
      videoId: "dQw4w9WgXcQ",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "A video",
      author: null,
      description: null,
      thumbnailUrl: null,
      transcript: { kind: "available", language: "en", segments: [], chapters: [] },
    })).toBe(false);
  });
});

describe("transcript synchronization", () => {
  const entries = [
    { startSeconds: 2 },
    { startSeconds: 8 },
    { startSeconds: 20 },
  ];

  it("finds the active entry at boundaries and between timestamps", () => {
    expect(activeTimedEntryIndex(entries, 0)).toBe(-1);
    expect(activeTimedEntryIndex(entries, 2)).toBe(0);
    expect(activeTimedEntryIndex(entries, 19.9)).toBe(1);
    expect(activeTimedEntryIndex(entries, 50)).toBe(2);
  });

  it("formats short and long playback positions", () => {
    expect(formatPlaybackTime(65.9)).toBe("1:05");
    expect(formatPlaybackTime(3_665)).toBe("1:01:05");
  });
});
