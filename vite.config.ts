import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    cloudflare({
      configPath:
        command === "serve" ? "./wrangler.local.jsonc" : "./wrangler.jsonc",
    }),
  ],
}));
