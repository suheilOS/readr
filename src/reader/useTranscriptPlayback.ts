import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TranscriptSegment,
  VideoChapter,
  YouTubeTranscript,
} from "../../shared/media";
import { activeTimedEntryIndex } from "./transcriptSync";

type AvailableTranscript = Extract<YouTubeTranscript, { kind: "available" }>;

const EMPTY_SEGMENTS: readonly TranscriptSegment[] = [];
const EMPTY_CHAPTERS: readonly VideoChapter[] = [];

export function useTranscriptPlayback(
  transcript: AvailableTranscript | null,
  recordTime: (seconds: number) => void,
) {
  const currentTimeRef = useRef(0);
  const segmentsRef = useRef<readonly TranscriptSegment[]>(EMPTY_SEGMENTS);
  const chaptersRef = useRef<readonly VideoChapter[]>(EMPTY_CHAPTERS);
  const [displayedTime, setDisplayedTime] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [activeChapterIndex, setActiveChapterIndex] = useState(-1);
  const segments = transcript?.segments ?? EMPTY_SEGMENTS;
  const chapters = transcript?.chapters ?? EMPTY_CHAPTERS;

  segmentsRef.current = segments;
  chaptersRef.current = chapters;

  useEffect(() => {
    const time = currentTimeRef.current;
    setActiveSegmentIndex(activeTimedEntryIndex(segments, time));
    setActiveChapterIndex(activeTimedEntryIndex(chapters, time));
  }, [chapters, segments]);

  const handleTimeChange = useCallback((seconds: number) => {
    const safeSeconds = Math.max(0, seconds);
    currentTimeRef.current = safeSeconds;
    recordTime(safeSeconds);
    const nextSegmentIndex = activeTimedEntryIndex(segmentsRef.current, safeSeconds);
    const nextChapterIndex = activeTimedEntryIndex(chaptersRef.current, safeSeconds);
    setActiveSegmentIndex((current) => current === nextSegmentIndex ? current : nextSegmentIndex);
    setActiveChapterIndex((current) => current === nextChapterIndex ? current : nextChapterIndex);
    const nextDisplayedTime = Math.floor(safeSeconds);
    setDisplayedTime((current) => current === nextDisplayedTime ? current : nextDisplayedTime);
  }, [recordTime]);

  return {
    displayedTime,
    activeSegmentIndex,
    activeChapterIndex,
    handleTimeChange,
  };
}
