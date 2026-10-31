// Build the viewer as one self-contained script (no module splitting) so
// scripts/inline-build.mjs can fold it into a single .html that opens over file://.
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  base: "./",
  build: {
    outDir: "dist-single",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      output: { format: "iife" },
    },
  },
});
