import Defuddle from "defuddle";
import { parseHTML } from "linkedom/worker";
import {
  parseMediaRequest,
  parseYouTubeUrl,
  type MediaRequest,
  type TranscriptSegment,
  type VideoChapter,
  type YouTubeMetadata,
  type YouTubeTranscriptContent,
  type YouTubeUrl,
} from "../shared/media";
import { ExtractionError, readJsonRequestBody } from "./extract";

const METADATA_TIMEOUT_MS = 4_000;
const TRANSCRIPT_TIMEOUT_MS = 8_000;

type ValidatedMediaRequest = {
  input: MediaRequest;
  url: YouTubeUrl;
};

export async function extractYouTubeMetadataFromRequest(request: Request): Promise<YouTubeMetadata> {
  const { input, url } = await parseYouTubeRequest(request);
  const startedAt = performance.now();
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", url.canonicalUrl);
  endpoint.searchParams.set("format", "json");

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        ...(input.language === null ? {} : { "Accept-Language": input.language }),
      },
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      logYouTubeStage(url.videoId, "metadata", startedAt, "upstream_error", response.status);
      throw upstreamError("The video details could not be loaded.");
    }

    const value: unknown = await response.json();
    const metadata = adaptOEmbedMetadata(value, url);
    if (metadata === null) {
      logYouTubeStage(url.videoId, "metadata", startedAt, "invalid_metadata", response.status);
      throw upstreamError("The video details could not be loaded.");
    }

    logYouTubeStage(url.videoId, "metadata", startedAt, "ok", response.status);
    return metadata;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    const timedOut = isTimeoutError(error);
    logYouTubeStage(url.videoId, "metadata", startedAt, timedOut ? "timeout" : "network_error");
    throw new ExtractionError({
      code: timedOut ? "upstream_timeout" : "upstream_error",
      status: timedOut ? 504 : 502,
      message: "The video details could not be loaded.",
    });
  }
}

export async function extractYouTubeTranscriptFromRequest(
  request: Request,
): Promise<YouTubeTranscriptContent> {
  const { input, url } = await parseYouTubeRequest(request);
  const startedAt = performance.now();
  const deadline = AbortSignal.timeout(TRANSCRIPT_TIMEOUT_MS);
  const { document } = parseHTML(
    `<!doctype html><html lang="${escapeAttribute(input.language ?? "en")}"><head>` +
      `<link rel="canonical" href="${url.canonicalUrl}"></head><body></body></html>`,
  );
  const playerDetails: ExtractedPlayerDetails = { description: null };
  try {
    const result = await new Defuddle(document, {
      url: url.canonicalUrl,
      useAsync: true,
      language: input.language ?? undefined,
      fetch: createYouTubeTranscriptFetch(url.videoId, deadline, playerDetails),
    }).parseAsync();
    const adapted = adaptYouTubeTranscript({
      content: result.content,
      description: result.description || playerDetails.description || "",
      language: result.language,
    });
    if (deadline.aborted && adapted.segments.length === 0) {
      throw new DOMException("The transcript request timed out.", "TimeoutError");
    }
    const transcript = adapted.segments.length === 0
      ? { kind: "unavailable" } as const
      : {
          kind: "available" as const,
          language: adapted.language,
          segments: adapted.segments,
          chapters: adapted.chapters,
        };

    logYouTubeStage(
      url.videoId,
      "transcript_total",
      startedAt,
      transcript.kind === "available" ? "ok" : "unavailable",
    );
    return {
      kind: "youtube_transcript",
      videoId: url.videoId,
      sourceUrl: url.canonicalUrl,
      description: adapted.description,
      transcript,
    };
  } catch (error) {
    const timedOut = deadline.aborted || isTimeoutError(error);
    logYouTubeStage(
      url.videoId,
      "transcript_total",
      startedAt,
      timedOut ? "timeout" : "extraction_error",
    );
    throw new ExtractionError({
      code: timedOut ? "upstream_timeout" : "upstream_error",
      status: timedOut ? 504 : 502,
      message: "The transcript could not be loaded.",
    });
  }
}

async function parseYouTubeRequest(request: Request): Promise<ValidatedMediaRequest> {
  const body = await readJsonRequestBody(request);
  const input = parseMediaRequest(body);
  if (input === null) {
    throw new ExtractionError({
      code: "bad_request",
      status: 400,
      message: "Enter a valid YouTube URL.",
    });
  }
  if (input.url.length > 2_048) {
    throw new ExtractionError({
      code: "bad_request",
      status: 400,
      message: "That URL is too long.",
    });
  }

  const url = parseYouTubeUrl(input.url);
  if (url === null) {
    throw new ExtractionError({
      code: "bad_request",
      status: 400,
      message: "Enter a valid YouTube URL.",
    });
  }
  return { input, url };
}

