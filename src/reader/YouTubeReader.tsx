import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "../../shared/item";
import { parseYouTubeUrl, type YouTubeReaderContent, type YouTubeUrl } from "../../shared/media";
import { playError } from "../soundCues";
import { extractYouTube, MediaExtractionError } from "./extractYouTube";
import { activeTimedEntryIndex, formatPlaybackTime } from "./transcriptSync";
import { YouTubePlayer, type YouTubePlayerHandle } from "./YouTubePlayer";
import { useMediaProgress } from "./useMediaProgress";

type YouTubeReaderProps = {
  item: Item;
};

type MediaState =
  | { status: "loading" }
  | { status: "ready"; content: YouTubeReaderContent }
  | { status: "degraded"; message: string };

export function YouTubeReader({ item }: YouTubeReaderProps) {
  const parsedUrl = parseYouTubeUrl(item.url);
  if (parsedUrl === null) return null;

  return <YouTubeReaderContentView key={item.id} item={item} parsedUrl={parsedUrl} />;
}

function YouTubeReaderContentView({ item, parsedUrl }: YouTubeReaderProps & { parsedUrl: YouTubeUrl }) {
  const [state, setState] = useState<MediaState>({ status: "loading" });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [activeVisible, setActiveVisible] = useState(true);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const segmentRefs = useRef<Array<HTMLLIElement | null>>([]);
  const {
    initialPosition,
    recordTime,
    recordDuration,
    recordPlaying,
  } = useMediaProgress(item.id);

  useEffect(() => headingRef.current?.focus(), [item.id]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void extractYouTube(parsedUrl.canonicalUrl, controller.signal).then((content) => {
      if (controller.signal.aborted) return;
      startTransition(() => setState({ status: "ready", content }));
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      playError();
      setState({
        status: "degraded",
        message: error instanceof MediaExtractionError
          ? error.message
          : "The transcript could not be loaded.",
      });
    });
    return () => controller.abort();
  }, [item.id, parsedUrl.canonicalUrl]);

  const transcript = state.status === "ready" && state.content.transcript.kind === "available"
    ? state.content.transcript
    : null;
  const activeSegmentIndex = useMemo(
    () => activeTimedEntryIndex(transcript?.segments ?? [], currentTime),
    [currentTime, transcript?.segments],
  );
  const activeChapterIndex = useMemo(
    () => activeTimedEntryIndex(transcript?.chapters ?? [], currentTime),
    [currentTime, transcript?.chapters],
  );

  useEffect(() => {
    const activeElement = segmentRefs.current[activeSegmentIndex];
    if (activeElement === null || activeElement === undefined) {
      setActiveVisible(true);
      return;
    }

    if (autoFollow && (playing || activeSegmentIndex > 0)) {
      activeElement.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }

    const observer = new IntersectionObserver(([entry]) => setActiveVisible(entry.isIntersecting), {
      threshold: 0.7,
    });
    observer.observe(activeElement);
    return () => observer.disconnect();
  }, [activeSegmentIndex, autoFollow, playing]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const player = playerRef.current;
      if (player === null) return;

      if (event.key === "k" || event.key === "K" || event.key === " ") {
        event.preventDefault();
        if (playing) player.pause();
        else player.play();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        player.seekBy(-5);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        player.seekBy(5);
      } else if (event.key === "j" || event.key === "J") {
        event.preventDefault();
        player.seekBy(-10);
      } else if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        player.seekBy(10);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playing]);

  const handleTimeChange = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    recordTime(seconds);
  }, [recordTime]);
  const handleDurationChange = useCallback((seconds: number) => {
    setDuration(seconds);
    recordDuration(seconds);
  }, [recordDuration]);
  const handlePlayingChange = useCallback((nextPlaying: boolean) => {
    setPlaying(nextPlaying);
    recordPlaying(nextPlaying);
  }, [recordPlaying]);

  function seekTo(seconds: number) {
    setAutoFollow(true);
    playerRef.current?.seekTo(seconds);
  }

  function returnToCurrentPosition() {
    setAutoFollow(true);
    segmentRefs.current[activeSegmentIndex]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const title = state.status === "ready" ? state.content.title : item.title;
  const author = state.status === "ready" ? state.content.author : null;
  const description = state.status === "ready" ? state.content.description : null;

  return (
    <article className="media-reader">
      <header className="reader-title-block media-title-block">
        <p className="reader-type">YouTube video</p>
        <h1 ref={headingRef} tabIndex={-1} className="reader-title">{title}</h1>
        {author !== null && <p className="reader-meta">{author}</p>}
      </header>

      <div className="media-reader-layout">
        <section className="media-player-column" aria-label="Video player">
          {initialPosition === null ? (
            <div className="youtube-player-shell"><span className="youtube-player-status">Loading player…</span></div>
          ) : (
            <YouTubePlayer
              ref={playerRef}
              videoId={parsedUrl.videoId}
              playerHost={parsedUrl.playerHost}
              initialPositionSeconds={initialPosition}
              onTimeChange={handleTimeChange}
              onDurationChange={handleDurationChange}
              onPlayingChange={handlePlayingChange}
            />
          )}
          <p className="media-player-time" aria-live="off">
            {formatPlaybackTime(currentTime)}{duration > 0 && ` / ${formatPlaybackTime(duration)}`}
          </p>
          <p className="media-shortcuts">K or Space to pause · ←/→ 5 seconds · J/L 10 seconds</p>
          {description !== null && <p className="media-description">{description}</p>}
        </section>

        <section
          className="transcript-panel"
          aria-labelledby="transcript-heading"
          onWheel={() => setAutoFollow(false)}
          onTouchMove={() => setAutoFollow(false)}
        >
          <div className="transcript-heading-row">
            <div>
              <p className="reader-type">Transcript</p>
              <h2 id="transcript-heading">Follow along</h2>
            </div>
            {transcript !== null && !autoFollow && (
              <button type="button" className="transcript-follow" onClick={() => setAutoFollow(true)}>
                Follow playback
              </button>
            )}
          </div>

          {state.status === "loading" && <p className="transcript-notice">Loading transcript…</p>}
          {state.status === "degraded" && (
            <div className="transcript-notice" role="status">
              <p>Transcript unavailable.</p>
              <span>{state.message} The video player still works.</span>
            </div>
          )}
          {state.status === "ready" && transcript === null && (
            <div className="transcript-notice" role="status">
              <p>Transcript unavailable.</p>
              <span>You can still watch the video here.</span>
            </div>
          )}

          {transcript !== null && (
            <>
              {transcript.chapters.length > 0 && (
                <nav className="chapter-outline" aria-label="Video chapters">
                  <ol>
                    {transcript.chapters.map((chapter, index) => (
                      <li key={`${chapter.startSeconds}-${chapter.title}`}>
                        <button
                          type="button"
                          aria-current={index === activeChapterIndex ? "true" : undefined}
                          onClick={() => seekTo(chapter.startSeconds)}
                        >
                          <span>{chapter.title}</span>
                          <time>{formatPlaybackTime(chapter.startSeconds)}</time>
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
              <ol className="transcript-list">
                {transcript.segments.map((segment, index) => (
                  <li
                    key={`${segment.startSeconds}-${index}`}
                    ref={(element) => { segmentRefs.current[index] = element; }}
                    className={index === activeSegmentIndex ? "is-active" : undefined}
                    aria-current={index === activeSegmentIndex ? "true" : undefined}
                  >
                    <button
                      type="button"
                      className="transcript-timestamp"
                      aria-label={`Seek to ${formatPlaybackTime(segment.startSeconds)}`}
                      onClick={() => seekTo(segment.startSeconds)}
                    >
                      {formatPlaybackTime(segment.startSeconds)}
                    </button>
                    <p>{segment.text}</p>
                  </li>
                ))}
              </ol>
            </>
          )}

          {!activeVisible && activeSegmentIndex >= 0 && (
            <button type="button" className="transcript-current" onClick={returnToCurrentPosition}>
              Current position · {formatPlaybackTime(currentTime)}
            </button>
          )}
        </section>
      </div>
    </article>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && (target.isContentEditable || target.tagName === "BUTTON" || target.tagName === "A"));
}
