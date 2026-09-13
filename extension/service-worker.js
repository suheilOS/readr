"use strict";

const READR_PATTERNS = [
  "https://readr.overhawl.app/*",
  "http://localhost:5173/*",
  "http://localhost:8787/*",
];
const READR_ORIGINS = new Set([
  "https://readr.overhawl.app",
  "http://localhost:5173",
  "http://localhost:8787",
]);
const READR_HOME = "https://readr.overhawl.app/";
const TAB_MESSAGE_TIMEOUT_MS = 30_000;
const BRIDGE_TIMEOUT_MS = 12_000;
const YOUTUBE_PAYLOAD_BYTES = 512 * 1024;
const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtube-nocookie.com", "www.youtube-nocookie.com",
]);
const YOUTUBE_VIDEO_PATHS = new Set(["shorts", "embed", "live"]);
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const activeCaptures = new Set();
const badgeTimers = new Map();

chrome.action.onClicked.addListener((clickedTab) => {
  void runCapture(clickedTab);
});

async function runCapture(clickedTab) {
  const initialTabId = clickedTab?.id;
  if (initialTabId !== undefined && activeCaptures.has(initialTabId)) {
    showNotification("A save is already in progress.", "info");
    return;
  }
  if (initialTabId !== undefined) {
    activeCaptures.add(initialTabId);
    setBadge(initialTabId, "…", "busy");
  }

  let sourceTabId = initialTabId;
  let readrTab = null;
  let retainReadrTab = false;
  try {
    const [queriedActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sourceTab = clickedTab?.id === undefined
      ? queriedActiveTab
      : queriedActiveTab?.id === clickedTab.id
        ? { ...queriedActiveTab, url: queriedActiveTab.url ?? clickedTab.url }
        : clickedTab;
    if (sourceTab?.id === undefined) throw captureError("Select a page to save.", "no_active_tab");
    sourceTabId = sourceTab.id;
    if (!activeCaptures.has(sourceTabId)) activeCaptures.add(sourceTabId);
    setBadge(sourceTabId, "…", "busy");

    const sourceUrl = validateCaptureUrl(sourceTab.url);
    const youtubeVideoId = readYouTubeVideoId(sourceUrl);

    readrTab = await findOrOpenReadrTab(sourceTab.windowId);
    const captureId = crypto.randomUUID();
    const saved = await sendTabMessage(readrTab.tab.id, {
      type: "readr-capture-url",
      captureId,
      url: sourceUrl,
    }, TAB_MESSAGE_TIMEOUT_MS);
    const captureResult = readCaptureResponse(saved);

    setBadge(sourceTabId, "✓", "success");
    showCaptureNotification(captureResult);

    if (youtubeVideoId !== null) {
      await enrichYouTubeBestEffort({
        sourceTabId,
        readrTab: readrTab.tab,
        captureId,
        expectedVideoId: youtubeVideoId,
        itemId: captureResult.item.id,
      });
    }
  } catch (error) {
    const failure = normalizeError(error);
    if (failure.code === "unauthorized" || failure.code === "auth_required") {
      retainReadrTab = true;
      if (readrTab !== null) await focusTab(readrTab.tab.id);
      showNotification("Sign in to Readr to save this page.", "auth");
    } else {
      showNotification(failure.message, "error");
    }
    if (sourceTabId !== undefined) setBadge(sourceTabId, "!", "failure");
  } finally {
    if (readrTab?.temporary && !retainReadrTab) {
      await closeTab(readrTab.tab.id);
    }
    if (sourceTabId !== undefined) {
      activeCaptures.delete(sourceTabId);
      scheduleBadgeClear(sourceTabId, 3_000);
    }
  }
}

async function enrichYouTubeBestEffort({ sourceTabId, readrTab, captureId, expectedVideoId, itemId }) {
  try {
    await assertCurrentYouTubeTab(sourceTabId, expectedVideoId);
    const captured = await sendTabMessage(sourceTabId, {
      type: "capture-youtube-media",
      expectedVideoId,
    }, TAB_MESSAGE_TIMEOUT_MS);
    if (!isValidYouTubeContent(captured?.content, expectedVideoId)) {
      throw captureError("The YouTube media data was invalid.", "invalid_media");
    }

    // Check the page after extraction as well as before saving. This is the
    // storage boundary: a stale result can never be attached to another video.
    await assertCurrentYouTubeTab(sourceTabId, expectedVideoId);
    const attached = await sendTabMessage(readrTab.id, {
      type: "readr-attach-youtube-media",
      captureId,
      itemId,
      content: captured.content,
    }, TAB_MESSAGE_TIMEOUT_MS);
    if (attached?.ok !== true) {
      throw captureError(attached?.error || "The YouTube media could not be attached.", attached?.code || "media_attach_failed");
    }
  } catch (error) {
    // URL persistence already succeeded. Transcript/media enrichment is
    // intentionally best-effort and must not turn the capture into a failure.
    console.warn(JSON.stringify({
      message: "YouTube enrichment skipped after successful URL capture",
      itemId,
      error: normalizeError(error).message,
    }));
  }
}

function validateCaptureUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw captureError("This page cannot be saved.", "unsupported_url");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw captureError("This page cannot be saved.", "unsupported_url");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 || url.password.length > 0) {
    throw captureError("This page type is not supported.", "unsupported_url");
  }
  if (url.toString().length > 2_048) {
    throw captureError("That page URL is too long.", "unsupported_url");
  }
  if (isReadrUrl(url)) {
    throw captureError("Readr pages cannot be captured.", "readr_url");
  }
  return url.toString();
}

