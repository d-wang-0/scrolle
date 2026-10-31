// Build the viewer as a Chrome extension page. Unlike the single-file build this keeps
// ordinary external scripts (MV3 forbids inline ones); extension/ is copied alongside
// as-is (manifest, service worker) and the result in dist-extension/ loads unpacked.
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// The extension uses the desktop app's icons; they are copied in at build time rather than kept twice.
const ICONS = ["32x32", "128x128"];

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: "extension-icons",
      generateBundle() {
        for (const name of ICONS) {
          this.emitFile({ type: "asset", fileName: `icons/${name}.png`, source: readFileSync(`src-tauri/icons/${name}.png`) });
        }
      },
      transformIndexHtml: () => [{ tag: "link", attrs: { rel: "icon", type: "image/png", href: "./icons/32x32.png" }, injectTo: "head" }],
    },
  ],
  base: "./",
  publicDir: "extension",
  build: {
    outDir: "dist-extension",
    emptyOutDir: true,
  },
});
