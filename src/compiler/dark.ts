// Dark theme, done by rewriting the book's own colour values (no CSS filter,
// so text is rendered natively with no fringing and images need no handling).
//
// For each style rule that sets a colour, we emit a counterpart rule holding
// only the inverted colour declarations. These live in a second @scope block
// keyed on `.epub-book.dark` that comes after all the light rules, so toggling
// the theme is just adding/removing that class. Colours the pass can't parse
// (var(), oklch(), color-mix(), ...) are left alone.
//
// Inversion flips lightness in HSL (hue and saturation are kept). Backgrounds
// may reach pure black (and near-white ones snap to it, for OLED); text is
// capped just short of white. Shadows are left alone: inverting a black shadow
// would turn it into a white glow.

import { NAMED_COLORS } from "./colornames.js";
import { CHAPTER_ROOT } from "./scope.js";

/** Lightest an inverted text colour may get (~#e8e8e8). */
const FG_MAX_L = 0.91;
/** Inverted background lightness below this snaps to pure black. */
const BG_SNAP_L = 0.05;

// --- Colour parsing / inversion ------------------------------------------

interface Rgba {
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-1
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Parse one colour token (hex, rgb[a](), hsl[a](), or a CSS colour name). */
function parseColor(token: string): Rgba | null {
  const t = token.trim().toLowerCase();
  if (t.startsWith("#")) return parseHex(t.slice(1));
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(t);
  if (fn) {
    const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const alpha = parts[3] === undefined ? 1 : parseAlpha(parts[3]);
    if (alpha === null) return null;
    if (fn[1]!.startsWith("rgb")) {
      const [r, g, b] = [parts[0]!, parts[1]!, parts[2]!].map(parseRgbChannel);
      if (r == null || g == null || b == null) return null;
      return { r, g, b, a: alpha };
    }
    const h = parseHue(parts[0]!);
    const s = parsePercent(parts[1]!);
    const l = parsePercent(parts[2]!);
    if (h === null || s === null || l === null) return null;
    const [r, g, b] = hslToRgb(h, s, l);
    return { r, g, b, a: alpha };
  }
  const hex = NAMED_COLORS.get(t);
  return hex ? parseHex(hex) : null;
}

function parseHex(h: string): Rgba | null {
  if (!/^[0-9a-f]+$/.test(h)) return null;
  if (h.length === 3 || h.length === 4) {
    const [r, g, b, a] = [...h].map((c) => parseInt(c + c, 16));
    return { r: r!, g: g!, b: b!, a: a === undefined ? 1 : a / 255 };
  }
  if (h.length === 6 || h.length === 8) {
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  return null;
}

function parseRgbChannel(s: string): number | null {
  const v = parseFloat(s);
  if (Number.isNaN(v)) return null;
  return clamp(s.endsWith("%") ? (v / 100) * 255 : v, 0, 255);
}

function parseAlpha(s: string): number | null {
  const v = parseFloat(s);
  if (Number.isNaN(v)) return null;
  return clamp(s.endsWith("%") ? v / 100 : v, 0, 1);
}

function parsePercent(s: string): number | null {
  const v = parseFloat(s);
  return Number.isNaN(v) ? null : clamp(v / 100, 0, 1);
}

/** Hue in degrees, from a bare number or deg/grad/rad/turn. */
function parseHue(s: string): number | null {
  const v = parseFloat(s);
  if (Number.isNaN(v)) return null;
  const unit = s.replace(/^[-+.\d]+(e[-+]?\d+)?/i, "");
  const deg = unit === "turn" ? v * 360 : unit === "rad" ? (v * 180) / Math.PI : unit === "grad" ? v * 0.9 : v;
  return ((deg % 360) + 360) % 360;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

function rgbToHsl({ r, g, b }: Rgba): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [((h * 60) % 360 + 360) % 360, s, l];
}

type Role = "fg" | "bg";

/** Invert a colour's lightness for the dark theme and serialise it. */
function invert(c: Rgba, role: Role): string {
  const [h, s, l] = rgbToHsl(c);
  let nl = 1 - l;
  if (role === "fg") nl = Math.min(nl, FG_MAX_L);
  else if (nl < BG_SNAP_L) nl = 0;
  const [r, g, b] = hslToRgb(h, s, nl).map((v) => Math.round(clamp(v, 0, 255)));
  if (c.a < 1) return `rgba(${r}, ${g}, ${b}, ${+c.a.toFixed(3)})`;
  return "#" + [r, g, b].map((v) => v!.toString(16).padStart(2, "0")).join("");
}

// --- Colour tokens inside declaration values ------------------------------

/** Functions we can't safely invert; a value using one is skipped entirely. */
const UNSUPPORTED = /\b(?:var|env|oklch|oklab|lab|lch|hwb|color|color-mix|light-dark|device-cmyk)\(/i;

const COLOR_TOKEN = new RegExp(
  [
    "url\\([^)]*\\)", // never touch urls
    "\"(?:\\\\.|[^\"\\\\])*\"",
    "'(?:\\\\.|[^'\\\\])*'",
    "#[0-9a-f]{3,8}(?![\\w-])",
    "\\b(?:rgba?|hsla?)\\([^)]*\\)",
    "(?<![\\w#.-])[a-z]+(?![\\w(-])", // possible colour name
  ].join("|"),
  "gi",
);

/**
 * Invert every colour token in `value`. Returns the new value and the inverted
 * colours found (in order), or null if the value can't be handled.
 */
function invertValue(value: string, role: Role): { value: string; colors: string[] } | null {
  if (UNSUPPORTED.test(value)) return null;
  const colors: string[] = [];
  const out = value.replace(COLOR_TOKEN, (m) => {
    const c = m[0] === "u" || m[0] === "U" || m[0] === '"' || m[0] === "'" ? null : parseColor(m);
    if (!c) return m;
    const inv = invert(c, role);
    colors.push(inv);
    return inv;
  });
  return { value: out, colors };
}

// --- Declarations ---------------------------------------------------------

/** Split a declaration block / style attribute into [prop, value] pairs. */
function splitDeclarations(text: string): [string, string][] {
  const out: [string, string][] = [];
  let start = 0;
  let depth = 0;
  const flush = (end: number) => {
    const piece = text.slice(start, end);
    const i = piece.indexOf(":");
    if (i > 0) out.push([piece.slice(0, i).trim(), piece.slice(i + 1).trim()]);
    start = end + 1;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"' || c === "'") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) flush(i);
  }
  flush(text.length);
  return out;
}

const FG_PROPS = /^(?:color|fill|stroke|caret-color|text-decoration(?:-color)?|text-emphasis-color|-webkit-text-fill-color|-webkit-text-stroke(?:-color)?)$/;
const BORDER_COLOR = /^border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-color$/;
const BORDER_SHORTHAND = /^border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?$/;
/** Properties whose whole value is rewritten as-is. */
const DIRECT_PROPS = /^(?:color|background-color|outline-color|fill|stroke|caret-color|accent-color|text-decoration-color|text-emphasis-color|column-rule-color|-webkit-text-fill-color|-webkit-text-stroke-color|background-image)$/;
/** Shorthands that become a `<prop>-color` longhand holding their colour. */
const SHORTHAND_TO_COLOR = /^(?:outline|column-rule|text-decoration|-webkit-text-stroke)$/;

/** Dark-theme declarations (as `prop: value`) for one light declaration. */
function darkDeclaration(prop: string, rawValue: string): string[] {
  const p = prop.toLowerCase();
  const important = /\s*!important\s*$/i.test(rawValue);
  const value = rawValue.replace(/\s*!important\s*$/i, "");
  const role: Role = FG_PROPS.test(p) ? "fg" : "bg";
  const flag = important ? " !important" : "";

  if (p.startsWith("--")) {
    // Custom properties: only plain colour values.
    const c = parseColor(value);
    return c ? [`${prop}: ${invert(c, "bg")}${flag}`] : [];
  }
  if (DIRECT_PROPS.test(p) || BORDER_COLOR.test(p)) {
    const r = invertValue(value, role);
    return r && r.colors.length ? [`${prop}: ${r.value}${flag}`] : [];
  }
  if (p === "background") {
    const r = invertValue(value, "bg");
    if (!r || !r.colors.length) return [];
    // With a gradient the colours sit inside the image, so keep the whole value.
    if (/gradient\(/i.test(value)) return [`${prop}: ${r.value}${flag}`];
    return [`background-color: ${r.colors[r.colors.length - 1]}${flag}`];
  }
  if (BORDER_SHORTHAND.test(p) || SHORTHAND_TO_COLOR.test(p)) {
    const r = invertValue(value, role);
    return r && r.colors.length ? [`${p}-color: ${r.colors[r.colors.length - 1]}${flag}`] : [];
  }
  return [];
}

/** Dark-theme declarations for a declaration block or style attribute. */
export function darkDeclarations(text: string, forceImportant = false): string {
  const out: string[] = [];
  for (const [prop, value] of splitDeclarations(text)) {
    for (const d of darkDeclaration(prop, value)) {
      out.push(forceImportant && !/!important$/i.test(d) ? `${d} !important` : d);
    }
  }
  return out.join("; ");
}

// --- Minimal CSS block tree ----------------------------------------------

type CssNode =
  | { kind: "rule"; prelude: string; body: string }
  | { kind: "group"; prelude: string; children: CssNode[] } // @media etc.
  | { kind: "raw"; text: string }; // statements, @font-face, @keyframes, ...

const GROUP_AT_RULES = /^@(?:media|supports|layer|container)\b/i;

/** Parse CSS text into rules and nested conditional groups. */
function parseBlocks(css: string): CssNode[] {
  const nodes: CssNode[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 1;
    } else if (c === '"' || c === "'") {
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === "\\") i++;
    } else if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && c === ";") {
      nodes.push({ kind: "raw", text: css.slice(start, i + 1) });
      start = i + 1;
    } else if (depth === 0 && c === "{") {
      const prelude = css.slice(start, i);
      const end = matchingBrace(css, i);
      const body = css.slice(i + 1, end);
      if (GROUP_AT_RULES.test(prelude.trim())) nodes.push({ kind: "group", prelude, children: parseBlocks(body) });
      else if (prelude.trim().startsWith("@")) nodes.push({ kind: "raw", text: css.slice(start, end + 1) });
      else nodes.push({ kind: "rule", prelude, body });
      i = end;
      start = end + 1;
    }
  }
  const tail = css.slice(start);
  if (tail.trim()) nodes.push({ kind: "raw", text: tail });
  return nodes;
}

/** Index of the `}` matching the `{` at `open` (or the end of the text). */
function matchingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i]!;
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 1;
    } else if (c === '"' || c === "'") {
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === "\\") i++;
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return css.length;
}

