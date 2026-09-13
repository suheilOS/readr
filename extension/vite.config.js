import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const extensionDirectory = resolve(import.meta.dirname);
const outputDirectory = resolve(extensionDirectory, "dist");
const staticFiles = ["manifest.json", "service-worker.js", "readr-bridge.js", "icon.png"];

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: true,
    outDir: outputDirectory,
    rollupOptions: {
      input: resolve(extensionDirectory, "src/youtube-capture.js"),
      output: {
        entryFileNames: "youtube-capture.js",
        format: "iife",
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [{
    name: "copy-extension-runtime",
    closeBundle() {
      mkdirSync(outputDirectory, { recursive: true });
      for (const file of staticFiles) {
        copyFileSync(resolve(extensionDirectory, file), resolve(outputDirectory, file));
      }
    },
  }],
});
