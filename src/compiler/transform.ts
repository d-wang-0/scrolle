// Transform parsed EPUB spine documents into one merged, self-contained
// DocumentFragment: one <section> per content document, with content
// sanitised, ids prefixed to avoid cross-chapter collisions, internal
// references rewritten to in-page anchors, and resources inlined as data: URIs.
//
// CSS is not handled here: stylesheets are collected and scoped by css.ts.
//
// See docs/epub-spec-notes.md for the spec rules this implements.

import type { Archive } from "./archive.js";
import type { EpubStructure, SpineItem, TocNode, ManifestItem, CompileResult } from "./types.js";
import { parseXml, attr } from "./xml.js";
import { ResourceResolver, type ResourceMode } from "./resources.js";
import { isSvg, isContentDocument } from "./media.js";
import { resolveHref, splitFragment } from "./paths.js";
import { collectCss, scopeDarkCss, stripViewportHeights, stripRemoteUrls, SCOPE_ROOT } from "./css.js";
import { InlineDarkRules } from "./dark.js";
import { textLength, type TextLength } from "./text.js";

/** A section's text depends only on its source document, which the archive
 *  caches across compiles (see Archive.doc), so a recompile reuses the count. */
const lengthBySource = new WeakMap<Document, TextLength>();

/** A spine entry resolved to a renderable content document. */
interface Chapter {
  index: number; // 0-based section index
  book: number; // 0-based book of a merged set (always 0 for a single book)
  sectionId: string; // "ch{N}"
  item: ManifestItem;
  doc: Document;
  isSvg: boolean;
}

export function transform(
  epub: EpubStructure,
  archive: Archive,
  mode: ResourceMode = "data",
): CompileResult {
  // Fonts were already deobfuscated when the book was opened (see book.ts).
  const resolver = new ResourceResolver(archive, epub.manifest, mode);

  // Resolve spine items to renderable content documents (following manifest
  // fallbacks for foreign types), and parse each one.
  const chapters = collectChapters(epub, archive);

  // Pass 1: build maps the whole book shares.
  const chapterIndexByPath = new Map<string, number>();
  for (const ch of chapters) chapterIndexByPath.set(ch.item.href, ch.index);

  // Pass 2: transform each chapter's DOM in place and wrap in a section.
  const doc = document.implementation.createHTMLDocument("");
  const fragment = doc.createDocumentFragment();

  // Which chapters contain each (unprefixed) id, so CSS `#id` selectors can be
  // rewritten to the prefixed ids that exist. Mirrors the ids the transform
  // produces: every [id], <a name> targets, and the body's own id.
  const idSections = new Map<string, string[]>();
  for (const ch of chapters) {
    const ids = new Set<string>();
    for (const el of ch.doc.querySelectorAll("[id]")) ids.add(el.getAttribute("id")!);
    for (const el of ch.doc.querySelectorAll("a[name]:not([id])")) ids.add(el.getAttribute("name")!);
    for (const id of ids) {
      const list = idSections.get(id);
      if (list) list.push(ch.sectionId);
      else idSections.set(id, [ch.sectionId]);
    }
  }

  // In a merged set each book's CSS is confined to that book's sections.
  const perBook = (epub.books ?? 1) > 1;

  // Collect + scope the book's CSS, emitted once as a <style> before content.
  const css = collectCss(
    chapters.map((c) => ({ doc: c.doc, basePath: c.item.href, book: c.book })),
    archive,
    epub.manifest,
    (zipPath) => resolver.dataUri(zipPath),
    idSections,
    perBook,
  );

  // Scope container: the book's CSS is scoped to this element via @scope.
  const book = doc.createElement("div");
  book.className = SCOPE_ROOT.replace(/^\./, "");

  const inlineDark = new InlineDarkRules();
  const sectionCounts = new Array<number>(epub.books ?? 1).fill(0);
  const lengths: TextLength[] = [];
  for (const ch of chapters) {
    const section = buildSection(ch, doc, { resolver, chapterIndexByPath, inlineDark });
    if (perBook) section.setAttribute("data-book", String(ch.book));
    book.appendChild(section);
    sectionCounts[ch.book]!++;
    let length = lengthBySource.get(ch.doc);
    if (!length) {
      length = textLength(section);
      lengthBySource.set(ch.doc, length);
    }
    lengths.push(length);
  }

  // One <style> before the content: the book's light CSS, then the dark-theme
  // overrides (they must come after every light rule to win ties), including
  // those for inline colours collected while building sections.
  const styleText = [
    css.styleText,
    css.darkText,
    scopeDarkCss(inlineDark.css()),
  ]
    .filter((t) => t.trim())
    .join("\n\n");
  if (styleText) {
    const style = doc.createElement("style");
    style.textContent = styleText;
    fragment.appendChild(style);
  }
  fragment.appendChild(book);

  // Rewrite the TOC using the same path/fragment -> anchor mapping.
  const toc = rewriteToc(epub.toc, chapterIndexByPath);

  return { fragment, toc, metadata: epub.metadata, sectionCounts, lengths };
}

