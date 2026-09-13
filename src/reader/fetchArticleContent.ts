import {
  isArticleContentResponse,
  isExtractErrorBody,
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

export async function fetchArticleContent(
  itemId: string,
  signal: AbortSignal,
): Promise<ExtractedArticle> {
  let response: Response;

  try {
    response = await fetch(`/api/items/${encodeURIComponent(itemId)}/article-content`, {
      credentials: "include",
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

  if (!isArticleContentResponse(responseBody)) {
    throw new ArticleExtractionError(
      "The page returned incomplete content. Please try the original link.",
      "invalid_response",
    );
  }

  return responseBody.content;
}
