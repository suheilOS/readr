import Defuddle from "defuddle";
import {
  isYouTubeCapturedContent,
  isYouTubeImageUrl,
  parseYouTubeUrl,
  YOUTUBE_CAPTURE_LIMITS,
} from "../../shared/media";
import { normalizeDefuddleYouTubeResult } from "../../shared/youtubeNormalization";

const EXTRACTION_TIMEOUT_MS = 25_000;

export class YouTubeCaptureError extends Error {
  constructor(message, code = "youtube_extraction_failed") {
    super(message);
    this.name = "YouTubeCaptureError";
    this.code = code;
  }
}

/**
 * Run the pinned Defuddle YouTube extractor against the actual page document.
 * The fetch adapter keeps requests in the page's YouTube context and checks
 * the SPA identity around every network boundary.
 */
export async function captureCurrentVideo({
  document,
  url,
  expectedVideoId,
  fetchImpl = globalThis.fetch,
  timeoutMs = EXTRACTION_TIMEOUT_MS,
}) {
  const parsedUrl = parseYouTubeUrl(url);
  if (parsedUrl === null) {
    throw new YouTubeCaptureError("This is not a supported YouTube video page.", "unsupported_url");
  }
  const expectedId = expectedVideoId ?? parsedUrl.videoId;
  if (expectedId !== parsedUrl.videoId) {
    throw staleVideoError();
  }
  assertCurrentVideo(document, expectedId, url);

  const controller = new AbortController();
  let timeoutId;
  try {
    const extraction = new Defuddle(document, {
      url,
      useAsync: true,
      language: preferredLanguage(document),
      fetch: createLivePageFetch(document, expectedId, fetchImpl, controller.signal),
    }).parseAsync();
    const result = await Promise.race([
      extraction,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new YouTubeCaptureError("The YouTube media request timed out.", "timeout"));
        }, timeoutMs);
      }),
    ]);

    assertCurrentVideo(document, expectedId, url);
    const resultDocument = parseResultContent(result?.content, document);
    const extractedVideoId = readExtractedVideoId(resultDocument);
    if (extractedVideoId !== expectedId) {
      throw staleVideoError();
    }

    const content = buildCapturedContent(document, resultDocument, parsedUrl, expectedId, result);
    assertCurrentVideo(document, expectedId, url);
    if (!isYouTubeCapturedContent(content)) {
      throw new YouTubeCaptureError("The YouTube media data was invalid.", "invalid_media");
    }
    return content;
  } catch (error) {
    if (error instanceof YouTubeCaptureError) throw error;
    if (isAbortError(error) && controller.signal.aborted) {
      throw new YouTubeCaptureError("The YouTube media request timed out.", "timeout");
    }
    throw new YouTubeCaptureError("The YouTube media could not be read.", "youtube_extraction_failed");
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    controller.abort();
  }
}

function createLivePageFetch(document, expectedVideoId, fetchImpl, signal) {
  return async (input, init = {}) => {
    assertCurrentVideo(document, expectedVideoId, document.defaultView?.location?.href);
    const signals = [signal];
    if (init.signal !== undefined && init.signal !== null) signals.push(init.signal);
    const response = await fetchImpl(input, {
      ...init,
      credentials: "include",
      signal: AbortSignal.any(signals),
    });
    assertCurrentVideo(document, expectedVideoId, document.defaultView?.location?.href);
    return response;
  };
}

