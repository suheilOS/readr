import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const bridgeScript = readFileSync(resolve(process.cwd(), "extension/readr-bridge.js"), "utf8");

describe("Readr extension bridge", () => {
  it("waits for the app acknowledgement before replying to the extension", () => {
    const dom = new JSDOM("<html></html>", { runScripts: "outside-only", url: "https://readr.test/" });
    const runtimeListeners: RuntimeListener[] = [];
    const posts: unknown[] = [];
    Object.defineProperty(dom.window, "chrome", {
      value: { runtime: { onMessage: { addListener: (listener: RuntimeListener) => runtimeListeners.push(listener) } } },
    });
    Object.defineProperty(dom.window, "postMessage", {
      value: (message: unknown) => posts.push(message),
    });
    dom.window.eval(bridgeScript);

    const response = vi.fn();
    runtimeListeners[0]({ type: "readr-capture", captureId: "capture-1", content: { kind: "youtube_capture" } }, {}, response);
    expect(response).not.toHaveBeenCalled();

    dispatchWindowMessage(dom, { type: "readr:capture-ready" });
    expect(posts).toEqual([{
      type: "readr:youtube-capture",
      captureId: "capture-1",
      content: { kind: "youtube_capture" },
    }]);
    expect(response).not.toHaveBeenCalled();

    dispatchWindowMessage(dom, { type: "readr:capture-result", captureId: "capture-1", ok: true });
    expect(response).toHaveBeenCalledWith({ ok: true });
  });

  it("returns the Readr save failure to the extension", () => {
    const dom = new JSDOM("<html></html>", { runScripts: "outside-only", url: "https://readr.test/" });
    const runtimeListeners: RuntimeListener[] = [];
    Object.defineProperty(dom.window, "chrome", {
      value: { runtime: { onMessage: { addListener: (listener: RuntimeListener) => runtimeListeners.push(listener) } } },
    });
    Object.defineProperty(dom.window, "postMessage", { value: () => undefined });
    dom.window.eval(bridgeScript);

    const response = vi.fn();
    runtimeListeners[0]({ type: "readr-capture", captureId: "capture-2", content: {} }, {}, response);
    dispatchWindowMessage(dom, { type: "readr:capture-ready" });
    dispatchWindowMessage(dom, {
      type: "readr:capture-result",
      captureId: "capture-2",
      ok: false,
      error: "Sign in to use Readr.",
    });

    expect(response).toHaveBeenCalledWith({ ok: false, error: "Sign in to use Readr." });
  });
});

type RuntimeListener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | undefined;

function dispatchWindowMessage(dom: JSDOM, data: unknown): void {
  dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
    data,
    origin: dom.window.location.origin,
    source: dom.window,
  }));
}
