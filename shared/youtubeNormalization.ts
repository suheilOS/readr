import type { TranscriptSegment, VideoChapter } from "./media";

/** The metadata from Defuddle's YouTube response used by the Worker and extension. */
export type DefuddleYouTubeMetadata = {
  description?: string;
  language?: string;
};

export type NormalizedYouTubeTranscript = {
  description: string | null;
  language: string | null;
  segments: TranscriptSegment[];
  chapters: VideoChapter[];
};

/**
 * Convert Defuddle's deliberately HTML-shaped YouTube transcript into Readr's
 * canonical media types. The caller supplies the parser so the browser can
 * use its native DOMParser without pulling linkedom into the extension.
 */
export function normalizeDefuddleYouTubeResult(
  result: DefuddleYouTubeMetadata,
  document: Document,
): NormalizedYouTubeTranscript {
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
      const text = timestampText.length === 0
        ? fullText
        : fullText
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

  const descriptionElement = Array.from(document.body?.children ?? []).find(
    (element) => element.localName === "p" && !element.closest(".transcript"),
  );
  const description = cleanText(descriptionElement?.textContent ?? "") || cleanText(result.description ?? "");

  return {
    description: description || null,
    language: cleanText(result.language ?? "") || null,
    segments: segments.sort((left, right) => left.startSeconds - right.startSeconds),
    chapters: chapters.sort((left, right) => left.startSeconds - right.startSeconds),
  };
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
