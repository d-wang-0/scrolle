// Zip dist-extension/ into dist-crx/scrolle-extension.zip (the form the Chrome Web Store
// and "Load unpacked" after extracting expect), using only fflate.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { zipSync } from "fflate";

const dir = "dist-extension";
const outDir = "dist-crx";
const out = join(outDir, "scrolle-extension.zip");

const files = {};
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else files[relative(dir, p).split(sep).join("/")] = readFileSync(p);
  }
};
walk(dir);

const zip = zipSync(files, { level: 9 });
mkdirSync(outDir, { recursive: true });
writeFileSync(out, zip);
console.log(`${out}: ${(zip.length / 1024).toFixed(0)} KiB`);
