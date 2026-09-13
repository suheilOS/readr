import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaTranscriptSplit } from "../../src/reader/MediaTranscriptSplit";

let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 1180,
    height: 600,
    top: 0,
    right: 1180,
    bottom: 600,
    left: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
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

describe("MediaTranscriptSplit", () => {
  it("starts at the maximum player size and supports keyboard resize and reset", async () => {
    await act(async () => {
      root?.render(createElement(MediaTranscriptSplit, {
        playerPaneId: "player-pane",
        transcriptPaneId: "transcript-pane",
        player: createElement("section", { id: "player-pane" }, "Player"),
        transcript: createElement("section", { id: "transcript-pane" }, "Transcript"),
      }));
    });

    const separator = document.querySelector<HTMLElement>("[role='separator']");
    expect(separator).not.toBeNull();
    expect(separator?.getAttribute("aria-controls")).toBe("player-pane transcript-pane");
    expect(separator?.getAttribute("aria-valuemin")).toBe("31");
    expect(separator?.getAttribute("aria-valuemax")).toBe("62");
    expect(separator?.getAttribute("aria-valuenow")).toBe("62");

    await act(async () => {
      separator?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(separator?.getAttribute("aria-valuenow")).toBe("61");

    await act(async () => {
      separator?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(separator?.getAttribute("aria-valuenow")).toBe("62");

    await act(async () => {
      separator?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(separator?.getAttribute("aria-valuenow")).toBe("62");
  });
});
