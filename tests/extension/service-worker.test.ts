import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const serviceWorkerScript = readFileSync(resolve(process.cwd(), "extension/service-worker.js"), "utf8");

describe("Readr extension service worker", () => {
  it("routes a capture to the most relevant Readr tab and forwards the save acknowledgement", async () => {
    const sentMessages: Array<{ tabId: number; message: Record<string, unknown> }> = [];
    const result = await runServiceWorker({
      sentMessages,
      readrTabs: [
        { id: 3, windowId: 9, lastAccessed: 100 },
        { id: 2, windowId: 7, lastAccessed: 50 },
      ],
      captureResult: { ok: true },
    });

    expect(result).toEqual({ ok: true });
    expect(sentMessages.at(-1)).toMatchObject({
      tabId: 2,
      message: { type: "readr-capture", captureId: "capture-1" },
    });
  });

  it("surfaces a failed Readr persistence acknowledgement", async () => {
    const result = await runServiceWorker({
      sentMessages: [],
      readrTabs: [{ id: 2, windowId: 7, lastAccessed: 50 }],
      captureResult: { ok: false, error: "Sign in to use Readr." },
    });

    expect(result).toEqual({ ok: false, error: "Sign in to use Readr." });
  });
});

type Tab = { id: number; windowId: number; lastAccessed: number; status?: string };
type ServiceWorkerOptions = {
  sentMessages: Array<{ tabId: number; message: Record<string, unknown> }>;
  readrTabs: Tab[];
  captureResult: { ok: boolean; error?: string };
};

async function runServiceWorker(options: ServiceWorkerOptions): Promise<unknown> {
  const listeners: RuntimeListener[] = [];
  const activeTab: Tab = { id: 1, windowId: 7, lastAccessed: 200 };
  const tabs = {
    query: async (query: Record<string, unknown>) => {
      if (query.active === true) return [activeTab];
      return options.readrTabs;
    },
    sendMessage: async (tabId: number, message: Record<string, unknown>) => {
      options.sentMessages.push({ tabId, message });
      if (tabId === activeTab.id) {
        return { ok: true, content: { kind: "youtube_capture" } };
      }
      if (message.type === "readr-ping") return { ok: true };
      return options.captureResult;
    },
    create: async () => ({ id: 2, windowId: activeTab.windowId, lastAccessed: 0, status: "complete" }),
    get: async () => ({ status: "complete" }),
    onUpdated: { addListener: () => undefined, removeListener: () => undefined },
  };
  const chrome = {
    runtime: { onMessage: { addListener: (listener: RuntimeListener) => listeners.push(listener) } },
    tabs,
  };
  vm.runInNewContext(serviceWorkerScript, {
    chrome,
    clearTimeout,
    console,
    crypto: { randomUUID: () => "capture-1" },
    Promise,
    setTimeout,
  });

  let result: unknown;
  listeners[0]({ type: "capture-active-youtube" }, {}, (value) => { result = value; });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  return result;
}

type RuntimeListener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | undefined;
