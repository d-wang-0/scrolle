// Switch for ui-style.css: ?ui=lite|flat|raised|glass picks a look, ?ui=off goes back to the old look. Remembered in localStorage.
// The default is raised on black; ?bg=dim|off changes how dark the dark theme's greys are.
import "./ui-style.css";

const KEY = "ui-style";
const DEFAULT_UI = "raised";
const DEFAULT_BG = "black";
const known = ["lite", "flat", "raised", "glass"];
let ui: string | null = new URLSearchParams(location.search).get("ui");
try {
  if (ui) localStorage.setItem(KEY, ui);
  else ui = localStorage.getItem(KEY) ?? DEFAULT_UI;
} catch {
  ui ??= DEFAULT_UI; /* no storage: the URL, else the default */
}
if (ui && known.includes(ui)) document.documentElement.dataset.ui = ui;

// ?bg=black|dim sets how dark the grey chrome is in the dark theme (?bg=off clears it): black is the book's own black.
let bg: string | null = new URLSearchParams(location.search).get("bg");
try {
  if (bg) localStorage.setItem(KEY + "-bg", bg);
  else bg = localStorage.getItem(KEY + "-bg") ?? DEFAULT_BG;
} catch {
  bg ??= DEFAULT_BG; /* no storage */
}
if (bg === "black" || bg === "dim") document.documentElement.dataset.bg = bg;

// Slider fill: CSS cannot know how far along a range input is, so mirror it into --p (cheap poll; also catches
// values the app sets itself, like "Reset to defaults").
if (document.documentElement.dataset.ui) {
  setInterval(() => {
    for (const el of document.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
      const min = Number(el.min || 0), max = Number(el.max || 100);
      const p = `${((Number(el.value) - min) / (max - min)) * 100}%`;
      if (el.style.getPropertyValue("--p") !== p) el.style.setProperty("--p", p);
    }
  }, 100);
}
