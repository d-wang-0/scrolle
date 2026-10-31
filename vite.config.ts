/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  // Svelte resolves to its server build under Node unless told this is a browser.
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
  // Tauri's Rust build output lives under src-tauri; watching it throws EBUSY.
  server: { watch: { ignored: ["**/src-tauri/**"] } },
  test: {
    globals: true,
    environment: "node",
  },
});
