import Defuddle from "defuddle";
import { parseHTML } from "linkedom/worker";
import {
  parseExtractRequest,
  type ExtractErrorCode,
  type ExtractedArticle,
} from "../shared/extraction";
import {
  isRedirectStatus,
  MAX_REDIRECTS,
  normalizePublicUrl,
  resolvePublicUrl,
} from "./urlSafety";

export const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

type ErrorStatus = {
  code: ExtractErrorCode;
  status: number;
  message: string;
};

type SizeErrorCode = "request_too_large" | "response_too_large";

export type ExtractionTimings = {
  fetchSource: number;
  parseHtml: number;
  defuddle: number;
};

export type TimedExtraction = {
  article: ExtractedArticle;
  timings: ExtractionTimings;
};

export function formatExtractionServerTiming(timings: ExtractionTimings): string {
  const entries: readonly [string, number][] = [
    ["fetch-source", timings.fetchSource],
    ["parse-html", timings.parseHtml],
    ["defuddle", timings.defuddle],
  ];
  return entries
    .map(([name, duration]) => `${name};dur=${Math.max(0, duration).toFixed(1)}`)
    .join(", ");
}

export class ExtractionError extends Error {
  readonly code: ExtractErrorCode;
  readonly status: number;

  constructor({ code, status, message }: ErrorStatus) {
    super(message);
    this.name = "ExtractionError";
    this.code = code;
    this.status = status;
  }
}

export async function extractFromRequestWithTimings(request: Request): Promise<TimedExtraction> {
  const requestBody = await readJsonRequestBody(request);
  const input = parseExtractRequest(requestBody);
  if (input === null) {
    throw new ExtractionError({
      code: "bad_request",
      status: 400,
      message: "Enter a valid URL.",
    });
  }

  if (input.url.length > 2_048) {
    throw new ExtractionError({
      code: "bad_request",
      status: 400,
      message: "That URL is too long.",
    });
  }

  const sourceUrl = normalizePublicUrl(input.url);
  if (sourceUrl === null) {
    throw new ExtractionError({
      code: "unsafe_url",
      status: 422,
      message: "That URL cannot be opened.",
    });
  }

  return extractFromUrlWithTimings(sourceUrl);
}

export async function extractFromUrlWithTimings(sourceUrl: URL): Promise<TimedExtraction> {
  const fetchStartedAt = performance.now();
  const fetchedPage = await fetchHtml(sourceUrl);
  const fetchSource = performance.now() - fetchStartedAt;

  const parseStartedAt = performance.now();
  const { document } = parseHTML(fetchedPage.html);
  const parseHtml = performance.now() - parseStartedAt;

  const defuddleStartedAt = performance.now();
  const result = new Defuddle(document, {
    url: fetchedPage.sourceUrl,
    useAsync: false,
  }).parse();
  const defuddle = performance.now() - defuddleStartedAt;
  const title = result.title.trim();
  const html = result.content.trim();

  if (title.length === 0 || html.length === 0) {
    throw new ExtractionError({
      code: "extraction_failed",
      status: 422,
      message: "This page did not contain readable content.",
    });
  }

  return {
    article: {
      sourceUrl: fetchedPage.sourceUrl,
      title,
      author: result.author.trim() || null,
      html,
      wordCount: Number.isSafeInteger(result.wordCount) && result.wordCount >= 0
        ? result.wordCount
        : countWords(html),
    },
    timings: { fetchSource, parseHtml, defuddle },
  };
}

export async function readJsonRequestBody(
  request: Request,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ExtractionError({
      code: "unsupported_media_type",
      status: 415,
      message: "Send a JSON request.",
    });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ExtractionError({
      code: "request_too_large",
      status: 413,
      message: "The request is too large.",
    });
  }

  if (request.body === null) {
    throw new ExtractionError({
      code: "bad_request",
      status: 400,
      message: "Enter a valid URL.",
    });
  }

  let body: string;
  try {
    body = await readBodyWithLimit(
      request.body,
      maxBytes,
      "request_too_large",
    );
  } catch (error) {
    if (error instanceof ExtractionError) {
      throw error;
    }

    throw new ExtractionError({
      code: "bad_request",
      status: 400,
      message: "Enter a valid URL.",
    });
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new ExtractionError({
      code: "bad_request",
      status: 400,
      message: "Enter a valid URL.",
    });
  }
}

