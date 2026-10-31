// Collect, transform, and scope the book's CSS so it applies to the merged
// document without bleeding between chapters or into the reader chrome.
//
// Strategy:
//  - Gather linked <link rel=stylesheet> and inline <style> from every chapter.
//  - Dedupe by content; in the common case every chapter shares one sheet.
//  - Wrap each sheet in native `@scope (<root>) { ... }` so the browser handles
//    @media / @supports / complex selectors and scoping adds no specificity.
//  - Text-level fixes: html/body/:root -> :scope; drop @page; strip copy
//    restrictions; hoist @font-face/@import/@namespace out of the @scope block;
//    rewrite url() against the CSS file's own location into data: URIs.
//
// `#id` selectors are rewritten to the prefixed ids (`ch{N}--id`) of every
// chapter that actually contains that id, as `:is(#ch1--id, #ch4--id)`, which
// keeps id-level specificity.

import type { Archive } from "./archive.js";
import type { ManifestItem } from "./types.js";
import { resolveHref, dirOf } from "./paths.js";
import { mimeForPath } from "./media.js";
import { base64FromBytes } from "./resources.js";
import { SCOPE_ROOT, DARK_SCOPE_ROOT, CHAPTER_ROOT, scopeFor } from "./scope.js";
import { buildDarkCss, stripRootBackgrounds } from "./dark.js";

export { SCOPE_ROOT };

export interface CollectedCss {
  /** Final CSS text to drop into one <style> element (already scoped). */
  styleText: string;
  /** Dark-theme colour overrides, already scoped (see scopeDarkCss()). */
  darkText: string;
}

/** `@import url(x);` or `@import "x";` with no media query; the target is in groups 1 to 5. */
const LOCAL_IMPORT = /@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s'"]+))\s*\)|"([^"]+)"|'([^']+)')\s*;/gi;

interface RawSheet {
  /** CSS source text. */
  text: string;
  /** Zip path the CSS lived at (for url() resolution). Null for inline. */
  basePath: string | null;
  /** Book of a merged set the sheet's CSS is confined to; null when there is only one. */
  book: number | null;
}

/**
 * Collect every stylesheet referenced by the chapters, dedupe, transform, and
 * return combined scoped CSS text. `fontResolver` turns a resolved zip path
 * into a data: URI (handling font deobfuscation).
 */
export function collectCss(
  chapterDocs: { doc: Document; basePath: string; book: number }[],
  archive: Archive,
  manifest: Map<string, ManifestItem>,
  fontResolver: (zipPath: string) => string | null,
  idSections: Map<string, string[]>,
  perBook = false,
): CollectedCss {
  const seen = new Set<string>();
  const sheets: RawSheet[] = [];

  // A hoisted @import would load unscoped (and from the wrong base), so a book's own
  // `@import "margin.css"` is inlined as a sheet of its own, ahead of the importer.
  const addSheet = (text: string, basePath: string | null, book: number | null): void => {
    const rest = basePath === null ? text : text.replace(LOCAL_IMPORT, (m, ...g: (string | undefined)[]) => {
      const href = (g[0] ?? g[1] ?? g[2] ?? g[3] ?? g[4])!.trim();
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return m;
      const path = resolveHref(basePath, href);
      if (!seen.has(path)) {
        seen.add(path);
        const imported = archive.text(path);
        if (imported !== null) addSheet(imported, path, book);
      }
      return "";
    });
    sheets.push({ text: rest, basePath, book });
  };

  for (const { doc, basePath, book: chapterBook } of chapterDocs) {
    const book = perBook ? chapterBook : null;
    // Linked stylesheets.
    for (const link of doc.querySelectorAll('link[rel~="stylesheet" i]')) {
      const href = link.getAttribute("href");
      if (!href) continue;
      const path = resolveHref(basePath, href);
      if (seen.has(path)) continue;
      seen.add(path);
      const text = archive.text(path);
      if (text !== null) addSheet(text, path, book);
    }
    // Inline <style>.
    for (const style of doc.querySelectorAll("style")) {
      const text = style.textContent ?? "";
      const key = `inline:${book}:` + hashish(text);
      if (!text.trim() || seen.has(key)) continue;
      seen.add(key);
      addSheet(text, basePath, book);
    }
  }

  const byPath = new Map<string, ManifestItem>();
  for (const item of manifest.values()) byPath.set(item.href, item);

  const parts = sheets.map((s) =>
    transformSheet(s, archive, byPath, fontResolver, idSections),
  );
  const darkText = perBook
    ? parts.map((p, i) => scopeDarkCss(p.dark, sheets[i]!.book)).filter(Boolean).join("\n")
    : scopeDarkCss(parts.map((p) => p.dark).filter(Boolean).join("\n"));
  return { styleText: parts.map((p) => p.light).join("\n\n"), darkText };
}

interface Hoisted {
  fontFaces: string[];
  imports: string[];
  namespaces: string[];
}

/** Transform a single stylesheet into scoped CSS text. */
function transformSheet(
  sheet: RawSheet,
  archive: Archive,
  byPath: Map<string, ManifestItem>,
  fontResolver: (zipPath: string) => string | null,
  idSections: Map<string, string[]>,
): { light: string; dark: string } {
  let css = sheet.text;

  // 1) Rewrite url() against the CSS file's own directory.
  css = rewriteUrls(css, sheet.basePath, archive, byPath, fontResolver);

  // Nothing may load from the network (fonts, backgrounds, remote sheets).
  css = stripRemoteUrls(css);

  // 2) Drop @page blocks (irrelevant to continuous scroll).
  css = stripAtRule(css, "page");

  // 3) Strip copy restrictions.
  css = css.replace(/(-webkit-)?user-select\s*:\s*none\s*;?/gi, "");
  css = stripViewportHeights(css);

  // 4) Hoist @font-face / @import / @namespace out of the scope block.
  const hoisted: Hoisted = { fontFaces: [], imports: [], namespaces: [] };
  css = extractFontFaces(css, hoisted);
  css = extractImports(css, hoisted);
  css = extractNamespaces(css, hoisted);

  // 5) Fix html/body/:root selectors to :scope, and #id to prefixed ids.
  css = mapPreludes(css, (p) => rewriteIdSelectors(rewriteRootPrelude(p, sheet.book !== null), idSections));

  // The reader owns the page colour (in both themes), so drop the book's
  // html/body backgrounds, then derive the dark-theme colour overrides.
  css = stripRootBackgrounds(css);
  const dark = buildDarkCss(css);

  // 6) Wrap the remaining rules in @scope.
  const scoped = `@scope ${scopeFor(SCOPE_ROOT, sheet.book)} {\n${css}\n}`;

  // Hoisted rules live outside @scope (they must, per CSS rules).
  const light = [
    ...hoisted.namespaces,
    ...hoisted.imports,
    ...hoisted.fontFaces,
    scoped,
  ].join("\n");
  return { light, dark };
}

/** Wrap dark-theme rules so they apply only while the container is `.dark`. */
export function scopeDarkCss(rules: string, book: number | null = null): string {
  return rules.trim() ? `@scope ${scopeFor(DARK_SCOPE_ROOT, book)} {\n${rules}\n}` : "";
}

/**
 * Drop height / min-height / max-height declarations that use viewport units
 * (e.g. a cover image at `height: 98vh`). They mean "fill one screen", which
 * only makes sense when paginated; in a continuous column whose width the
 * reader controls they distort or letterbox the content. Works on stylesheet
 * text and on inline `style` attribute values alike.
 */
export function stripViewportHeights(css: string): string {
  return css.replace(
    /(?<![\w-])(?:min-|max-)?height\s*:(?=[^;}]*?\d(?:vh|dvh|svh|lvh|vmin|vmax)\b)[^;}]*;?/gi,
    "",
  );
}