function stringify(nodes: CssNode[]): string {
  return nodes
    .map((n) =>
      n.kind === "raw" ? n.text : n.kind === "rule" ? `${n.prelude}{${n.body}}` : `${n.prelude}{${stringify(n.children)}}`,
    )
    .join("");
}

// --- Page colours belong to the reader -----------------------------------

/** True if the selector's subject is the book container or a chapter section. */
function isRootSubject(selector: string): boolean {
  const sel = selector.trim();
  let last = 0;
  let depth = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i]!;
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(c)) last = i + 1;
  }
  const subject = sel.slice(last);
  return subject.startsWith(":scope") || subject.startsWith(CHAPTER_ROOT);
}

/** Split a selector list on top-level commas. */
function splitSelectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i]!;
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  out.push(prelude.slice(start));
  return out;
}

/**
 * Drop `background` / `background-color` from rules that style only the book
 * container or a chapter section (i.e. the original html/body). The reader
 * owns the page colour in both themes.
 */
export function stripRootBackgrounds(css: string): string {
  const walk = (nodes: CssNode[]): void => {
    for (const n of nodes) {
      if (n.kind === "group") walk(n.children);
      else if (n.kind === "rule" && !n.prelude.trim().startsWith("@") && splitSelectors(n.prelude).every(isRootSubject)) {
        n.body = splitDeclarations(n.body)
          .filter(([p]) => !/^background(?:-color)?$/i.test(p))
          .map(([p, v]) => `${p}: ${v}`)
          .join("; ");
      }
    }
  };
  const nodes = parseBlocks(css);
  walk(nodes);
  return stringify(nodes);
}

