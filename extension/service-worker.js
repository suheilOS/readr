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

  const readrTab = await findOrOpenReadrTab();
  await chrome.tabs.sendMessage(readrTab.id, { type: "readr-capture", content: captured.content });
}

async function findOrOpenReadrTab() {
  const [existing] = await chrome.tabs.query({ url: READR_PATTERNS });
  if (existing?.id !== undefined) {
    await waitForBridge(existing.id);
    return existing;
  }

  const created = await chrome.tabs.create({ url: READR_HOME });
  if (created.id === undefined) throw new Error("Readr could not be opened.");
  await waitForTabLoad(created.id);
  await waitForBridge(created.id);
  return created;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      reject(new Error("Readr took too long to open."));
    }, 10_000);
    function handleUpdate(updatedId, changeInfo) {
      if (updatedId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(handleUpdate);
  });
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
