"use strict";

const button = document.querySelector("#capture");
const status = document.querySelector("#status");

button.addEventListener("click", () => {
  button.disabled = true;
  status.textContent = "Capturing…";
  chrome.runtime.sendMessage({ type: "capture-active-youtube" }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = chrome.runtime.lastError.message;
    } else if (response?.ok) {
      status.textContent = "Captured to Readr.";
    } else {
      status.textContent = response?.error || "The video could not be captured.";
    }
    button.disabled = false;
  });
});