/**
 * Remove references to the network from stylesheet text or an inline `style` value:
 * remote `@import`s go, and remote `url()`s (and bare strings in image-set()) become
 * an empty data: URL. The page's CSP blocks them too; this keeps the output clean.
 */
export function stripRemoteUrls(css: string): string {
  const remote = String.raw`(?:(?:https?|ftp|file):|\/\/)`;
  return css
    .replace(new RegExp(String.raw`@import\s+(?:url\(\s*)?["']?\s*${remote}[^;]*;?`, "gi"), "")
    .replace(new RegExp(String.raw`url\(\s*["']?\s*${remote}[^)]*\)`, "gi"), 'url("data:,")')
    .replace(new RegExp(String.raw`(image-set\(\s*|,\s*)["']\s*${remote}[^"']*["']`, "gi"), '$1"data:,"');
}

/** Rewrite url(...) tokens to data: URIs resolved against baseDir. */
function rewriteUrls(
  css: string,
  basePath: string | null,
  archive: Archive,
  byPath: Map<string, ManifestItem>,
  fontResolver: (zipPath: string) => string | null,
): string {
  if (!basePath) return css;
  const baseDir = dirOf(basePath);
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, _q, url: string) => {
    const trimmed = url.trim();
    if (/^(data:|https?:|#)/i.test(trimmed)) return match;
    const zipPath = resolveHref(baseDir + "/x", trimmed); // resolve relative to baseDir
    // Prefer the font resolver (handles deobfuscation); fall back to raw bytes.
    const viaFont = fontResolver(zipPath);
    if (viaFont) return `url(${viaFont})`;
    const bytes = archive.bytes(zipPath);
    if (!bytes) return match;
    const mime = mimeForPath(zipPath, byPath.get(zipPath)?.mediaType);
    return `url(data:${mime};base64,${base64FromBytes(bytes)})`;
  });
}

