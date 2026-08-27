import { isExtractErrorBody } from "../../shared/extraction";
import { isYouTubeReaderContent, type YouTubeReaderContent } from "../../shared/media";

export class MediaExtractionError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "MediaExtractionError";
    this.code = code;
  }
}

export async function extractYouTube(
  url: string,
  signal: AbortSignal,
): Promise<YouTubeReaderContent> {
  let response: Response;
  try {
    response = await fetch("/api/media/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, language: navigator.language }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new MediaExtractionError("The transcript could not be loaded.", "network_error");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new MediaExtractionError("The transcript could not be loaded.", "invalid_response");
  }

  if (!response.ok) {
    if (isExtractErrorBody(body)) {
      throw new MediaExtractionError(body.error.message, body.error.code);
    }
    throw new MediaExtractionError("The transcript could not be loaded.", `http_${response.status}`);
  }

  if (!isYouTubeReaderContent(body)) {
    throw new MediaExtractionError("The video returned incomplete details.", "invalid_response");
  }
  return body;
}
