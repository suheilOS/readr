import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      configPath:
        command === "serve" ? "./wrangler.local.jsonc" : "./wrangler.jsonc",
    }),
    ...(mode === "analyze"
      ? [
          visualizer({
            filename: "dist/bundle-stats.html",
            open: false,
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
}));
