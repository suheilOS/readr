export type ExtractRequest = {
  url: string;
};

export type ArticleCapabilities = {
  figures: boolean;
  svg: boolean;
  media: boolean;
  math: boolean;
};

export type ExtractedArticle = {
  sourceUrl: string;
  title: string;
  author: string | null;
  html: string;
  wordCount: number;
  capabilities: ArticleCapabilities | null;
};

export type ArticleContentResponse = {
  content: ExtractedArticle;
};

export type ArticleContentPendingResponse = { status: "processing" };

export function isArticleContentPendingResponse(value: unknown): value is ArticleContentPendingResponse {
  return isRecord(value) && value.status === "processing";
}

export const EXTRACT_ERROR_CODES = [
  "bad_request",
  "method_not_allowed",
  "unsupported_media_type",
  "request_too_large",
  "rate_limited",
  "not_found",
  "unsafe_url",
  "upstream_error",
  "upstream_timeout",
  "response_too_large",
  "unsupported_content",
  "extraction_failed",
  "internal_error",
] as const;

export type ExtractErrorCode = (typeof EXTRACT_ERROR_CODES)[number];

export type ExtractErrorBody = {
  error: {
    code: ExtractErrorCode;
    message: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseExtractRequest(value: unknown): ExtractRequest | null {
  if (!isRecord(value) || !isNonEmptyString(value.url)) {
    return null;
  }

  return { url: value.url.trim() };
}

export function isArticleContentResponse(value: unknown): value is ArticleContentResponse {
  return isRecord(value) && isExtractedArticle(value.content);
}

export function normalizeArticleContentResponse(value: unknown): ArticleContentResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const content = normalizeExtractedArticle(value.content);
  return content === null ? null : { content };
}

export function normalizeExtractedArticle(value: unknown): ExtractedArticle | null {
  if (!isRecord(value)) {
    return null;
  }

  let capabilities: ArticleCapabilities | null = null;
  if (value.capabilities !== undefined && value.capabilities !== null) {
    capabilities = normalizeArticleCapabilities(value.capabilities);
    if (capabilities === null) {
      return null;
    }
  }

  const article = {
    sourceUrl: value.sourceUrl,
    title: value.title,
    author: value.author,
    html: value.html,
    wordCount: value.wordCount,
    capabilities,
  };
  return isExtractedArticle(article) ? article : null;
}

export function isArticleCapabilities(value: unknown): value is ArticleCapabilities {
  return (
    isRecord(value) &&
    typeof value.figures === "boolean" &&
    typeof value.svg === "boolean" &&
    typeof value.media === "boolean" &&
    typeof value.math === "boolean"
  );
}

export function normalizeArticleCapabilities(value: unknown): ArticleCapabilities | null {
  if (!isArticleCapabilities(value)) {
    return null;
  }

  return {
    figures: value.figures,
    svg: value.svg,
    media: value.media,
    math: value.math,
  };
}

export function isExtractedArticle(value: unknown): value is ExtractedArticle {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isHttpUrl(value.sourceUrl) &&
    isNonEmptyString(value.title) &&
    (value.author === null || typeof value.author === "string") &&
    isNonEmptyString(value.html) &&
    typeof value.wordCount === "number" &&
    Number.isSafeInteger(value.wordCount) &&
    value.wordCount >= 0 &&
    "capabilities" in value &&
    (value.capabilities === null || isArticleCapabilities(value.capabilities))
  );
}

function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isExtractErrorBody(value: unknown): value is ExtractErrorBody {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }

  return (
    isExtractErrorCode(value.error.code) &&
    isNonEmptyString(value.error.message)
  );
}

function isExtractErrorCode(value: unknown): value is ExtractErrorCode {
  return typeof value === "string" && EXTRACT_ERROR_CODES.some((code) => code === value);
}
