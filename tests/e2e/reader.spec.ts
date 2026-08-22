import { expect, test } from "@playwright/test";

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

  const readButton = page.getByRole("button", { name: "Read in readr: Stored article" });
  await readButton.click();
  await expect(page.getByRole("heading", { name: "Extracted article" })).toBeFocused();
  await expect(page.locator(".reader-content script")).toHaveCount(0);
  await expect(page.locator(".reader-content img")).not.toHaveAttribute("src");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(readButton).toBeFocused();
  expect(cspErrors).toEqual([]);
});
