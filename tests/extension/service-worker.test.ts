import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const serviceWorkerScript = readFileSync(resolve(process.cwd(), "extension/service-worker.js"), "utf8");

const videoId = "dQw4w9WgXcQ";
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const mediaContent = {
  kind: "youtube_capture",
  videoId,
  sourceUrl: videoUrl,
  title: "Video title",
  author: "Channel",
  description: null,
  thumbnailUrl: null,
  transcript: { kind: "unavailable" },
};

describe("Readr extension service worker", () => {
  it("captures a normal HTTPS tab without sending a browser title", async () => {
    const result = await runServiceWorker({
      activeTab: { id: 1, windowId: 7, url: "https://example.com/article", lastAccessed: 200 },
      readrTabs: [{ id: 2, windowId: 7, lastAccessed: 50 }],
      captureResponse: captureResponse("inbox", true),
    });

    expect(result.notifications).toContainEqual(expect.objectContaining({ message: "Saved to Inbox" }));
    expect(result.messages).toContainEqual({
      tabId: 2,
      message: {
        type: "readr-capture-url",
        captureId: "capture-1",
        url: "https://example.com/article",
      },
    });
    expect(result.messages.at(-1)?.message).not.toHaveProperty("title");
  });

  it("rejects unsupported schemes and the Readr application", async () => {
    const unsupported = await runServiceWorker({
      activeTab: { id: 1, windowId: 7, url: "chrome://settings", lastAccessed: 1 },
      readrTabs: [],
      captureResponse: captureResponse("inbox", true),
    });
    expect(unsupported.notifications).toContainEqual(expect.objectContaining({ message: "This page type is not supported." }));
    expect(unsupported.messages.filter(({ message }) => message.type === "readr-capture-url")).toHaveLength(0);

    const readr = await runServiceWorker({
      activeTab: { id: 1, windowId: 7, url: "https://readr.overhawl.app/", lastAccessed: 1 },
      readrTabs: [],
      captureResponse: captureResponse("inbox", true),
    });
    expect(readr.notifications).toContainEqual(expect.objectContaining({ message: "Readr pages cannot be captured." }));
  });

  it("reuses an existing Readr tab without activating or navigating it", async () => {
    const result = await runServiceWorker({
      activeTab: { id: 1, windowId: 7, url: "https://example.com", lastAccessed: 1 },
      readrTabs: [{ id: 2, windowId: 7, lastAccessed: 50 }],
      captureResponse: captureResponse("library", false),
    });

    expect(result.notifications).toContainEqual(expect.objectContaining({ message: "Already on your Library" }));
    expect(result.created).toBe(false);
    expect(result.updated).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it("uses a background Readr tab and closes it after capture", async () => {
    const result = await runServiceWorker({
      activeTab: { id: 1, windowId: 7, url: "https://example.com", lastAccessed: 1 },
      readrTabs: [],
      captureResponse: captureResponse("inbox", true),
    });

    expect(result.created).toBe(true);
    expect(result.removed).toEqual([2]);
    expect(result.createdOptions).toMatchObject({ active: false, windowId: 7 });
  });

  it("closes a temporary Readr tab after a non-authenticated failure", async () => {
    const result = await runServiceWorker({
      activeTab: { id: 1, windowId: 7, url: "https://example.com", lastAccessed: 1 },
      readrTabs: [],
      captureResponse: { ok: false, error: "Readr is unavailable.", code: "readr_unavailable" },
    });

    expect(result.created).toBe(true);
    expect(result.removed).toEqual([2]);
  });

  it("persists the YouTube URL before asking the live page for media", async () => {
    const result = await runServiceWorker({
      activeTab: { id: 1, windowId: 7, url: videoUrl, lastAccessed: 1 },
      readrTabs: [{ id: 2, windowId: 7, lastAccessed: 50 }],
      captureResponse: captureResponse("desk", false),
      mediaContent,
    });

    const meaningful = result.messages
      .filter(({ message }) => message.type !== "readr-ping")
      .map(({ message }) => message.type);
    expect(meaningful).toEqual([
      "readr-capture-url",
      "capture-youtube-media",
      "readr-attach-youtube-media",
    ]);
    expect(result.injections).toEqual([{ tabId: 1, files: ["youtube-capture.js"] }]);
    expect(result.notifications).toContainEqual(expect.objectContaining({ message: "Already on your Desk" }));
  });

  it("makes authentication recovery actionable", async () => {
    const result = await runServiceWorker({
      activeTab: { id: 1, windowId: 7, url: "https://example.com", lastAccessed: 1 },
      readrTabs: [{ id: 2, windowId: 7, lastAccessed: 50 }],
      captureResponse: { ok: false, error: "Sign in to use Readr.", code: "unauthorized" },
    });

    expect(result.notifications).toContainEqual(expect.objectContaining({ message: "Sign in to Readr to save this page." }));
    expect(result.updated).toEqual([2]);
    expect(result.focused).toEqual([7]);
  });

  it("clears badge state after a success or failure", async () => {
    const success = await runServiceWorker({
      activeTab: { id: 1, windowId: 7, url: "https://example.com", lastAccessed: 1 },
      readrTabs: [{ id: 2, windowId: 7, lastAccessed: 50 }],
      captureResponse: captureResponse("inbox", true),
      waitForBadge: true,
    });
    expect(success.badges.map(({ text }) => text)).toEqual(expect.arrayContaining(["…", "✓", ""]));

    const failure = await runServiceWorker({
      activeTab: { id: 1, windowId: 7, url: "https://example.com", lastAccessed: 1 },
      readrTabs: [{ id: 2, windowId: 7, lastAccessed: 50 }],
      captureResponse: { ok: false, error: "No service", code: "readr_unavailable" },
      waitForBadge: true,
    });
    expect(failure.badges.map(({ text }) => text)).toEqual(expect.arrayContaining(["!", ""]));
  }, 10_000);
});

type Tab = { id: number; windowId: number; lastAccessed: number; url?: string; status?: string };
type Options = {
  activeTab: Tab;
  readrTabs: Tab[];
  captureResponse: Record<string, unknown>;
  mediaContent?: Record<string, unknown>;
  waitForBadge?: boolean;
};
type Result = {
  messages: Array<{ tabId: number; message: Record<string, unknown> }>;
  notifications: Array<Record<string, unknown>>;
  badges: Array<{ tabId: number; text: string }>;
  updated: number[];
  focused: number[];
  removed: number[];
  created: boolean;
  createdOptions?: Record<string, unknown>;
  injections: Array<{ tabId: number; files: string[] }>;
};

async function runServiceWorker(options: Options): Promise<Result> {
  const actionListeners: Array<(tab: Tab) => void> = [];
  const messages: Result["messages"] = [];
  const notifications: Result["notifications"] = [];
  const badges: Result["badges"] = [];
  const injections: Result["injections"] = [];
  const updated: number[] = [];
  const focused: number[] = [];
  const removed: number[] = [];
  let createdOptions: Record<string, unknown> | undefined;
  let created = false;

  const createdTab: Tab = { id: 2, windowId: options.activeTab.windowId, lastAccessed: 0, status: "complete" };
  const tabs = {
    query: async (query: Record<string, unknown>) => query.active === true ? [options.activeTab] : options.readrTabs,
    sendMessage: async (tabId: number, message: Record<string, unknown>) => {
      messages.push({ tabId, message });
      if (tabId === options.activeTab.id && message.type === "capture-youtube-media") {
        return { ok: true, content: options.mediaContent ?? mediaContent };
      }
      if (message.type === "readr-ping") return { ok: true };
      if (message.type === "readr-capture-url") return options.captureResponse;
      if (message.type === "readr-attach-youtube-media") return { ok: true };
      return { ok: false, error: "Unexpected message", code: "test_error" };
    },
    create: async (createOptions: Record<string, unknown>) => {
      created = true;
      createdOptions = createOptions;
      return createdTab;
    },
    get: async (tabId: number) => tabId === options.activeTab.id ? options.activeTab : createdTab,
    update: async (tabId: number) => { updated.push(tabId); return {}; },
    remove: async (tabId: number) => { removed.push(tabId); return {}; },
    onUpdated: { addListener: () => undefined, removeListener: () => undefined },
  };
  const chrome = {
    action: {
      onClicked: { addListener: (listener: (tab: Tab) => void) => actionListeners.push(listener) },
      setBadgeText: ({ tabId, text }: { tabId: number; text: string }) => { badges.push({ tabId, text }); return Promise.resolve(); },
      setBadgeBackgroundColor: () => Promise.resolve(),
    },
    notifications: {
      create: (_id: string, notification: Record<string, unknown>) => { notifications.push(notification); return Promise.resolve(); },
    },
    tabs,
    scripting: {
      executeScript: async ({ target, files }: { target: { tabId: number }; files: string[] }) => {
        injections.push({ tabId: target.tabId, files });
        return [];
      },
    },
    windows: {
      update: async (windowId: number) => { focused.push(windowId); return {}; },
    },
  };

  vm.runInNewContext(serviceWorkerScript, {
    chrome,
    clearTimeout,
    console,
    crypto: { randomUUID: () => "capture-1" },
    Promise,
    setTimeout,
    TextEncoder,
    URL,
  });
  actionListeners[0](options.activeTab);
  await vi.waitFor(() => expect(notifications.length).toBeGreaterThan(0), { timeout: 1_000 });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, options.waitForBadge ? 3_050 : 5));
  return { messages, notifications, badges, updated, focused, removed, created, createdOptions, injections };
}

function captureResponse(status: string, created: boolean): Record<string, unknown> {
  return {
    ok: true,
    result: { created, item: { id: "item-1", title: "A title", status } },
  };
}
