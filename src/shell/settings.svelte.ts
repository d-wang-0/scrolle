// User-adjustable reading settings, persisted in localStorage.

export interface Settings {
  theme: "dark" | "light";
  /** Base font size of the book, in px. */
  fontSize: number;
  /** Max width of the reading column, in rem. */
  width: number;
  /** Invert the colours of images: none, only black-and-white ones, or all. */
  invertImages: "off" | "bw" | "all";
  searchMode: "contains" | "regex";
  searchCase: boolean;
  /** Where a search result lands when scrolled to, as a percentage down from the top of the viewport. */
  hitOffset: number;
  /** Duration of the glide to a nearby search result, in ms (0 jumps instantly). */
  glideMs: number;
  /** Lines of book text shown for each search result. */
  previewLines: number;
  /** Sidebar widths, in px. */
  tocWidth: number;
  searchWidth: number;
  /** Whether each sidebar was open; restored on launch. */
  tocOpen: boolean;
  searchOpen: boolean;
}

export const LIMITS = {
  sidebar: { min: 220, max: 800 },
  fontSize: { min: 14, max: 32 },
  width: { min: 28, max: 72 },
  hitOffset: { min: 0, max: 50 },
  glideMs: { min: 0, max: 600 },
  previewLines: { min: 1, max: 5 },
} as const;

const KEY = "scrolle:settings";
export const SIDEBAR_DEFAULTS = { toc: 352, search: 416 } as const;
const defaults: Settings = {
  theme: "dark", fontSize: 20, width: 42, invertImages: "bw", searchMode: "contains", searchCase: false,
  hitOffset: 8, glideMs: 220, previewLines: 1,
  tocWidth: SIDEBAR_DEFAULTS.toc, searchWidth: SIDEBAR_DEFAULTS.search,
  tocOpen: false, searchOpen: false,
};

const clamp = (n: unknown, { min, max }: { min: number; max: number }, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    return {
      theme: raw.theme === "light" ? "light" : "dark",
      fontSize: clamp(raw.fontSize, LIMITS.fontSize, defaults.fontSize),
      width: clamp(raw.width, LIMITS.width, defaults.width),
      invertImages: raw.invertImages === "off" || raw.invertImages === "bw" || raw.invertImages === "all" ? raw.invertImages : defaults.invertImages,
      searchMode: raw.searchMode === "regex" ? "regex" : "contains",
      searchCase: raw.searchCase === true,
      hitOffset: clamp(raw.hitOffset, LIMITS.hitOffset, defaults.hitOffset),
      glideMs: clamp(raw.glideMs, LIMITS.glideMs, defaults.glideMs),
      previewLines: Math.round(clamp(raw.previewLines, LIMITS.previewLines, defaults.previewLines)),
      tocWidth: clamp(raw.tocWidth, LIMITS.sidebar, defaults.tocWidth),
      searchWidth: clamp(raw.searchWidth, LIMITS.sidebar, defaults.searchWidth),
      tocOpen: raw.tocOpen === true,
      searchOpen: raw.searchOpen === true,
    };
  } catch {
    return { ...defaults };
  }
}

export const settings = $state<Settings>(load());

export function resetSettings(): void {
  Object.assign(settings, defaults);
}

/** Call from a component effect: re-runs (and saves) whenever a setting changes. */
export function persistSettings(): void {
  const json = JSON.stringify(settings);
  try {
    localStorage.setItem(KEY, json);
  } catch {
    // Storage unavailable (private mode, quota); settings just won't persist.
  }
}