function isReadrUrl(value) {
  return value instanceof URL && READR_ORIGINS.has(value.origin);
}

async function findOrOpenReadrTab(sourceWindowId) {
  const tabs = await chrome.tabs.query({ url: READR_PATTERNS });
  const [existing] = tabs
    .filter((tab) => tab.id !== undefined)
    .sort((left, right) => compareReadrTabs(left, right, sourceWindowId));
  if (existing?.id !== undefined) {
    await waitForBridge(existing.id);
    return { tab: existing, temporary: false };
  }

  const options = {
    url: READR_HOME,
    active: false,
    ...(sourceWindowId === undefined ? {} : { windowId: sourceWindowId }),
  };
  const created = await chrome.tabs.create(options);
  if (created.id === undefined) throw captureError("Readr could not be opened.", "readr_unavailable");
  try {
    await waitForTabLoad(created.id);
    await waitForBridge(created.id);
  } catch (error) {
    await closeTab(created.id);
    throw error;
  }
  return { tab: created, temporary: true };
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
  const startedAt = Date.now();
  while (Date.now() - startedAt < BRIDGE_TIMEOUT_MS) {
    try {
      await sendTabMessage(tabId, { type: "readr-ping" }, 2_000);
      return;
    } catch {
      await delay(200);
    }
  }
  throw captureError("The Readr capture bridge is not available.", "readr_unavailable");
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("Readr took too long to open.")), 15_000);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      if (error) reject(captureError("Readr could not be opened.", "readr_unavailable"));
      else resolve();
    };
    function handleUpdate(updatedId, changeInfo) {
      if (updatedId === tabId && changeInfo.status === "complete") finish();
    }
    chrome.tabs.onUpdated.addListener(handleUpdate);
    void chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish();
    }).catch(() => finish(new Error("Readr could not be opened.")));
  });
}

function sendTabMessage(tabId, message, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(captureError("The Readr bridge timed out.", "bridge_timeout"));
    }, timeoutMs);
    Promise.resolve()
      .then(() => chrome.tabs.sendMessage(tabId, message))
      .then(
        (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      );
  });
}

async function assertCurrentYouTubeTab(tabId, expectedVideoId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    throw captureError("The source tab is no longer available.", "tab_unavailable");
  }
  if (readYouTubeVideoId(tab.url) !== expectedVideoId) {
    throw captureError("The YouTube page changed videos during capture.", "stale_video");
  }
}

