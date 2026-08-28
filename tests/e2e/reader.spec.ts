import { expect, test } from "@playwright/test";
import { parseSaveMediaProgressInput, type SaveMediaProgressInput } from "../../shared/mediaProgress";

test("reads sanitized content under the production security policy", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.text().toLowerCase().includes("content security policy")) {
      cspErrors.push(message.text());
    }
  });

  await page.route("**/api/items", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{
          id: "reader-smoke",
          title: "Stored article",
          url: "https://example.com/story",
          type: "article",
          status: "desk",
          addedAt: "2026-08-22T00:00:00.000Z",
          finishedAt: null,
          note: null,
        }],
      }),
    });
  });

  await page.route("**/api/extract", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceUrl: "https://example.com/story",
        title: "Extracted article",
        author: "Reader Test",
        wordCount: 420,
        html: '<p>Safe article text.</p><script>alert(1)</script><img src="http://127.0.0.1/private.png" onerror="alert(2)">',
      }),
    });
  });

  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("script-src 'self'");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");

  const readButton = page.getByRole("button", { name: "Open in readr: Stored article" });
  await readButton.click();
  await expect(page.getByRole("heading", { name: "Extracted article" })).toBeFocused();
  await expect(page.locator(".reader-content script")).toHaveCount(0);
  await expect(page.locator(".reader-content img")).not.toHaveAttribute("src");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(readButton).toBeFocused();
  expect(cspErrors).toEqual([]);
});

test("plays a YouTube item with synchronized transcript controls", async ({ page }) => {
  const progressWrites: SaveMediaProgressInput[] = [];
  await page.addInitScript(() => {
    const testWindow = window as typeof window & {
      YT: { Player: new (element: HTMLElement, options: Record<string, unknown>) => object };
      __seekTimes: number[];
    };
    testWindow.__seekTimes = [];
    testWindow.YT = {
      Player: class {
        private duration = 0;
        private time = 0;
        private readonly options: {
          events: {
            onReady: (event: { target: object }) => void;
            onStateChange: (event: { data: number; target: object }) => void;
          };
        };

        constructor(element: HTMLElement, options: Record<string, unknown>) {
          this.options = options as typeof this.options;
          element.textContent = "Mock YouTube player";
          setTimeout(() => this.options.events.onReady({ target: this }), 0);
        }

        destroy() {}
        getCurrentTime() { return this.time; }
        getDuration() { return this.duration; }
        pauseVideo() { this.options.events.onStateChange({ data: 2, target: this }); }
        playVideo() {
          this.duration = 300;
          this.options.events.onStateChange({ data: 1, target: this });
        }
        seekTo(seconds: number) {
          this.time = seconds;
          testWindow.__seekTimes.push(seconds);
          this.options.events.onStateChange({ data: 2, target: this });
        }
      },
    };
  });

  await page.route("**/api/items", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{
          id: "youtube-smoke",
          title: "Stored video",
          url: "https://youtu.be/dQw4w9WgXcQ",
          type: "article",
          status: "desk",
          addedAt: "2026-08-22T00:00:00.000Z",
          finishedAt: null,
          note: null,
        }],
      }),
    });
  });
  await page.route("**/api/items/youtube-smoke/media-progress", async (route) => {
    if (route.request().method() === "PUT") {
      const requestBody: unknown = JSON.parse(route.request().postData() ?? "null");
      const progress = parseSaveMediaProgressInput(requestBody);
      if (progress === null) throw new Error("Invalid progress request");
      progressWrites.push(progress);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          progress: { ...progress, updatedAt: "2026-08-28T00:00:00.000Z" },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ progress: null }),
    });
  });
  await page.route("**/api/media/youtube", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "youtube",
        videoId: "dQw4w9WgXcQ",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Extracted video",
        author: "Reader Test",
        description: "A fixture video.",
        thumbnailUrl: null,
        transcript: {
          kind: "available",
          language: "en",
          chapters: [{ startSeconds: 0, title: "Opening" }],
          segments: [
            { startSeconds: 0, text: "Welcome to the video." },
            { startSeconds: 42, text: "This is the second section." },
          ],
        },
      }),
    });
  });

  await page.goto("/");
  const watchButton = page.getByRole("button", { name: "Open in readr: Stored video" });
  const actionLabel = await watchButton.textContent();
  await watchButton.click();
  await expect(page.getByRole("heading", { name: "Extracted video" })).toBeFocused();
  await expect(page.getByText("Welcome to the video.")).toBeVisible();
  await page.getByRole("button", { name: "Seek to 0:42" }).click();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __seekTimes: number[] }
  ).__seekTimes)).toContain(42);
  await page.getByRole("heading", { name: "Extracted video" }).focus();
  await page.keyboard.press("k");
  await expect.poll(() => progressWrites).toContainEqual(expect.objectContaining({
    positionSeconds: 42,
    durationSeconds: 300,
  }));
  expect(actionLabel).toContain("Watch");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open in readr: Stored video" })).toBeFocused();
});
