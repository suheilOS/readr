const API_SCRIPT_URL = "https://www.youtube.com/iframe_api";
const API_LOAD_TIMEOUT_MS = 10_000;
let apiPromise: Promise<YouTubeApi> | null = null;

export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player !== undefined) return Promise.resolve(window.YT);
  if (apiPromise !== null) return apiPromise;

  apiPromise = createApiPromise().catch((error: unknown) => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

function createApiPromise(): Promise<YouTubeApi> {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${API_SCRIPT_URL}"]`);
    const script = existingScript ?? document.createElement("script");
    const previousCallback = window.onYouTubeIframeAPIReady;
    let settled = false;

    function cleanup(): void {
      window.clearTimeout(timeout);
      script.removeEventListener("error", handleError);
      script.removeEventListener("load", handleLoad);
      if (window.onYouTubeIframeAPIReady === handleReady) {
        window.onYouTubeIframeAPIReady = previousCallback;
      }
    }

    function finish(): void {
      if (settled || window.YT?.Player === undefined) return;
      settled = true;
      cleanup();
      resolve(window.YT);
    }

    function fail(message: string): void {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      reject(new Error(message));
    }

    function handleReady(): void {
      finish();
      previousCallback?.();
    }

    function handleLoad(): void {
      finish();
    }

    function handleError(): void {
      fail("YouTube player API failed to load");
    }

    const timeout = window.setTimeout(
      () => fail("YouTube player API timed out"),
      API_LOAD_TIMEOUT_MS,
    );
    window.onYouTubeIframeAPIReady = handleReady;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (existingScript === null) {
      script.src = API_SCRIPT_URL;
      script.async = true;
      document.head.append(script);
    }

    finish();
  });
}

export type YouTubeApi = {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayerInstance;
};

export type YouTubePlayerOptions = {
  host: string;
  videoId: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady: (event: YouTubePlayerEvent) => void;
    onStateChange: (event: YouTubeStateEvent) => void;
    onError: () => void;
  };
};

export type YouTubePlayerInstance = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YouTubePlayerEvent = { target: YouTubePlayerInstance };
type YouTubeStateEvent = YouTubePlayerEvent & { data: number };

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
