(function () {
  "use strict";

  let pendingRequest = null;
  let ready = false;
  let readinessTimer = null;
  let requestTimer = null;

  const READINESS_TIMEOUT_MS = 10_000;
  const REQUEST_TIMEOUT_MS = 30_000;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "readr-ping") {
      sendResponse({ ok: true });
      return false;
    }
    if (!isBridgeMessage(message)) return false;

    if (pendingRequest !== null) {
      sendResponse({ ok: false, error: "A Readr request is already in progress.", code: "busy" });
      return false;
    }
    pendingRequest = {
      captureId: message.captureId,
      windowMessage: message.type === "readr-capture-url"
        ? {
            type: "readr:capture-url",
            captureId: message.captureId,
            url: message.url,
          }
        : {
            type: "readr:youtube-media",
            captureId: message.captureId,
            itemId: message.itemId,
            content: message.content,
          },
      response: sendResponse,
      delivered: false,
    };
    scheduleReadinessFallback();
    requestTimer = setTimeout(() => {
      finishRequest({
        ok: false,
        error: "Readr did not finish the request.",
        code: "bridge_timeout",
      });
    }, REQUEST_TIMEOUT_MS);
    deliverWhenReady();
    return true;
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type === "readr:capture-ready") {
      ready = true;
      clearReadinessFallback();
      deliverWhenReady();
      return;
    }
    if (!isRequestResult(event.data) || pendingRequest === null) return;
    if (event.data.captureId !== pendingRequest.captureId ||
      event.data.resultType !== pendingRequest.windowMessage.type) return;

    finishRequest({
      ok: event.data.ok,
      ...(event.data.ok ? { result: event.data.result } : {
        error: event.data.error || "Readr could not complete the request.",
        ...(event.data.code ? { code: event.data.code } : {}),
      }),
    });
  });

  function deliverWhenReady() {
    if (!ready || pendingRequest === null || pendingRequest.delivered) return;
    pendingRequest.delivered = true;
    window.postMessage(pendingRequest.windowMessage, window.location.origin);
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

  function finishRequest(response) {
    if (requestTimer !== null) {
      clearTimeout(requestTimer);
      requestTimer = null;
    }
    clearReadinessFallback();
    const request = pendingRequest;
    pendingRequest = null;
    if (request === null) return;
    try {
      request.response(response);
    } catch {
      // The extension port may close while a background tab is being cleaned up.
    }
  }

  function isBridgeMessage(value) {
    if (!isRecord(value) || !isCaptureId(value.captureId)) return false;
    if (value.type === "readr-capture-url") {
      return typeof value.url === "string" && value.url.length <= 2_048 && isHttpUrl(value.url);
    }
    return value.type === "readr-attach-youtube-media" &&
      typeof value.itemId === "string" && value.itemId.length > 0 && value.itemId.length <= 100 &&
      isRecord(value.content);
  }

  function isRequestResult(value) {
    if (!isRecord(value) || !isCaptureId(value.captureId) ||
      (value.resultType !== "readr:capture-url" && value.resultType !== "readr:youtube-media") ||
      (value.ok !== true && value.ok !== false)) return false;
    if (value.ok) return true;
    return value.error === undefined || typeof value.error === "string";
  }

  function isCaptureId(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 100;
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") &&
        url.username.length === 0 && url.password.length === 0;
    } catch {
      return false;
    }
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
}());
