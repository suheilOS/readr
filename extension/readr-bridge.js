(function () {
  "use strict";

  let pendingContent = null;
  let ready = false;
  let readinessTimer = null;

  const READINESS_TIMEOUT_MS = 10_000;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "readr-ping") {
      sendResponse({ ok: true });
      return false;
    }
    if (!isBridgeMessage(message)) return;
    pendingContent = message.content;
    scheduleReadinessFallback();
    deliverWhenReady();
    sendResponse({ ok: true });
    return false;
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type === "readr:capture-ready") {
      ready = true;
      clearReadinessFallback();
      deliverWhenReady();
    }
  });

  function deliverWhenReady() {
    if (!ready || pendingContent === null) return;
    const content = pendingContent;
    pendingContent = null;
    window.postMessage({ type: "readr:youtube-capture", content }, window.location.origin);
  }

  function scheduleReadinessFallback() {
    if (readinessTimer !== null) return;
    readinessTimer = setTimeout(() => {
      readinessTimer = null;
      ready = true;
      deliverWhenReady();
    }, READINESS_TIMEOUT_MS);
  }

  function clearReadinessFallback() {
    if (readinessTimer === null) return;
    clearTimeout(readinessTimer);
    readinessTimer = null;
  }

  function isBridgeMessage(value) {
    return value !== null && typeof value === "object" &&
      value.type === "readr-capture" && value.content !== null && typeof value.content === "object";
  }
}());
