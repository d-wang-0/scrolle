// Switch for ui-style.css: ?ui=lite|flat|raised|glass picks a look, ?ui=off goes back to the old look. Remembered in localStorage.
// The default is raised on black; ?bg=dim|off changes how dark the dark theme's greys are.
import "./ui-style.css";
import { readText, writeText } from "./storage.js";

const KEY = "ui-style";
const DEFAULT_UI = "raised";
const DEFAULT_BG = "black";
const known = ["lite", "flat", "raised", "glass"];

/** The URL's choice (remembered), else the remembered one, else the default. */
function choice(param: string, key: string, fallback: string): string {
  const fromUrl = new URLSearchParams(location.search).get(param);
  if (fromUrl) {
    writeText(key, fromUrl);
    return fromUrl;
  }
  return readText(key) ?? fallback;
}

const ui = choice("ui", KEY, DEFAULT_UI);
if (known.includes(ui)) document.documentElement.dataset.ui = ui;

// ?bg=black|dim sets how dark the grey chrome is in the dark theme (?bg=off clears it): black is the book's own black.
const bg = choice("bg", KEY + "-bg", DEFAULT_BG);
if (bg === "black" || bg === "dim") document.documentElement.dataset.bg = bg;
