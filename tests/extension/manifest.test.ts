import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "extension/manifest.json"), "utf8")) as {
  action: { default_popup?: string };
  permissions?: string[];
  host_permissions?: string[];
};

describe("Readr extension manifest", () => {
  it("uses a direct action with narrow permissions", () => {
    expect(manifest.action.default_popup).toBeUndefined();
    expect(manifest.permissions).toEqual(expect.arrayContaining(["activeTab", "notifications", "scripting"]));
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.host_permissions).not.toContain("<all_urls>");
    expect(manifest.host_permissions).toEqual(expect.arrayContaining([
      "https://readr.overhawl.app/*",
      "http://localhost:5173/*",
    ]));
    expect(manifest.host_permissions).not.toContain("https://www.youtube.com/*");
  });
});
