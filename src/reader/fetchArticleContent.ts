import {
  isArticleContentPendingResponse,
  isExtractErrorBody,
  normalizeArticleContentResponse,
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
  // Only retry the explicit processing response, never HTTP/auth/extraction errors.
  for (let attempt = 0; attempt <= 20; attempt += 1) {
    signal.throwIfAborted();
    const result = await requestArticleContent(itemId, signal);
    if (result !== null) return result;
    if (attempt < 20) await waitForRetry(signal);
  }
  throw new ArticleExtractionError(
    "This article is still being prepared. Please reopen it in a moment.",
    "processing",
  );
}

function waitForRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 1_000);
    function abort() {
      window.clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function requestArticleContent(itemId: string, signal: AbortSignal): Promise<ExtractedArticle | null> {
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

  // Authentication failures may come from a proxy with an empty/HTML body.
  // Preserve the auth signal so the session cache is always cleared.
  if (response.status === 401) {
    throw new ArticleExtractionError("Sign in to open this article.", "unauthorized");
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

  if (response.status === 202 && isArticleContentPendingResponse(responseBody)) return null;

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

  const articleResponse = normalizeArticleContentResponse(responseBody);
  if (articleResponse === null) {
    throw new ArticleExtractionError(
      "The page returned incomplete content. Please try the original link.",
      "invalid_response",
    );
  }

  return articleResponse.content;
}
