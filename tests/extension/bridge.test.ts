import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

const bridgeScript = readFileSync(resolve(process.cwd(), "extension/readr-bridge.js"), "utf8");

describe("Readr extension bridge", () => {
  it("routes URL capture through the app and returns its public result", () => {
    const { dom, runtimeListeners, posts } = loadBridge();
    const response = vi.fn();

    runtimeListeners[0]({ type: "readr-capture-url", captureId: "capture-1", url: "https://example.com/article" }, {}, response);
    expect(response).not.toHaveBeenCalled();
    dispatchWindowMessage(dom, { type: "readr:capture-ready" });
    expect(posts).toEqual([{
      type: "readr:capture-url",
      captureId: "capture-1",
      url: "https://example.com/article",
    }]);

    dispatchWindowMessage(dom, {
      type: "readr:capture-result",
      resultType: "readr:capture-url",
      captureId: "capture-1",
      ok: true,
      result: { created: false, item: { id: "item-1", title: "A title", status: "desk" } },
    });
    expect(response).toHaveBeenCalledWith({
      ok: true,
      result: { created: false, item: { id: "item-1", title: "A title", status: "desk" } },
    });
  });

  it("routes item-targeted YouTube media without exposing unrelated item data", () => {
    const { dom, runtimeListeners, posts } = loadBridge();
    const response = vi.fn();
    const content = { kind: "youtube_capture", videoId: "dQw4w9WgXcQ" };

    runtimeListeners[0]({
      type: "readr-attach-youtube-media",
      captureId: "capture-2",
      itemId: "item-1",
      content,
    }, {}, response);
    dispatchWindowMessage(dom, { type: "readr:capture-ready" });
    expect(posts.at(-1)).toEqual({
      type: "readr:youtube-media",
      captureId: "capture-2",
      itemId: "item-1",
      content,
    });

    dispatchWindowMessage(dom, {
      type: "readr:capture-result",
      resultType: "readr:youtube-media",
      captureId: "capture-2",
      ok: true,
    });
    expect(response).toHaveBeenCalledWith({ ok: true });
  });

  it("rejects a concurrent request without interrupting the active request", () => {
    const { dom, runtimeListeners, posts } = loadBridge();
    const activeResponse = vi.fn();
    const busyResponse = vi.fn();

    runtimeListeners[0]({ type: "readr-capture-url", captureId: "capture-active", url: "https://example.com/active" }, {}, activeResponse);
    dispatchWindowMessage(dom, { type: "readr:capture-ready" });
    runtimeListeners[0]({ type: "readr-capture-url", captureId: "capture-busy", url: "https://example.com/busy" }, {}, busyResponse);

    expect(busyResponse).toHaveBeenCalledWith({
      ok: false,
      error: "A Readr request is already in progress.",
      code: "busy",
    });
    expect(activeResponse).not.toHaveBeenCalled();
    expect(posts).toEqual([{
      type: "readr:capture-url",
      captureId: "capture-active",
      url: "https://example.com/active",
    }]);

    dispatchWindowMessage(dom, {
      type: "readr:capture-result",
      resultType: "readr:capture-url",
      captureId: "capture-active",
      ok: true,
    });
    expect(activeResponse).toHaveBeenCalledWith({ ok: true, result: undefined });
  });

  it("rejects malformed runtime and cross-window messages", () => {
    const { dom, runtimeListeners, posts } = loadBridge();
    const response = vi.fn();

    expect(runtimeListeners[0]({ type: "readr-capture-url", captureId: "bad", url: "file:///tmp/a" }, {}, response)).toBe(false);
    dispatchWindowMessage(dom, { type: "readr:capture-result", resultType: "readr:capture-url", captureId: "bad", ok: true }, "https://evil.test");
    expect(response).not.toHaveBeenCalled();
    expect(posts).toHaveLength(0);
  });

  it("returns app failures to the service worker", () => {
    const { dom, runtimeListeners } = loadBridge();
    const response = vi.fn();
    runtimeListeners[0]({ type: "readr-capture-url", captureId: "capture-3", url: "https://example.com" }, {}, response);
    dispatchWindowMessage(dom, { type: "readr:capture-ready" });
    dispatchWindowMessage(dom, {
      type: "readr:capture-result",
      resultType: "readr:capture-url",
      captureId: "capture-3",
      ok: false,
      error: "Sign in to use Readr.",
      code: "unauthorized",
    });
    expect(response).toHaveBeenCalledWith({
      ok: false,
      error: "Sign in to use Readr.",
      code: "unauthorized",
    });
  });
});

type RuntimeListener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | undefined;

function loadBridge() {
  const dom = new JSDOM("<html></html>", { runScripts: "outside-only", url: "https://readr.test/" });
  const runtimeListeners: RuntimeListener[] = [];
  const posts: unknown[] = [];
  Object.defineProperty(dom.window, "chrome", {
    value: { runtime: { onMessage: { addListener: (listener: RuntimeListener) => runtimeListeners.push(listener) } } },
  });
  Object.defineProperty(dom.window, "postMessage", { value: (message: unknown) => posts.push(message) });
  dom.window.eval(bridgeScript);
  return { dom, runtimeListeners, posts };
}

function dispatchWindowMessage(dom: JSDOM, data: unknown, origin = "https://readr.test"): void {
  dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
    data,
    origin,
    source: dom.window,
  }));
}
