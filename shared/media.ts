declare const youtubeVideoIdBrand: unique symbol;

export type YouTubeVideoId = string & { readonly [youtubeVideoIdBrand]: true };
export type YouTubePlayerHost = "standard" | "privacy-enhanced";

export function youtubePlayerOrigin(host: YouTubePlayerHost): string {
  return host === "privacy-enhanced"
    ? "https://www.youtube-nocookie.com"
    : "https://www.youtube.com";
}

export type YouTubeUrl = {
  videoId: YouTubeVideoId;
  canonicalUrl: string;
  playerHost: YouTubePlayerHost;
};

export type TranscriptSegment = {
  startSeconds: number;
  text: string;
};

export type VideoChapter = {
  startSeconds: number;
  title: string;
};

export type YouTubeTranscript =
  | { kind: "unavailable" }
  | {
      kind: "available";
      language: string | null;
      segments: TranscriptSegment[];
      chapters: VideoChapter[];
    };

export type YouTubeMetadata = {
  kind: "youtube_metadata";
  videoId: YouTubeVideoId;
  sourceUrl: string;
  title: string;
  author: string | null;
  thumbnailUrl: string | null;
};

export type YouTubeTranscriptContent = {
  kind: "youtube_transcript";
  videoId: YouTubeVideoId;
  sourceUrl: string;
  description: string | null;
  transcript: YouTubeTranscript;
};

export type YouTubeCapturedContent = {
  kind: "youtube_capture";
  videoId: YouTubeVideoId;
  sourceUrl: string;
  title: string;
  author: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  transcript: YouTubeTranscript;
};

export const YOUTUBE_CAPTURE_LIMITS = {
  title: 500,
  author: 300,
  description: 20_000,
  segments: 5_000,
  segmentText: 2_000,
  chapters: 500,
  chapterTitle: 300,
  payloadBytes: 512 * 1024,
} as const;

/**
 * Response shape kept for tabs running the pre-split YouTube reader bundle.
 * New clients should request metadata and transcript content independently.
 */
export type YouTubeReaderContent = {
  kind: "youtube";
  videoId: YouTubeVideoId;
  sourceUrl: string;
  title: string;
  author: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  transcript: YouTubeTranscript;
};

export type MediaRequest = {
  url: string;
  language: string | null;
};

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export function parseYouTubeUrl(value: unknown): YouTubeUrl | null {
  if (typeof value !== "string") return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0
  ) {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  let candidate: string | null = null;

  if (hostname === "youtu.be" || hostname === "www.youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(hostname)) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 1 && parts[0] === "watch") {
      candidate = url.searchParams.get("v");
    } else if (["shorts", "embed", "live"].includes(parts[0] ?? "")) {
      candidate = parts[1] ?? null;
    }
  }

  if (candidate === null || !VIDEO_ID_PATTERN.test(candidate)) return null;

  const videoId = candidate as YouTubeVideoId;
  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    playerHost: hostname.endsWith("youtube-nocookie.com") ? "privacy-enhanced" : "standard",
  };
}

export function parseMediaRequest(value: unknown): MediaRequest | null {
  if (!isRecord(value) || typeof value.url !== "string") return null;

  const language = value.language;
  if (
    language !== undefined &&
    language !== null &&
    (typeof language !== "string" || !isLanguageTag(language))
  ) {
    return null;
  }

  return {
    url: value.url.trim(),
    language: typeof language === "string" ? language : null,
  };
}

export function isYouTubeMetadata(value: unknown): value is YouTubeMetadata {
  if (!isRecord(value) || value.kind !== "youtube_metadata") return false;
  const parsedUrl = parseYouTubeUrl(value.sourceUrl);

  return (
    parsedUrl !== null &&
    value.videoId === parsedUrl.videoId &&
    isNonEmptyString(value.title) &&
    (value.author === null || typeof value.author === "string") &&
    (value.thumbnailUrl === null || isHttpsUrl(value.thumbnailUrl))
  );
}

export function isYouTubeTranscriptContent(value: unknown): value is YouTubeTranscriptContent {
  if (!isRecord(value) || value.kind !== "youtube_transcript") return false;
  const parsedUrl = parseYouTubeUrl(value.sourceUrl);

  return (
    parsedUrl !== null &&
    value.videoId === parsedUrl.videoId &&
    (value.description === null || typeof value.description === "string") &&
    isTranscript(value.transcript)
  );
}

export function isYouTubeCapturedContent(value: unknown): value is YouTubeCapturedContent {
  if (!isRecord(value) || value.kind !== "youtube_capture") return false;
  const parsedUrl = parseYouTubeUrl(value.sourceUrl);

  if (
    parsedUrl === null ||
    value.videoId !== parsedUrl.videoId ||
    !isBoundedNonEmptyString(value.title, YOUTUBE_CAPTURE_LIMITS.title) ||
    !isNullableBoundedString(value.author, YOUTUBE_CAPTURE_LIMITS.author) ||
    !isNullableBoundedString(value.description, YOUTUBE_CAPTURE_LIMITS.description) ||
    (value.thumbnailUrl !== null && !isYouTubeImageUrl(value.thumbnailUrl)) ||
    !isCapturedTranscript(value.transcript)
  ) {
    return false;
  }

  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= YOUTUBE_CAPTURE_LIMITS.payloadBytes;
  } catch {
    return false;
  }
}

function isTranscript(value: unknown): value is YouTubeTranscript {
  if (!isRecord(value)) return false;
  if (value.kind === "unavailable") return true;
  if (value.kind !== "available") return false;

  return (
    (value.language === null || typeof value.language === "string") &&
    Array.isArray(value.segments) &&
    value.segments.every(isTranscriptSegment) &&
    hasAscendingTimestamps(value.segments) &&
    Array.isArray(value.chapters) &&
    value.chapters.every(isVideoChapter) &&
    hasAscendingTimestamps(value.chapters)
  );
}

function isCapturedTranscript(value: unknown): value is YouTubeTranscript {
  if (!isTranscript(value)) return false;
  if (value.kind === "unavailable") return true;

  return value.segments.length > 0 &&
    value.segments.length <= YOUTUBE_CAPTURE_LIMITS.segments &&
    value.segments.every((segment) => segment.text.length <= YOUTUBE_CAPTURE_LIMITS.segmentText) &&
    value.chapters.length <= YOUTUBE_CAPTURE_LIMITS.chapters &&
    value.chapters.every((chapter) => chapter.title.length <= YOUTUBE_CAPTURE_LIMITS.chapterTitle);
}

function hasAscendingTimestamps(values: unknown[]): boolean {
  let previous = -1;
  for (const value of values) {
    if (!isRecord(value) || !isSeconds(value.startSeconds) || value.startSeconds < previous) {
      return false;
    }
    previous = value.startSeconds;
  }
  return true;
}

function isTranscriptSegment(value: unknown): value is TranscriptSegment {
  return isRecord(value) && isSeconds(value.startSeconds) && isNonEmptyString(value.text);
}

function isVideoChapter(value: unknown): value is VideoChapter {
  return isRecord(value) && isSeconds(value.startSeconds) && isNonEmptyString(value.title);
}

function isSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isLanguageTag(value: string): boolean {
  return value.length <= 35 && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isYouTubeImageUrl(value: unknown): value is string {
  if (!isHttpsUrl(value)) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "ytimg.com" || hostname.endsWith(".ytimg.com");
  } catch {
    return false;
  }
}

function isBoundedNonEmptyString(value: unknown, maxLength: number): value is string {
  return isNonEmptyString(value) && value.length <= maxLength;
}

function isNullableBoundedString(value: unknown, maxLength: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
