import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseItemUrl, type Item } from "../../shared/item";

const mediaApi = vi.hoisted(() => ({
  fetchYouTubeContent: vi.fn(),
}));
const extraction = vi.hoisted(() => ({
  extractYouTubeMetadata: vi.fn(),
  extractYouTubeTranscript: vi.fn(),
}));
const playerControls = vi.hoisted(() => ({
  onTimeChange: null as ((seconds: number) => void) | null,
}));

type PlayerProps = {
  onTimeChange: (seconds: number) => void;
};

vi.mock("../../src/itemApi", () => mediaApi);
vi.mock("../../src/notifications", () => ({ notify: vi.fn() }));
vi.mock("../../src/reader/extractYouTube", () => ({
  ...extraction,
  MediaExtractionError: class MediaExtractionError extends Error {},
}));
vi.mock("../../src/reader/useMediaProgress", () => ({
  useMediaProgress: () => ({
    initialPosition: 0,
    recordTime: vi.fn(),
    recordDuration: vi.fn(),
    recordPlaying: vi.fn(),
  }),
}));
vi.mock("../../src/reader/YouTubePlayer", () => ({
  YouTubePlayer: (props: PlayerProps) => {
    playerControls.onTimeChange = props.onTimeChange;
    return null;
  },
}));

import { YouTubeReader } from "../../src/reader/YouTubeReader";

let root: Root | null = null;
let activeRect = { top: 300, bottom: 360 };
let reducedMotion = false;

const item: Item = {
  id: "youtube-1",
  title: "A video",
  url: parseItemUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
  type: "video",
  status: "desk",
  addedAt: "2026-08-23T12:00:00.000Z",
  finishedAt: null,
  note: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  activeRect = { top: 300, bottom: 360 };
  reducedMotion = false;
  playerControls.onTimeChange = null;
  mediaApi.fetchYouTubeContent.mockResolvedValue(null);
  extraction.extractYouTubeMetadata.mockResolvedValue({
    kind: "youtube_metadata",
    videoId: "dQw4w9WgXcQ",
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "A video",
    author: null,
    thumbnailUrl: null,
  });
  extraction.extractYouTubeTranscript.mockResolvedValue({
    kind: "youtube_transcript",
    videoId: "dQw4w9WgXcQ",
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    description: null,
    transcript: {
      kind: "available",
      language: "en",
      chapters: [{ startSeconds: 0, title: "Opening" }],
      segments: [
        { startSeconds: 0, text: "First line." },
        { startSeconds: 10, text: "Second line." },
        { startSeconds: 20, text: "Third line." },
      ],
    },
  });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void) {}
    observe() { this.callback([{ isIntersecting: true }]); }
    disconnect() {}
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reducedMotion })));
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    if (this.classList.contains("transcript-panel")) return makeRect(0, 1_200);
    if (this.classList.contains("is-active")) return makeRect(activeRect.top, activeRect.bottom);
    return makeRect(0, 600, 1_180);
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });

  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("YouTubeReader transcript follow", () => {
  it("does not scroll while the active segment stays inside the safe zone", async () => {
    await renderReader();
    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scrollIntoView.mockClear();

    await advancePlayback(15);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls only enough to bring a segment below the safe zone back into view", async () => {
    activeRect = { top: 650, bottom: 710 };
    await renderReader();
    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scrollIntoView.mockClear();

    await advancePlayback(15);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("scrolls an active segment above the safe zone back into view", async () => {
    activeRect = { top: 40, bottom: 100 };
    await renderReader();
    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scrollIntoView.mockClear();

    await advancePlayback(15);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("disables follow after manual scrolling and restores it explicitly", async () => {
    activeRect = { top: 650, bottom: 710 };
    await renderReader();

    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scrollIntoView.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await Promise.resolve();
    });
    await advancePlayback(15);
    expect(scrollIntoView).not.toHaveBeenCalled();

    await act(async () => {
      document.querySelector<HTMLButtonElement>(".transcript-follow")?.click();
      await Promise.resolve();
    });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });

    scrollIntoView.mockClear();
    await advancePlayback(25);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("keeps follow enabled for non-scroll pointer interactions", async () => {
    await renderReader();
    const trigger = document.querySelector<HTMLButtonElement>(".chapter-outline-trigger");
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      trigger?.click();
      activeRect = { top: 650, bottom: 710 };
      await advancePlayback(15);
    });

    expect(document.querySelector(".transcript-follow")).toBeNull();
  });

  it("disables follow for keyboard scrolling", async () => {
    activeRect = { top: 650, bottom: 710 };
    await renderReader();
    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scrollIntoView.mockClear();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
      await Promise.resolve();
    });
    await advancePlayback(15);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.querySelector(".transcript-follow")).not.toBeNull();
  });

  it("uses non-animated scrolling when reduced motion is preferred", async () => {
    reducedMotion = true;
    await renderReader();
    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    activeRect = { top: 650, bottom: 710 };

    await advancePlayback(15);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
  });
});

async function renderReader(): Promise<void> {
  await act(async () => {
    root?.render(createElement(YouTubeReader, { item }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(document.querySelector(".transcript-list")).not.toBeNull();
}

async function advancePlayback(seconds: number): Promise<void> {
  await act(async () => {
    playerControls.onTimeChange?.(seconds);
    await Promise.resolve();
  });
}

function makeRect(top: number, bottom: number, width = 0): DOMRect {
  return {
    top,
    bottom,
    width,
    height: bottom - top,
    left: 0,
    right: width,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}