function adaptOEmbedMetadata(value: unknown, url: YouTubeUrl): YouTubeMetadata | null {
  if (!isRecord(value) || typeof value.title !== "string") return null;
  const title = cleanText(value.title);
  if (!isUsefulYouTubeTitle(title)) return null;

  return {
    kind: "youtube_metadata",
    videoId: url.videoId,
    sourceUrl: url.canonicalUrl,
    title,
    author: typeof value.author_name === "string" ? cleanText(value.author_name) || null : null,
    thumbnailUrl: validatedThumbnail(value.thumbnail_url),
  };
}

function isUsefulYouTubeTitle(value: string): boolean {
  return value.length > 0 && !/^(?:[-–—]\s*)?youtube(?:\s+video)?$/i.test(value);
}

function validatedThumbnail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "ytimg.com" || url.hostname.endsWith(".ytimg.com"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

type DefuddleYouTubeResult = {
  content: string;
  description: string;
  language: string;
};

function adaptYouTubeTranscript(result: DefuddleYouTubeResult): {
  description: string | null;
  language: string | null;
  segments: TranscriptSegment[];
  chapters: VideoChapter[];
} {
  const { document } = parseHTML(`<html><body>${result.content}</body></html>`);
  const transcript = document.querySelector(".transcript");
  const segments: TranscriptSegment[] = [];
  const chapters: VideoChapter[] = [];
  let pendingChapter: string | null = null;

  if (transcript !== null) {
    for (const child of Array.from(transcript.children)) {
      if (child.localName === "h3") {
        pendingChapter = cleanText(child.textContent ?? "");
        continue;
      }

      if (!child.classList.contains("transcript-segment")) continue;
      const timestamp = child.querySelector<HTMLElement>("[data-timestamp]");
      const startSeconds = Number(timestamp?.dataset.timestamp);
      const fullText = cleanText(child.textContent ?? "");
      const timestampText = cleanText(timestamp?.textContent ?? "");
      const text = fullText
        .replace(new RegExp(`^${escapeRegExp(timestampText)}\\s*[·•]?\\s*`), "")
        .trim();

      if (!Number.isFinite(startSeconds) || startSeconds < 0 || text.length === 0) continue;
      segments.push({ startSeconds, text });

      if (pendingChapter !== null && pendingChapter.length > 0) {
        chapters.push({ startSeconds, title: pendingChapter });
        pendingChapter = null;
      }
    }
  }

  const descriptionElement = Array.from(document.body.children).find(
    (element) => element.localName === "p" && !element.closest(".transcript"),
  );
  const description = cleanText(descriptionElement?.textContent ?? "") || cleanText(result.description);

  return {
    description: description || null,
    language: result.language.trim() || null,
    segments: segments.sort((left, right) => left.startSeconds - right.startSeconds),
    chapters: chapters.sort((left, right) => left.startSeconds - right.startSeconds),
  };
}

function createYouTubeTranscriptFetch(
  videoId: string,
  deadline: AbortSignal,
  playerDetails: ExtractedPlayerDetails,
): typeof fetch {
  return async (input, init) => {
    const startedAt = performance.now();
    const stage = youtubeFetchStage(input);
    const signals = [deadline];
    if (init?.signal !== undefined && init.signal !== null) signals.push(init.signal);

    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
      if (stage === "player_data" && response.ok) {
        const playerData: unknown = await response.clone().json().catch(() => null);
        const description = playerDescriptionFrom(playerData, videoId);
        if (description !== null) playerDetails.description = description;
      }
      logYouTubeStage(videoId, stage, startedAt, response.ok ? "ok" : "upstream_error", response.status);
      return response;
    } catch (error) {
      logYouTubeStage(videoId, stage, startedAt, isTimeoutError(error) ? "timeout" : "network_error");
      throw error;
    }
  };
}

type ExtractedPlayerDetails = {
  description: string | null;
};

function playerDescriptionFrom(value: unknown, videoId: string): string | null {
  if (!isRecord(value) || !isRecord(value.videoDetails)) return null;
  const details = value.videoDetails;
  if (details.videoId !== videoId || typeof details.shortDescription !== "string") return null;
  return cleanText(details.shortDescription) || null;
}

function youtubeFetchStage(input: RequestInfo | URL): string {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname.endsWith("/youtubei/v1/player")) return "player_data";
  if (url.pathname.endsWith("/youtubei/v1/next")) return "chapters";
  if (url.pathname.endsWith("/api/timedtext")) return "caption_xml";
  return "transcript_upstream";
}

function logYouTubeStage(
  videoId: string,
  stage: string,
  startedAt: number,
  result: string,
  status?: number,
): void {
  console.log(JSON.stringify({
    message: "YouTube extraction stage",
    videoId,
    stage,
    elapsedMs: Math.round(performance.now() - startedAt),
    result,
    ...(status === undefined ? {} : { status }),
  }));
}

function upstreamError(message: string): ExtractionError {
  return new ExtractionError({ code: "upstream_error", status: 502, message });
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