/** Resolve + parse spine items into renderable chapters. */
function collectChapters(epub: EpubStructure, archive: Archive): Chapter[] {
  const chapters: Chapter[] = [];
  let index = 0;
  for (const spineItem of epub.spine) {
    const content = resolveToContentDoc(spineItem, epub.manifest);
    if (!content) continue; // no renderable content document; skip
    // Cached by the archive, so a recompile (append/reorder) skips the parse.
    const parsed = archive.doc(content.href, parseContent);
    if (!parsed) continue;
    chapters.push({
      index,
      book: spineItem.book ?? 0,
      sectionId: `ch${index}`,
      item: content,
      doc: parsed,
      isSvg: isSvg(content.mediaType),
    });
    index++;
  }
  return chapters;
}

function parseContent(text: string): Document {
  try {
    return parseXml(text, "application/xhtml+xml");
  } catch {
    // Some EPUBs have malformed XHTML; fall back to lenient HTML parsing.
    return parseXml(text, "text/html");
  }
}

/**
 * Resolve a spine item to an EPUB content document, following the manifest
 * fallback chain (§3.5.1) if the item's own media type is foreign. Returns null
 * if no content document is reachable.
 */
function resolveToContentDoc(
  spineItem: SpineItem,
  manifest: Map<string, ManifestItem>,
): ManifestItem | null {
  let item: ManifestItem | null = spineItem.item;
  const seen = new Set<string>();
  while (item && !seen.has(item.id)) {
    if (isContentDocument(item.mediaType)) return item;
    seen.add(item.id);
    item = item.fallback ? (manifest.get(item.fallback) ?? null) : null;
  }
  return null;
}

interface SectionContext {
  resolver: ResourceResolver;
  chapterIndexByPath: Map<string, number>;
  inlineDark: InlineDarkRules;
}

/** Build one <section> for a chapter, with its DOM transformed. */
function buildSection(ch: Chapter, outDoc: Document, ctx: SectionContext): HTMLElement {
  const section = outDoc.createElement("section");
  section.id = ch.sectionId;
  section.setAttribute("data-href", ch.item.href);

  // Source root: XHTML -> <body>; SVG -> the root <svg>.
  const sourceRoot: Element | null = ch.isSvg
    ? ch.doc.documentElement
    : ch.doc.querySelector("body");
  if (!sourceRoot) return section;

  // For XHTML, carry the body's class/id/style onto the section so book rules
  // like `body.foo` / `.calibre` still match something after merging.
  if (!ch.isSvg) {
    const cls = sourceRoot.getAttribute("class");
    if (cls) section.className = cls;
    const style = sourceRoot.getAttribute("style");
    if (style) section.setAttribute("style", style);
    // Preserve body's epub:type as data, for styling.
    const etype = attr(sourceRoot, "type");
    if (etype) section.setAttribute("data-epub-type", etype);
    // The section's own id is ch{N}, so keep the body's id addressable (links
    // like `file.xhtml#bodyid`) via an empty anchor; ids are prefixed afterwards.
    const bodyId = sourceRoot.getAttribute("id");
    if (bodyId) {
      const anchor = outDoc.createElement("span");
      anchor.id = bodyId;
      section.appendChild(anchor);
    }
  }

  // Import the children (or the whole <svg>) into the output document.
  const importRoot = ch.isSvg ? sourceRoot : null;
  if (importRoot) {
    section.appendChild(outDoc.importNode(importRoot, true));
  } else {
    for (const child of [...sourceRoot.childNodes]) {
      section.appendChild(outDoc.importNode(child, true));
    }
  }

  transformSectionDom(section, ch, ctx);
  return section;
}