// --- Dark sheet -----------------------------------------------------------

/** Rules holding only the inverted colour declarations of `css`. */
export function buildDarkCss(css: string): string {
  const walk = (nodes: CssNode[]): string[] => {
    const out: string[] = [];
    for (const n of nodes) {
      if (n.kind === "rule") {
        const decls = darkDeclarations(n.body);
        if (decls) out.push(`${n.prelude.trim()} { ${decls}; }`);
      } else if (n.kind === "group") {
        const inner = walk(n.children);
        if (inner.length) out.push(`${n.prelude.trim()} {\n${inner.join("\n")}\n}`);
      }
    }
    return out;
  };
  return walk(parseBlocks(css)).join("\n");
}

// --- Inline colours -------------------------------------------------------

/**
 * Inline `style` attributes beat any stylesheet rule, so each distinct set of
 * inline colours gets a small class with `!important` dark overrides.
 */
export class InlineDarkRules {
  private byDecls = new Map<string, string>();

  /** A class name carrying the dark override for these declarations, or null. */
  classFor(declarations: string): string | null {
    const dark = darkDeclarations(declarations, true);
    if (!dark) return null;
    let cls = this.byDecls.get(dark);
    if (!cls) {
      cls = `dk${this.byDecls.size}`;
      this.byDecls.set(dark, cls);
    }
    return cls;
  }

  css(): string {
    return [...this.byDecls].map(([decls, cls]) => `.${cls} { ${decls}; }`).join("\n");
  }
}
