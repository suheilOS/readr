import Defuddle from "defuddle";
import { parseHTML } from "linkedom/worker";
import {
  parseMediaRequest,
  parseYouTubeUrl,
  type MediaRequest,
  type TranscriptSegment,
  type VideoChapter,
  type YouTubeMetadata,
  type YouTubeReaderContent,
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
  return extractYouTubeMetadata(input, url);
}

async function extractYouTubeMetadata(input: MediaRequest, url: YouTubeUrl): Promise<YouTubeMetadata> {
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
  return extractYouTubeTranscript(input, url);
}

async function extractYouTubeTranscript(
  input: MediaRequest,
  url: YouTubeUrl,
): Promise<YouTubeTranscriptContent> {
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

/**
 * Keep the old combined response available while already-open tabs move to
 * the independent metadata and transcript endpoints.
 */
export async function extractYouTubeFromRequest(request: Request): Promise<YouTubeReaderContent> {
  const { input, url } = await parseYouTubeRequest(request);
  const [metadataResult, transcriptResult] = await Promise.allSettled([
    extractYouTubeMetadata(input, url),
    extractYouTubeTranscript(input, url),
  ]);

  if (metadataResult.status === "rejected") throw metadataResult.reason;

  const metadata = metadataResult.value;
  const transcript = transcriptResult.status === "fulfilled"
    ? transcriptResult.value
    : {
        kind: "youtube_transcript" as const,
        videoId: metadata.videoId,
        sourceUrl: metadata.sourceUrl,
        description: null,
        transcript: { kind: "unavailable" as const },
      };

  return {
    kind: "youtube",
    videoId: metadata.videoId,
    sourceUrl: metadata.sourceUrl,
    title: metadata.title,
    author: metadata.author,
    description: transcript.description,
    thumbnailUrl: metadata.thumbnailUrl,
    transcript: transcript.transcript,
  };
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
    const clientName = stage === "player_data" ? youtubePlayerClientName(init?.body) : null;

    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
      let result = response.ok ? "ok" : "upstream_error";
      let playerDiagnostics: YouTubePlayerDiagnostics | null = null;
      if (stage === "player_data" && response.ok) {
        const playerData: unknown = await response.clone().json().catch(() => undefined);
        if (playerData === undefined) {
          result = "invalid_json";
          playerDiagnostics = emptyPlayerDiagnostics(clientName);
        } else {
          playerDiagnostics = inspectPlayerResponse(playerData, videoId, clientName);
          const description = playerDescriptionFrom(playerData, videoId);
          if (description !== null) playerDetails.description = description;
          result = playerDiagnostics.captionTrackCount === 0
            ? "no_caption_tracks"
            : playerDiagnostics.usableCaptionTrackCount === 0
              ? "no_usable_caption_tracks"
              : "ok";
        }
      }
      logYouTubeStage(videoId, stage, startedAt, result, response.status, playerDiagnostics);
      return response;
    } catch (error) {
      logYouTubeStage(
        videoId,
        stage,
        startedAt,
        isTimeoutError(error) ? "timeout" : "network_error",
        undefined,
        stage === "player_data" ? emptyPlayerDiagnostics(clientName) : null,
      );
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

type YouTubePlayerDiagnostics = {
  clientName: string | null;
  playabilityStatus: string | null;
  playabilityReason: string | null;
  videoIdMatches: boolean;
  captionTrackCount: number;
  usableCaptionTrackCount: number;
  manualCaptionTrackCount: number;
  asrCaptionTrackCount: number;
};

function youtubePlayerClientName(body: BodyInit | null | undefined): string | null {
  if (typeof body !== "string") return null;

  try {
    const payload: unknown = JSON.parse(body);
    if (!isRecord(payload) || !isRecord(payload.context) || !isRecord(payload.context.client)) return null;
    return typeof payload.context.client.clientName === "string"
      ? payload.context.client.clientName
      : null;
  } catch {
    return null;
  }
}

function inspectPlayerResponse(
  value: unknown,
  videoId: string,
  clientName: string | null,
): YouTubePlayerDiagnostics {
  const record = isRecord(value) ? value : null;
  const playability = record !== null && isRecord(record.playabilityStatus)
    ? record.playabilityStatus
    : null;
  const details = record !== null && isRecord(record.videoDetails) ? record.videoDetails : null;
  const captionTracks = record !== null && isRecord(record.captions) &&
      isRecord(record.captions.playerCaptionsTracklistRenderer) &&
      Array.isArray(record.captions.playerCaptionsTracklistRenderer.captionTracks)
    ? record.captions.playerCaptionsTracklistRenderer.captionTracks
    : [];
  const validTracks = captionTracks.filter(isRecord);
  const usableTracks = validTracks.filter((track) => (
    typeof track.baseUrl === "string" && track.baseUrl.trim().length > 0
  ));
  const asrCaptionTrackCount = validTracks.filter((track) => track.kind === "asr").length;

  return {
    clientName,
    playabilityStatus: playability !== null && typeof playability.status === "string"
      ? playability.status
      : null,
    playabilityReason: playability !== null && typeof playability.reason === "string"
      ? truncateDiagnostic(playability.reason)
      : null,
    videoIdMatches: details !== null && details.videoId === videoId,
    captionTrackCount: captionTracks.length,
    usableCaptionTrackCount: usableTracks.length,
    manualCaptionTrackCount: validTracks.length - asrCaptionTrackCount,
    asrCaptionTrackCount,
  };
}

function emptyPlayerDiagnostics(clientName: string | null): YouTubePlayerDiagnostics {
  return {
    clientName,
    playabilityStatus: null,
    playabilityReason: null,
    videoIdMatches: false,
    captionTrackCount: 0,
    usableCaptionTrackCount: 0,
    manualCaptionTrackCount: 0,
    asrCaptionTrackCount: 0,
  };
}

function truncateDiagnostic(value: string): string {
  const cleaned = cleanText(value);
  return cleaned.length > 200 ? `${cleaned.slice(0, 197)}...` : cleaned;
}

function logYouTubeStage(
  videoId: string,
  stage: string,
  startedAt: number,
  result: string,
  status?: number,
  details?: YouTubePlayerDiagnostics | null,
): void {
  console.log(JSON.stringify({
    message: "YouTube extraction stage",
    videoId,
    stage,
    elapsedMs: Math.round(performance.now() - startedAt),
    result,
    ...(status === undefined ? {} : { status }),
    ...(details === null || details === undefined ? {} : details),
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
