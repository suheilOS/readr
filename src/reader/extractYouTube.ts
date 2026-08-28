import { isExtractErrorBody } from "../../shared/extraction";
import {
  isYouTubeMetadata,
  isYouTubeTranscriptContent,
  type YouTubeMetadata,
  type YouTubeTranscriptContent,
} from "../../shared/media";

export class MediaExtractionError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "MediaExtractionError";
    this.code = code;
  }
}

export async function extractYouTubeMetadata(
  url: string,
  signal: AbortSignal,
): Promise<YouTubeMetadata> {
  const body = await requestYouTubeResource("metadata", url, signal);
  if (!isYouTubeMetadata(body)) {
    throw new MediaExtractionError("The video returned incomplete details.", "invalid_response");
  }
  return body;
}

export async function extractYouTubeTranscript(
  url: string,
  signal: AbortSignal,
): Promise<YouTubeTranscriptContent> {
  const body = await requestYouTubeResource("transcript", url, signal);
  if (!isYouTubeTranscriptContent(body)) {
    throw new MediaExtractionError("The video returned incomplete details.", "invalid_response");
  }
  return body;
}

async function requestYouTubeResource(
  resource: "metadata" | "transcript",
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  const failureMessage = resource === "metadata"
    ? "The video details could not be loaded."
    : "The transcript could not be loaded.";
  let response: Response;
  try {
    response = await fetch(`/api/media/youtube/${resource}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, language: navigator.language }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new MediaExtractionError(failureMessage, "network_error");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new MediaExtractionError(failureMessage, "invalid_response");
  }

  if (!response.ok) {
    if (isExtractErrorBody(body)) {
      throw new MediaExtractionError(body.error.message, body.error.code);
    }
    throw new MediaExtractionError(failureMessage, `http_${response.status}`);
  }

  return body;
}
