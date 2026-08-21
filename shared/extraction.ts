export type ExtractRequest = {
  url: string;
};

export type ExtractedArticle = {
  sourceUrl: string;
  title: string;
  author: string | null;
  html: string;
  wordCount: number;
};

export type ExtractErrorCode =
  | "bad_request"
  | "method_not_allowed"
  | "unsupported_media_type"
  | "request_too_large"
  | "unsafe_url"
  | "upstream_error"
  | "upstream_timeout"
  | "response_too_large"
  | "unsupported_content"
  | "extraction_failed"
  | "internal_error";

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
    value.wordCount >= 0
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
  switch (value) {
    case "bad_request":
    case "method_not_allowed":
    case "unsupported_media_type":
    case "request_too_large":
    case "unsafe_url":
    case "upstream_error":
    case "upstream_timeout":
    case "response_too_large":
    case "unsupported_content":
    case "extraction_failed":
    case "internal_error":
      return true;
    default:
      return false;
  }
}
