// Fold the single-script build in dist-single/ into one standalone .html.
// Module scripts can't load from file://, but an inline classic script can, so
// the bundle's <script> and stylesheet <link>s are inlined, with the script
// moved to the end of <body> (the DOM must exist when it runs).

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const dir = "dist-single";
const out = "scrolle.html";
let html = readFileSync(join(dir, "index.html"), "utf8");

const assetPath = (url) => join(dir, url.replace(/^\.?\//, ""));
let js = "";

html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>\s*/g, (_m, src) => {
  js += readFileSync(assetPath(src), "utf8") + "\n";
  return "";
});
html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>\s*/g, (_m, href) => {
  return `<style>${readFileSync(assetPath(href), "utf8")}</style>\n`;
});
if (!js) throw new Error("no <script src> found in dist-single/index.html");

// An inline script must not contain a literal closing tag.
js = js.replace(/<\/script/gi, "<\\/script");
html = html.replace("</body>", () => `<script>\n${js}</script>\n</body>`);

writeFileSync(join(dir, out), html);
rmSync(join(dir, "index.html"));
rmSync(join(dir, "assets"), { recursive: true, force: true });
console.log(`${join(dir, out)}: ${(html.length / 1024).toFixed(0)} KiB`);