/**
 * Apply `fn` to every rule prelude (selector text before a `{`) at any nesting
 * depth, including the first rule inside @media or @supports. Comments,
 * strings and parenthesised values (e.g. url(...)) are skipped over untouched.
 */
function mapPreludes(css: string, fn: (prelude: string) => string): string {
  let out = "";
  let start = 0; // start of the current prelude / declaration segment
  let depth = 0; // parenthesis depth
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
      if (depth > 0) depth--;
    } else if (depth === 0 && c === "{") {
      out += fn(css.slice(start, i)) + "{";
      start = i + 1;
    } else if (depth === 0 && (c === "}" || c === ";")) {
      out += css.slice(start, i + 1);
      start = i + 1;
    }
  }
  return out + css.slice(start);
}

/**
 * Map html/body/:root selectors onto the merged document. `html`, `:root` and
 * a bare `body` become :scope (the one book container); a `body` that needs
 * the chapter's own class/id/attributes (`body.cover`) or its direct children
 * (`body > p`) becomes the chapter section, which is what carries them.
 * With `perBook` the container is shared by other books, so `html`/`:root`/
 * `body` become the chapter sections too, which the scope limits to this book.
 */
function rewriteRootPrelude(prelude: string, perBook: boolean): string {
  if (prelude.trimStart().startsWith("@")) return prelude;
  const rewritten = prelude
    .replace(/(^|[\s>+~(,])body(?![\w-])(?=[.#[:]|\s*>)/gi, `$1${CHAPTER_ROOT}`)
    .replace(/(^|[\s>+~(,])(?:html|body|:root)(?![\w-])/gi, "$1:scope")
    // `html body` / `html > body` collapse to the one real root.
    .replace(/:scope(?:\s*>\s*|\s+):scope/g, ":scope");
  return perBook ? rewritten.replace(/:scope(?![\w-])/g, CHAPTER_ROOT) : rewritten;
}

/**
 * Rewrite `#id` selectors to the prefixed ids of the chapters that contain
 * that id. Ids found in no chapter are left alone (they can't match anyway).
 */
function rewriteIdSelectors(prelude: string, idSections: Map<string, string[]>): string {
  if (prelude.trimStart().startsWith("@")) return prelude;
  // Strings and comments are matched first so a `#` inside them is untouched.
  return prelude.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|#((?:\\[0-9a-f]{1,6}\s?|\\.|[\w-]|[^\u0000-\u007f])+)/gi,
    (m, ident: string | undefined) => {
      if (ident === undefined) return m;
      const id = ident.replace(/\\(?:([0-9a-f]{1,6})\s?|(.))/gi, (_e, hex: string, ch: string) =>
        hex ? String.fromCodePoint(parseInt(hex, 16)) : ch,
      );
      const sections = idSections.get(id);
      if (!sections) return m;
      const ids = sections.map((sec) => `#${sec}--${ident}`);
      return ids.length === 1 ? ids[0]! : `:is(${ids.join(", ")})`;
    },
  );
}

/** Remove an at-rule and its block, e.g. @page { ... }. */
function stripAtRule(css: string, name: string): string {
  const re = new RegExp(`@${name}\\b[^{]*\\{`, "gi");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    out += css.slice(last, m.index);
    // find matching close brace
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    last = i;
    re.lastIndex = i;
  }
  out += css.slice(last);
  return out;
}

/** Pull @font-face blocks out into hoisted.fontFaces, removing from css. */
function extractFontFaces(css: string, hoisted: Hoisted): string {
  return extractBlocks(css, /@font-face\b[^{]*\{/gi, hoisted.fontFaces);
}

function extractBlocks(css: string, opener: RegExp, sink: string[]): string {
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = opener.exec(css))) {
    out += css.slice(last, m.index);
    let depth = 1;
    let i = opener.lastIndex;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    sink.push(css.slice(m.index, i));
    last = i;
    opener.lastIndex = i;
  }
  out += css.slice(last);
  return out;
}

/** Pull @import statements (terminated by ;) into hoisted.imports. */
function extractImports(css: string, hoisted: Hoisted): string {
  return css.replace(/@import\b[^;]*;/gi, (m) => {
    hoisted.imports.push(m);
    return "";
  });
}

/** Pull @namespace statements into hoisted.namespaces. */
function extractNamespaces(css: string, hoisted: Hoisted): string {
  return css.replace(/@namespace\b[^;]*;/gi, (m) => {
    hoisted.namespaces.push(m);
    return "";
  });
}

/** Cheap non-crypto content hash for dedup keys. */
function hashish(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
