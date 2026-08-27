import Defuddle from "defuddle";
import { parseHTML } from "linkedom/worker";
import {
  parseMediaRequest,
  parseYouTubeUrl,
  type TranscriptSegment,
  type VideoChapter,
  type YouTubeReaderContent,
} from "../shared/media";
import { ExtractionError, fetchHtml, readJsonRequestBody } from "./extract";

export async function extractYouTubeFromRequest(request: Request): Promise<YouTubeReaderContent> {
  const body = await readJsonRequestBody(request);
  const input = parseMediaRequest(body);
  const parsedUrl = input === null ? null : parseYouTubeUrl(input.url);

  if (input === null || parsedUrl === null) {
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

  const fetchedPage = await fetchHtml(new URL(parsedUrl.canonicalUrl));
  const { document } = parseHTML(fetchedPage.html);
  const result = await new Defuddle(document, {
    url: parsedUrl.canonicalUrl,
    useAsync: true,
    language: input.language ?? undefined,
  }).parseAsync();

  const adapted = adaptYouTubeResult({
    content: result.content,
    title: result.title,
    author: result.author,
    description: result.description,
    language: result.language,
    schemaOrgData: result.schemaOrgData,
  });

  return {
    kind: "youtube",
    videoId: parsedUrl.videoId,
    sourceUrl: parsedUrl.canonicalUrl,
    title: adapted.title || "YouTube video",
    author: adapted.author,
    description: adapted.description,
    thumbnailUrl: adapted.thumbnailUrl,
    transcript: adapted.segments.length === 0
      ? { kind: "unavailable" }
      : {
          kind: "available",
          language: adapted.language,
          segments: adapted.segments,
          chapters: adapted.chapters,
        },
  };
}

type DefuddleYouTubeResult = {
  content: string;
  title: string;
  author: string;
  description: string;
  language: string;
  schemaOrgData: unknown;
};

function adaptYouTubeResult(result: DefuddleYouTubeResult): {
  title: string;
  author: string | null;
  description: string | null;
  thumbnailUrl: string | null;
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
  const description = cleanText(descriptionElement?.textContent ?? result.description);

  return {
    title: result.title.trim(),
    author: result.author.trim() || null,
    description: description || null,
    thumbnailUrl: findThumbnail(result.schemaOrgData),
    language: result.language.trim() || null,
    segments: segments.sort((left, right) => left.startSeconds - right.startSeconds),
    chapters: chapters.sort((left, right) => left.startSeconds - right.startSeconds),
  };
}

function findThumbnail(schema: unknown): string | null {
  const entries = Array.isArray(schema) ? schema : [schema];
  for (const entry of entries) {
    if (!isRecord(entry) || entry["@type"] !== "VideoObject") continue;
    const value = entry.thumbnailUrl;
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate !== "string") continue;

    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" && url.hostname.endsWith("ytimg.com")) {
        return url.toString();
      }
    } catch {
      continue;
    }
  }
  return null;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