/** Sanitise, prefix ids, and rewrite references within a built section. */
function transformSectionDom(section: HTMLElement, ch: Chapter, ctx: SectionContext): void {
  const prefix = `${ch.sectionId}--`;

  // Inline styles: drop viewport-unit heights (see stripViewportHeights).
  for (const el of [section, ...section.querySelectorAll("[style]")]) {
    const style = el.getAttribute("style");
    if (!style) continue;
    const stripped = stripRemoteUrls(stripViewportHeights(style));
    if (stripped === style) continue;
    if (stripped.trim()) el.setAttribute("style", stripped);
    else el.removeAttribute("style");
  }

  // Dark theme: inline colours beat stylesheet rules, so each distinct set
  // gets a class carrying !important overrides (see InlineDarkRules). Legacy
  // presentational colour attributes are handled the same way.
  for (const el of [section, ...section.querySelectorAll("[style], [bgcolor], font[color]")]) {
    const decls = [
      el.getAttribute("style"),
      legacyColor(el.getAttribute("bgcolor"), "background-color"),
      el.localName === "font" ? legacyColor(el.getAttribute("color"), "color") : null,
    ]
      .filter(Boolean)
      .join("; ");
    const cls = decls ? ctx.inlineDark.classFor(decls) : null;
    if (cls) el.classList.add(cls);
  }

  // 1) Sanitise: drop scripts, anything that embeds another document or changes the
  // page itself, event handlers, and URLs that are not the book's own resources.
  // (<style>/<link> were already collected into the scoped sheet by collectCss; left
  // in place they would apply to the whole app, unscoped.)
  for (const el of [...section.querySelectorAll(DROPPED_ELEMENTS)]) el.remove();
  for (const el of section.querySelectorAll("*")) {
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase();
      if (name.startsWith("on") || DROPPED_ATTRIBUTES.has(name)) {
        el.removeAttribute(a.name);
      }
    }
  }

  // Legacy (XHTML 1.1 / EPUB 2) anchors use `name` as the link target; give
  // them an id so they're prefixed and addressable like any other target.
  for (const el of section.querySelectorAll("a[name]:not([id])")) {
    el.setAttribute("id", el.getAttribute("name")!);
  }

  // 2) Prefix every id so repeated ids across chapters don't collide.
  for (const el of section.querySelectorAll("[id]")) {
    const id = el.getAttribute("id")!;
    el.setAttribute("id", prefix + id);
  }

  // 3) Rewrite id-referencing attributes within this chapter.
  const idRefAttrs = ["aria-labelledby", "aria-describedby", "aria-owns", "aria-controls", "for", "headers"];
  for (const el of section.querySelectorAll("*")) {
    for (const name of idRefAttrs) {
      const v = el.getAttribute(name);
      if (v) el.setAttribute(name, v.split(/\s+/).map((t) => prefix + t).join(" "));
    }
  }

  // 4) Rewrite links and resource references.
  rewriteReferences(section, ch, ctx);

  // 5) Whatever still points outside the book is dropped: remote images, media and
  // scripts-by-URL must not load (no tracking pixels, no remote styling), and links
  // may only be http(s), mailto or tel.
  for (const el of section.querySelectorAll("*")) {
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase();
      if (URL_ATTRIBUTES.has(name) && !safeUrl(a.value, name, el.localName)) el.removeAttribute(a.name);
      else if (name === "srcset" && !safeSrcset(a.value)) el.removeAttribute(a.name);
    }
  }
}

const DROPPED_ELEMENTS =
  "script, style, link, base, meta, iframe, frame, frameset, object, embed, applet, portal, " +
  // SVG animation that rewrites an href after the sanitiser has looked at it.
  "animate[attributeName*='href' i], set[attributeName*='href' i]";
const DROPPED_ATTRIBUTES = new Set(["action", "formaction", "ping", "srcdoc", "background", "codebase", "longdesc"]);
const URL_ATTRIBUTES = new Set(["href", "xlink:href", "src", "poster"]);

/** True for a URL that may stay: links keep web/mail/phone targets, everything else only the book's own resources. */
function safeUrl(value: string, attr: string, tag: string): boolean {
  const v = value.trim();
  if (v.startsWith("#")) return true;
  if (/^(?:data:(?:image|audio|video)\/|blob:)/i.test(v)) return attr !== "href" || tag !== "a";
  if ((tag === "a" || tag === "area") && attr !== "src") {
    return /^(?:https?:|mailto:|tel:)/i.test(v) || !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(v);
  }
  return false;
}

/** A srcset with any remote candidate is dropped whole (data: URIs hold commas, so it can't be split reliably). */
function safeSrcset(srcset: string): string {
  return /(?:^|[\s,])(?:https?:|file:|ftp:|\/\/)/i.test(srcset) ? "" : srcset;
}

