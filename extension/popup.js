"use strict";

const button = document.querySelector("#capture");
const status = document.querySelector("#status");
const statusText = document.querySelector("#status-text");

const PROGRESS_MESSAGES = {
  reading: "Reading transcript…",
  opening: "Opening Readr…",
  saving: "Saving to Readr…",
};

function setStatus(state, message) {
  status.dataset.state = state;
  statusText.textContent = message;
}

function setBusy(isBusy) {
  button.disabled = isBusy;
  button.setAttribute("aria-busy", String(isBusy));
  status.setAttribute("aria-busy", String(isBusy));
  button.classList.toggle("is-busy", isBusy);
}

chrome.runtime.onMessage.addListener((message) => {
  if (!button.disabled || message?.type !== "capture-progress") return;
  const progressMessage = PROGRESS_MESSAGES[message.stage];
  if (progressMessage !== undefined) setStatus("busy", progressMessage);
});

button.addEventListener("click", () => {
  setBusy(true);
  setStatus("busy", PROGRESS_MESSAGES.reading);
  chrome.runtime.sendMessage({ type: "capture-active-youtube" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus("error", chrome.runtime.lastError.message);
    } else if (response?.ok) {
      setStatus("success", "Captured to Readr.");
    } else {
      setStatus("error", response?.error || "The video could not be captured.");
    }
    setBusy(false);
  });
});