function buildCapturedContent(document, resultDocument, parsedUrl, expectedVideoId, result) {
  if (result === null || typeof result !== "object") {
    throw new YouTubeCaptureError("The YouTube media data was invalid.", "invalid_media");
  }
  const variables = isRecord(result.variables) ? result.variables : {};
  const normalized = normalizeDefuddleYouTubeResult({
    description: typeof result.description === "string" ? result.description : "",
    language: typeof result.language === "string"
      ? result.language
      : typeof variables.language === "string" ? variables.language : "",
  }, resultDocument);
  const transcript = normalized.segments.length === 0
    ? { kind: "unavailable" }
    : {
        kind: "available",
        language: normalized.language,
        segments: normalized.segments,
        chapters: normalized.chapters,
      };

  return {
    kind: "youtube_capture",
    videoId: expectedVideoId,
    sourceUrl: parsedUrl.canonicalUrl,
    title: requiredText(
      firstText(result.title, variables.title, readPageText(document, [
        ["h1.ytd-watch-metadata", "text"],
        ["h1.title", "text"],
        ['meta[property="og:title"]', "content"],
      ]), document.title.replace(/\s*-\s*YouTube\s*$/i, ""), "YouTube video"),
      YOUTUBE_CAPTURE_LIMITS.title,
    ),
    author: nullableText(firstText(result.author, variables.author, readPageText(document, [
      ['ytd-video-owner-renderer #channel-name a[href^="/@"]', "text"],
      ['#owner-name a[href^="/@"]', "text"],
    ])), YOUTUBE_CAPTURE_LIMITS.author),
    description: nullableText(normalized.description, YOUTUBE_CAPTURE_LIMITS.description),
    thumbnailUrl: readThumbnail(result, variables, document, expectedVideoId),
    transcript,
  };
}

function parseResultContent(content, sourceDocument) {
  if (typeof content !== "string") {
    throw new YouTubeCaptureError("The YouTube media data was invalid.", "invalid_media");
  }
  const Parser = sourceDocument.defaultView?.DOMParser ?? globalThis.DOMParser;
  if (typeof Parser !== "function") {
    throw new YouTubeCaptureError("The YouTube media data was invalid.", "invalid_media");
  }
  const parsed = new Parser().parseFromString(`<html><body>${content}</body></html>`, "text/html");
  if (parsed.body === null) {
    throw new YouTubeCaptureError("The YouTube media data was invalid.", "invalid_media");
  }
  return parsed;
}

function readExtractedVideoId(resultDocument) {
  const source = resultDocument.querySelector("iframe[src]")?.getAttribute("src") || "";
  const parsed = parseYouTubeUrl(source);
  return parsed?.videoId ?? null;
}

function readThumbnail(result, variables, document, videoId) {
  const candidates = [
    result.image,
    variables.image,
    document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];
  for (const candidate of candidates) {
    if (isYouTubeImageUrl(candidate)) return candidate;
  }
  return null;
}

function readPageText(document, selectors) {
  for (const [selector, source] of selectors) {
    const element = document.querySelector(selector);
    if (!element) continue;
    const value = source === "content" ? element.getAttribute("content") : element.textContent;
    const text = cleanText(value || "");
    if (text.length > 0) return text;
  }
  return "";
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = cleanText(value);
    if (text.length > 0) return text;
  }
  return "";
}

function requiredText(value, maxLength) {
  const text = cleanText(value);
  if (text.length === 0 || text.length > maxLength) {
    throw new YouTubeCaptureError("The YouTube media data was invalid.", "invalid_media");
  }
  return text;
}

function nullableText(value, maxLength) {
  if (value === null || value === undefined) return null;
  const text = cleanText(value);
  if (text.length > maxLength) {
    throw new YouTubeCaptureError("The YouTube media data was invalid.", "invalid_media");
  }
  return text || null;
}

function preferredLanguage(document) {
  const value = document.documentElement?.getAttribute("lang") || "";
  return cleanText(value) || undefined;
}

function assertCurrentVideo(document, expectedVideoId, fallbackUrl) {
  const currentUrl = document.defaultView?.location?.href || fallbackUrl;
  const current = parseYouTubeUrl(currentUrl);
  if (current === null || current.videoId !== expectedVideoId) throw staleVideoError();
}

function staleVideoError() {
  return new YouTubeCaptureError("The YouTube page changed videos during capture.", "stale_video");
}

function isAbortError(error) {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
