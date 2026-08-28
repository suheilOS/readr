import { afterEach, describe, expect, it } from "vitest";
import { loadYouTubeApi } from "../../src/reader/youtubeIframeApi";

afterEach(() => {
  document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach((script) => script.remove());
  delete window.YT;
  delete window.onYouTubeIframeAPIReady;
});

describe("YouTube IFrame API loader", () => {
  it("removes a failed script and permits a clean retry", async () => {
    const firstAttempt = loadYouTubeApi();
    const firstScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    expect(firstScript).not.toBeNull();
    firstScript?.dispatchEvent(new Event("error"));
    await expect(firstAttempt).rejects.toThrow("failed to load");
    expect(firstScript?.isConnected).toBe(false);

    const secondAttempt = loadYouTubeApi();
    const secondScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    expect(secondScript).not.toBeNull();
    expect(secondScript).not.toBe(firstScript);
    secondScript?.dispatchEvent(new Event("error"));
    await expect(secondAttempt).rejects.toThrow("failed to load");
  });
});
