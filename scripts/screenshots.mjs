// Regenerates the README media: docs/screenshots/search.png (both sidebars open on a search),
// docs/screenshots/scroll.gif (a quick top-to-bottom scroll through the whole book) and
// docs/icon.png and docs/icon-header.png (the Android adaptive icon as a launcher shows it, in a squircle mask).
//
//   npm run screenshots -- path/to/book.epub
//
// Needs Playwright with Chromium (`npm i -g playwright && npx playwright install chromium`, or any
// install that `require('playwright')` can find) and ffmpeg on PATH. The book is Little Brother by
// Cory Doctorow (see docs/screenshots/NOTICE.md).

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const OUT = "docs/screenshots";
const PORT = 5199;
const VIEW = { width: 1920, height: 1200 };
const QUERY = "Xbox";
const GIF = { width: 960, fps: 10, seconds: 14 };

const epub = process.argv[2];
if (!epub || !existsSync(epub)) {
  console.error("usage: npm run screenshots -- <book.epub>");
  process.exit(1);
}

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright not found. Install it (npm i -g playwright && npx playwright install chromium).");
  process.exit(1);
}
if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.error("ffmpeg not found on PATH.");
  process.exit(1);
}

const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
const url = `http://localhost:${PORT}/`;
for (let i = 0; ; i++) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {}
  if (i > 100) throw new Error("dev server did not start");
  await new Promise((r) => setTimeout(r, 200));
}

const tmp = mkdtempSync(join(tmpdir(), "scrolle-shots-"));
const browser = await chromium.launch();
try {
  mkdirSync(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: VIEW });
  // Start from clean settings with both sidebars open.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("scrolle:settings", JSON.stringify({ tocOpen: true, searchOpen: true }));
    }
  });
  await page.goto(url);
  await page.setInputFiles('input[type="file"]', resolve(epub));
  await page.waitForSelector("#content p", { state: "visible", timeout: 60000 });
  await page.waitForTimeout(1500);

  // --- scroll.gif ---
  const frames = GIF.fps * GIF.seconds;
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), (max * i) / (frames - 1));
    await page.waitForTimeout(30);
    await page.screenshot({ path: join(tmp, `f${String(i).padStart(4, "0")}.png`) });
  }
  const ff = (args) => {
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("ffmpeg failed");
  };
  // One global palette over all frames, with ordered dithering and rectangle diffs, keeps text crisp while the file stays small.
  const scale = `scale=${GIF.width}:-1:flags=lanczos`;
  const palette = join(tmp, "palette.png");
  const input = ["-framerate", String(GIF.fps), "-i", join(tmp, "f%04d.png")];
  ff([...input, "-vf", `${scale},palettegen=max_colors=256:stats_mode=full`, palette]);
  ff([...input, "-i", palette, "-lavfi", `${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, "-loop", "0", join(OUT, "scroll.gif")]);

  // --- search.png ---
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.fill('input[type="search"], input[type="text"]', QUERY);
  await page.keyboard.press("Enter"); // first hit
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter"); // second hit, as in the reference shot
  await page.waitForTimeout(1500);
  await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
  await page.screenshot({ path: join(OUT, "search.png") });

  // --- icon.png ---
  // Mirrors scripts/android-icons.mjs: the artwork is padded to a 108dp adaptive-icon canvas (viewBox
  // -64 -64 256 256) over the gradient background, and the launcher shows the central 72dp through a mask.
  const art = readFileSync("src-tauri/app-icon.svg", "utf8").replace(/<svg[^>]*>/, '<svg x="-18" y="-18" width="108" height="108" viewBox="-64 -64 256 256">');
  const squircle = Array.from({ length: 180 }, (_, i) => {
    const t = (i / 180) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    const x = 36 + 36 * Math.sign(c) * Math.abs(c) ** (2 / 5), y = 36 + 36 * Math.sign(s) * Math.abs(s) ** (2 / 5);
    return `${i ? "L" : "M"}${x.toFixed(3)} ${y.toFixed(3)}`;
  }).join("") + "Z";
  const HEADER_PAD = 77; // extra transparent rows below the README header copy; see below
  const iconPage = await browser.newPage({ viewport: { width: 512, height: 512 + HEADER_PAD } });
  await iconPage.setContent(`<body style="margin:0;background:transparent"><svg style="display:block" xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 72 72">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B5FCC"/><stop offset=".5" stop-color="#2252B4"/><stop offset="1" stop-color="#163A8C"/></linearGradient>
    <clipPath id="mask"><path d="${squircle}"/></clipPath></defs>
    <g clip-path="url(#mask)"><rect width="72" height="72" fill="url(#bg)"/>${art}</g></svg></body>`);
  await iconPage.screenshot({ path: "docs/icon.png", omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
  // GitHub centres an inline image on the line box, which sits a little below the heading's letters.
  // The transparent bottom padding moves the visible icon up to line up with them.
  await iconPage.screenshot({ path: "docs/icon-header.png", omitBackground: true });
  console.log(`wrote ${OUT}/scroll.gif, ${OUT}/search.png and docs/icon.png`);
} finally {
  await browser.close();
  server.kill();
  rmSync(tmp, { recursive: true, force: true });
}
