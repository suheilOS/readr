import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  youtubePlayerOrigin,
  type YouTubePlayerHost,
  type YouTubeVideoId,
} from "../../shared/media";
import {
  loadYouTubeApi,
  type YouTubePlayerInstance,
} from "./youtubeIframeApi";
import { playingStateForYouTubePlayerState } from "./youtubePlayerState";

export type YouTubePlayerHandle = {
  pause: () => void;
  play: () => void;
  seekBy: (seconds: number) => void;
  seekTo: (seconds: number) => void;
};

type YouTubePlayerProps = {
  videoId: YouTubeVideoId;
  playerHost: YouTubePlayerHost;
  initialPositionSeconds?: number;
  onDurationChange: (seconds: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onTimeChange: (seconds: number) => void;
};

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({
    videoId,
    playerHost,
    initialPositionSeconds = 0,
    onDurationChange,
    onPlayingChange,
    onTimeChange,
  }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YouTubePlayerInstance | null>(null);
    const [state, setState] = useState<"loading" | "ready" | "error">("loading");

    useImperativeHandle(ref, () => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seekTo: (seconds) => {
        playerRef.current?.seekTo(Math.max(0, seconds), true);
        onTimeChange(Math.max(0, seconds));
      },
      seekBy: (seconds) => {
        const player = playerRef.current;
        if (player === null) return;
        const nextTime = Math.max(0, player.getCurrentTime() + seconds);
        player.seekTo(nextTime, true);
        onTimeChange(nextTime);
      },
    }), [onTimeChange]);

    useEffect(() => {
      let disposed = false;
      let lastDuration = 0;
      let timer: number | null = null;

      function publishDuration(player: YouTubePlayerInstance): void {
        const duration = player.getDuration();
        if (!Number.isFinite(duration) || duration <= 0 || duration === lastDuration) return;
        lastDuration = duration;
        onDurationChange(duration);
      }

      void loadYouTubeApi().then((api) => {
        if (disposed || hostRef.current === null) return;
        playerRef.current = new api.Player(hostRef.current, {
          host: youtubePlayerOrigin(playerHost),
          videoId,
          playerVars: {
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
            start: Math.floor(initialPositionSeconds),
          },
          events: {
            onReady: ({ target }) => {
              if (disposed) return;
              setState("ready");
              publishDuration(target);
              onTimeChange(target.getCurrentTime());
            },
            onStateChange: ({ data, target }) => {
              if (disposed) return;
              const playing = playingStateForYouTubePlayerState(data);
              if (playing !== null) onPlayingChange(playing);
              publishDuration(target);
              onTimeChange(target.getCurrentTime());
              if (playing === true) {
                if (timer !== null) window.clearInterval(timer);
                timer = window.setInterval(() => {
                  publishDuration(target);
                  onTimeChange(target.getCurrentTime());
                }, 350);
              } else if (playing === false && timer !== null) {
                window.clearInterval(timer);
                timer = null;
              }
            },
            onError: () => {
              setState("error");
              onPlayingChange(false);
            },
          },
        });
      }).catch(() => setState("error"));

      return () => {
        disposed = true;
        if (timer !== null) window.clearInterval(timer);
        playerRef.current?.destroy();
        playerRef.current = null;
      };
    }, [initialPositionSeconds, onDurationChange, onPlayingChange, onTimeChange, playerHost, videoId]);

    return (
      <div className="youtube-player-shell" data-state={state}>
        <div ref={hostRef} className="youtube-player-host" />
        {state === "loading" && <span className="youtube-player-status">Loading player…</span>}
        {state === "error" && (
          <span className="youtube-player-status" role="alert">The embedded player is unavailable.</span>
        )}
      </div>
    );
  },
);
