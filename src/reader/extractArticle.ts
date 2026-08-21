import {
  isExtractErrorBody,
  isExtractedArticle,
  type ExtractedArticle,
} from "../../shared/extraction";

export class ArticleExtractionError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ArticleExtractionError";
    this.code = code;
  }
}

export async function extractArticle(
  url: string,
  signal: AbortSignal,
): Promise<ExtractedArticle> {
  let response: Response;

  try {
    response = await fetch("/api/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ArticleExtractionError(
      "The page could not be opened. Please try the original link.",
      "network_error",
    );
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new ArticleExtractionError(
      "The page returned an unreadable response. Please try the original link.",
      "invalid_response",
    );
  }

  if (!response.ok) {
    if (isExtractErrorBody(responseBody)) {
      throw new ArticleExtractionError(
        responseBody.error.message,
        responseBody.error.code,
      );
    }

    throw new ArticleExtractionError(
      "The page could not be opened. Please try the original link.",
      `http_${response.status}`,
    );
  }

  if (!isExtractedArticle(responseBody)) {
    throw new ArticleExtractionError(
      "The page returned incomplete content. Please try the original link.",
      "invalid_response",
    );
  }

  return responseBody;
}
