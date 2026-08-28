"use strict";

const READR_PATTERNS = [
  "https://readr.overhawl.app/*",
  "http://localhost:5173/*",
  "http://localhost:8787/*",
];
const READR_HOME = "https://readr.overhawl.app/";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isCaptureCommand(message)) return false;

  void captureFromActiveYouTubeTab()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "The video could not be captured.",
    }));
  return true;
});

async function captureFromActiveYouTubeTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id === undefined) throw new Error("Select a YouTube video tab first.");

  const captured = await chrome.tabs.sendMessage(activeTab.id, { type: "capture-youtube" });
  if (!captured?.ok || captured.content === undefined) {
    throw new Error(captured?.error || "The YouTube page could not be captured.");
  }

  const readrTab = await findOrOpenReadrTab(activeTab.windowId);
  const result = await chrome.tabs.sendMessage(readrTab.id, {
    type: "readr-capture",
    captureId: crypto.randomUUID(),
    content: captured.content,
  });
  if (!result?.ok) {
    throw new Error(result?.error || "Readr could not save the video.");
  }
}

async function findOrOpenReadrTab(sourceWindowId) {
  const tabs = await chrome.tabs.query({ url: READR_PATTERNS });
  const [existing] = tabs
    .filter((tab) => tab.id !== undefined)
    .sort((left, right) => compareReadrTabs(left, right, sourceWindowId));
  if (existing?.id !== undefined) {
    await waitForBridge(existing.id);
    return existing;
  }

  const created = await chrome.tabs.create({ url: READR_HOME, windowId: sourceWindowId });
  if (created.id === undefined) throw new Error("Readr could not be opened.");
  await waitForTabLoad(created.id);
  await waitForBridge(created.id);
  return created;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      reject(new Error("Readr took too long to open."));
    }, 10_000);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      resolve();
    };
    function handleUpdate(updatedId, changeInfo) {
      if (updatedId !== tabId || changeInfo.status !== "complete") return;
      finish();
    }
    chrome.tabs.onUpdated.addListener(handleUpdate);
    void chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish();
    }).catch(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      reject(new Error("Readr could not be opened."));
    });
  });
}

function compareReadrTabs(left, right, sourceWindowId) {
  const leftSameWindow = left.windowId === sourceWindowId ? 1 : 0;
  const rightSameWindow = right.windowId === sourceWindowId ? 1 : 0;
  if (leftSameWindow !== rightSameWindow) return rightSameWindow - leftSameWindow;

  const leftAccessed = typeof left.lastAccessed === "number" ? left.lastAccessed : 0;
  const rightAccessed = typeof right.lastAccessed === "number" ? right.lastAccessed : 0;
  return rightAccessed - leftAccessed;
}

async function waitForBridge(tabId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "readr-ping" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("The Readr capture bridge is not available.");
}

function isCaptureCommand(value) {
  return value !== null && typeof value === "object" && value.type === "capture-active-youtube";
}