function readYouTubeVideoId(value) {
  if (typeof value !== "string") return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  let candidate = null;
  if (hostname === "youtu.be" || hostname === "www.youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(hostname)) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 1 && parts[0] === "watch") candidate = url.searchParams.get("v");
    else if (YOUTUBE_VIDEO_PATHS.has(parts[0] ?? "")) candidate = parts[1] ?? null;
  }
  return typeof candidate === "string" && YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

function isValidYouTubeContent(value, expectedVideoId) {
  if (!isRecord(value) || value.kind !== "youtube_capture" || value.videoId !== expectedVideoId ||
    typeof value.sourceUrl !== "string" || readYouTubeVideoId(value.sourceUrl) !== expectedVideoId ||
    typeof value.title !== "string" || value.title.length === 0 || value.title.length > 500 ||
    (value.author !== null && typeof value.author !== "string") ||
    (value.description !== null && typeof value.description !== "string") ||
    !isRecord(value.transcript) ||
    (value.transcript.kind !== "unavailable" && value.transcript.kind !== "available")) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= YOUTUBE_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

function readCaptureResponse(value) {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.result) ||
    !isRecord(value.result.item) || typeof value.result.item.id !== "string" ||
    typeof value.result.item.title !== "string" ||
    !["inbox", "desk", "library"].includes(value.result.item.status) ||
    typeof value.result.created !== "boolean") {
    const code = isRecord(value) && typeof value.code === "string" ? value.code : "capture_failed";
    const message = isRecord(value) && typeof value.error === "string"
      ? value.error
      : "Readr could not save this page.";
    throw captureError(message, code);
  }
  return value.result;
}

function showCaptureNotification(result) {
  const message = result.created
    ? "Saved to Inbox"
    : `Already on ${result.item.status === "desk" ? "your Desk" : result.item.status === "library" ? "your Library" : "your Inbox"}`;
  showNotification(message, "success");
}

function showNotification(message, kind) {
  if (typeof chrome.notifications?.create !== "function") return;
  try {
    const notificationId = `readr-${crypto.randomUUID()}`;
    const pending = chrome.notifications.create(notificationId, {
      type: "basic",
      iconUrl: "icon.png",
      title: "Readr",
      message,
      priority: kind === "error" ? 1 : 0,
    });
    if (pending !== undefined && typeof pending.catch === "function") void pending.catch(() => undefined);
  } catch {
    // Notifications are feedback only; a browser notification failure must
    // never turn a persisted capture into an error.
  }
}

function focusTab(tabId) {
  return Promise.resolve()
    .then(async () => {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    })
    .catch(() => undefined);
}

function closeTab(tabId) {
  return Promise.resolve()
    .then(() => chrome.tabs.remove(tabId))
    .catch(() => undefined);
}

function setBadge(tabId, text, state) {
  if (typeof chrome.action?.setBadgeText !== "function") return;
  const details = { text, tabId };
  try {
    const pending = chrome.action.setBadgeText(details);
    if (pending !== undefined && typeof pending.catch === "function") void pending.catch(() => undefined);
    if (typeof chrome.action.setBadgeBackgroundColor === "function") {
      const color = state === "failure" ? "#b42318" : state === "success" ? "#16794c" : "#667085";
      const colorPending = chrome.action.setBadgeBackgroundColor({ color, tabId });
      if (colorPending !== undefined && typeof colorPending.catch === "function") void colorPending.catch(() => undefined);
    }
  } catch {
    // Badge state is best-effort.
  }
}

function scheduleBadgeClear(tabId, delayMs) {
  const previous = badgeTimers.get(tabId);
  if (previous !== undefined) clearTimeout(previous);
  const timer = setTimeout(() => {
    badgeTimers.delete(tabId);
    setBadge(tabId, "", "idle");
  }, delayMs);
  badgeTimers.set(tabId, timer);
}

function captureError(message, code) {
  return Object.assign(new Error(message), { code });
}

function normalizeError(error) {
  return {
    message: error instanceof Error ? error.message : "Readr could not save this page.",
    code: isRecord(error) && typeof error.code === "string" ? error.code : "capture_failed",
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