export async function fetchHtml(initialUrl: URL): Promise<{ html: string; sourceUrl: string }> {
  const page = await fetchPage(initialUrl);
  if (page.kind !== 'html') throw new Error('Expected HTML');
  return page;
}

export async function fetchPage(
  initialUrl: URL,
  { allowPdf = false, maxBytes = MAX_HTML_BYTES }: { allowPdf?: boolean; maxBytes?: number } = {},
): Promise<{ kind: 'html'; html: string; sourceUrl: string } | { kind: 'pdf'; sourceUrl: string }> {
  let currentUrl = initialUrl;
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en",
          "User-Agent": "readr/1.0",
        },
        redirect: "manual",
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new ExtractionError({
          code: "upstream_timeout",
          status: 504,
          message: "The page took too long to respond.",
        });
      }

      throw new ExtractionError({
        code: "upstream_error",
        status: 502,
        message: "The page could not be opened.",
      });
    }

    if (isRedirectStatus(response.status)) {
      const responseBody = response.body;
      if (responseBody !== null) {
        await responseBody.cancel();
      }

      const location = response.headers.get("location");
      const nextUrl = location === null ? null : resolvePublicUrl(location, currentUrl);
      if (nextUrl === null || redirect === MAX_REDIRECTS) {
        throw new ExtractionError({
          code: "upstream_error",
          status: 502,
          message: "The page could not be opened.",
        });
      }

      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok) {
      const responseBody = response.body;
      if (responseBody !== null) {
        await responseBody.cancel();
      }

      throw new ExtractionError({
        code: "upstream_error",
        status: 502,
        message: "The page could not be opened.",
      });
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (allowPdf && contentType.split(';')[0].trim() === 'application/pdf') {
      await response.body?.cancel();
      return { kind: 'pdf', sourceUrl: currentUrl.href };
    }
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      const responseBody = response.body;
      if (responseBody !== null) {
        await responseBody.cancel();
      }

      throw new ExtractionError({
        code: "unsupported_content",
        status: 422,
        message: "That URL does not point to an HTML page.",
      });
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      const responseBody = response.body;
      if (responseBody !== null) {
        await responseBody.cancel();
      }

      throw new ExtractionError({
        code: "response_too_large",
        status: 413,
        message: "That page is too large to read here.",
      });
    }

    return {
      kind: 'html',
      html: await readBodyWithLimit(
        response.body,
        maxBytes,
        "response_too_large",
        parseCharset(contentType),
      ),
      sourceUrl: currentUrl.toString(),
    };
  }

  throw new ExtractionError({
    code: "upstream_error",
    status: 502,
    message: "The page could not be opened.",
  });
}

export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  tooLargeCode: SizeErrorCode,
  encoding = "utf-8",
): Promise<string> {
  const bytes = await readBodyBytesWithLimit(body, maxBytes, tooLargeCode);

  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export async function readBodyBytesWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  tooLargeCode: SizeErrorCode,
): Promise<Uint8Array> {
  if (body === null) {
    throw new ExtractionError({
      code: "upstream_error",
      status: 502,
      message: "The page could not be opened.",
    });
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value === undefined) {
      continue;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new ExtractionError({
        code: tooLargeCode,
        status: 413,
        message: "That page is too large to read here.",
      });
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseCharset(contentType: string): string {
  const match = /(?:^|;)\s*charset\s*=\s*["']?([^;\s"']+)/i.exec(contentType);
  return match?.[1] ?? "utf-8";
}

function countWords(value: string): number {
  return value.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}
