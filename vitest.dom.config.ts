import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "https://readr.test/" },
    },
    setupFiles: ["./tests/browser/setup.ts"],
    include: ["tests/browser/**/*.test.ts"],
  },
});