/** A `prop: value` declaration from a legacy colour attribute (`bgcolor`, `<font color>`). */
function legacyColor(value: string | null, prop: string): string | null {
  const v = value?.trim();
  if (!v) return null;
  // Legacy attributes allow bare hex without the leading `#`.
  return `${prop}: ${/^[0-9a-f]{6}$/i.test(v) ? "#" + v : v}`;
}

function rewriteReferences(section: HTMLElement, ch: Chapter, ctx: SectionContext): void {
  const base = ch.item.href;

  // Anchors / links with href.
  for (const el of section.querySelectorAll("[href]")) {
    const raw = el.getAttribute("href")!;
    if (isExternal(raw) || raw.startsWith("#")) {
      // In-chapter fragment -> prefixed anchor; external -> leave as is.
      if (raw.startsWith("#")) el.setAttribute("href", `#${ch.sectionId}--${raw.slice(1)}`);
      continue;
    }
    const anchor = internalAnchor(base, raw, ch, ctx.chapterIndexByPath);
    if (anchor !== null) el.setAttribute("href", anchor);
  }

  // Images and other src-based resources.
  for (const el of section.querySelectorAll("[src]")) {
    const raw = el.getAttribute("src")!;
    if (isExternal(raw) || raw.startsWith("data:")) continue;
    const uri = ctx.resolver.dataUri(resolveHref(base, raw));
    if (uri) el.setAttribute("src", uri);
  }

  // srcset (images / responsive).
  for (const el of section.querySelectorAll("[srcset]")) {
    const raw = el.getAttribute("srcset")!;
    el.setAttribute("srcset", rewriteSrcset(raw, base, ctx));
  }

  // SVG references: xlink:href / href on <image> and <use>.
  for (const el of section.querySelectorAll("image, use")) {
    for (const name of ["xlink:href", "href"]) {
      const v = el.getAttribute(name);
      if (v == null) continue;
      if (isExternal(v) || v.startsWith("data:")) continue;
      if (v.startsWith("#")) {
        // Plain `href` fragments were already prefixed by the [href] pass above.
        if (name !== "href") el.setAttribute(name, `#${ch.sectionId}--${v.slice(1)}`);
        continue;
      }
      // Resource (e.g. <image xlink:href="../img/x.png">).
      const uri = ctx.resolver.dataUri(resolveHref(base, v));
      if (uri) el.setAttribute(name, uri);
    }
  }
}

function rewriteSrcset(srcset: string, base: string, ctx: SectionContext): string {
  return srcset
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const [url, descriptor] = trimmed.split(/\s+/, 2);
      if (!url || isExternal(url) || url.startsWith("data:")) return trimmed;
      const uri = ctx.resolver.dataUri(resolveHref(base, url));
      const resolved = uri ?? url;
      return descriptor ? `${resolved} ${descriptor}` : resolved;
    })
    .join(", ");
}

/**
 * Compute the in-page anchor for an internal link. Returns "#ch{N}" or
 * "#ch{N}--{frag}" if the target resolves to a spine content document, else
 * null (leave the link as-is).
 */
function internalAnchor(
  baseFile: string,
  href: string,
  _ch: Chapter,
  chapterIndexByPath: Map<string, number>,
): string | null {
  const { fragment } = splitFragment(href);
  const targetPath = resolveHref(baseFile, href);
  const idx = chapterIndexByPath.get(targetPath);
  if (idx === undefined) return null; // not a spine doc (e.g. link into resource)
  return fragment ? `#ch${idx}--${fragment}` : `#ch${idx}`;
}

function rewriteToc(nodes: TocNode[], chapterIndexByPath: Map<string, number>): TocNode[] {
  return nodes.map((node) => {
    let href = node.href;
    if (href) {
      const { fragment } = splitFragment(href);
      const path = splitFragment(href).path;
      const idx = chapterIndexByPath.get(path);
      if (idx !== undefined) {
        href = fragment ? `#ch${idx}--${fragment}` : `#ch${idx}`;
      }
    }
    const out: TocNode = { label: node.label, href, children: rewriteToc(node.children, chapterIndexByPath) };
    if (node.book !== undefined) out.book = node.book;
    return out;
  });
}

/** True for absolute URLs with a scheme we should not rewrite as internal
 *  (http, mailto, etc.). data: is treated separately by callers. */
function isExternal(url: string): boolean {
  return /^(https?|mailto|tel|ftp|file):/i.test(url);
}
