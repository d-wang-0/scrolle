// Footnote detection for the popup. The compiler only preserves note
// semantics (`epub:type` / ARIA roles); this is where they get interpreted.

import { anchorTarget } from "./reader.svelte.js";

const OPS_NS = "http://www.idpf.org/2007/ops";
const NOTE_TYPES = new Set(["footnote", "endnote", "rearnote", "note"]);
const NOTE_ROLES = new Set(["doc-footnote", "doc-endnote"]);
const BLOCK_TAGS = new Set(["P", "LI", "DIV", "ASIDE", "BLOCKQUOTE", "DD", "TD"]);

export interface Note {
  /** The link that was clicked; the popup is positioned against it. */
  anchor: HTMLElement;
  /** In-page href of the real note, for "Go to note". */
  href: string;
  /** Detached `.epub-book` wrapper holding a copy of the note. */
  content: HTMLElement;
}

/** Elements grouped by their pre-merge id (the part after `ch{N}--`). */
type IdIndex = Map<string, HTMLElement[]>;

const originalId = (id: string): string => id.replace(/^ch\d+--/, "");

function indexIds(root: ParentNode): IdIndex {
  const index: IdIndex = new Map();
  for (const el of root.querySelectorAll<HTMLElement>("[id]")) {
    const key = originalId(el.id);
    const group = index.get(key);
    if (group) group.push(el);
    else index.set(key, [el]);
  }
  return index;
}

function tokens(value: string | null): string[] {
  return (value ?? "").split(/\s+/).filter(Boolean);
}

function epubTypes(el: Element): string[] {
  return tokens(el.getAttributeNS(OPS_NS, "type") ?? el.getAttribute("epub:type"));
}

function roles(el: Element): string[] {
  return tokens(el.getAttribute("role"));
}

const isNoteRef = (el: Element): boolean => epubTypes(el).includes("noteref") || roles(el).includes("doc-noteref");
const isBacklink = (el: Element): boolean => epubTypes(el).includes("backlink") || roles(el).includes("doc-backlink");
const isNoteContainer = (el: Element): boolean =>
  epubTypes(el).some((t) => NOTE_TYPES.has(t)) || roles(el).some((r) => NOTE_ROLES.has(r));

const isChapterRoot = (el: Element): boolean => el.matches("section[data-href], .epub-book");

const hasContent = (el: Element): boolean => (el.textContent ?? "").trim() !== "" || el.querySelector("img, svg") !== null;

/** Nearest ancestor-or-self of `from` (within its chapter) satisfying `test`. */
function closestWithin(from: HTMLElement, test: (el: HTMLElement) => boolean): HTMLElement | null {
  for (let el: HTMLElement | null = from; el && !isChapterRoot(el); el = el.parentElement) {
    if (test(el)) return el;
  }
  return null;
}

/** Resolve every note link in the rendered book up front, so a click is a lookup. */
export function buildNoteIndex(root: ParentNode): Map<Element, Note> {
  const ids = indexIds(root);
  const index = new Map<Element, Note>();
  for (const link of root.querySelectorAll("a[href^='#']")) {
    const note = noteFor(link, ids);
    if (note) index.set(link, note);
  }
  return index;
}

/**
 * The note a link points at, or null if it is an ordinary link (or the note
 * has no text anywhere).
 *
 * Calibre can split long files at page breaks and keep the split-point's
 * ancestors in both halves, id included. An endnote `<li>` cut that way leaves
 * an empty shell with the same original id in the first file, which is where
 * links end up. When the target is empty, the real note is whichever other
 * element shares its original id and has content.
 */
export function noteFor(link: Element, ids: IdIndex = indexIds(document)): Note | null {
  const href = link.getAttribute("href");
  if (!href?.startsWith("#") || isBacklink(link)) return null;
  const target = anchorTarget(href);
  if (!target) return null;

  // Links inside a note (back-references, cross-references) just navigate.
  if (!isNoteRef(link) && closestWithin(link as HTMLElement, isNoteContainer)) return null;

  // The block a target element stands for: its note container, or (for a link
  // marked as a note reference whose target carries no note semantics, such as
  // an empty `<a id>` before the text) the paragraph-level block around it.
  const sourceOf = (el: HTMLElement): HTMLElement | null =>
    closestWithin(el, isNoteContainer) ??
    (isNoteRef(link) ? (closestWithin(el, (b) => BLOCK_TAGS.has(b.tagName)) ?? el) : null);

  let found: { source: HTMLElement; id: string } | null = null;
  for (const candidate of [target, ...(ids.get(originalId(target.id)) ?? []).filter((el) => el !== target)]) {
    const source = sourceOf(candidate);
    if (source && hasContent(source)) {
      found = { source, id: candidate.id };
      break;
    }
  }
  if (!found) return null;

  const copy = found.source.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  for (const el of copy.querySelectorAll("[id]")) el.removeAttribute("id");
  for (const el of copy.querySelectorAll("a")) if (isBacklink(el)) el.remove();

  // Rebuild the book structure around the copy so the book's scoped CSS
  // (including chapter-body class rules and the dark theme) still applies.
  const content = document.createElement("div");
  content.className = "epub-book";
  const section = document.createElement("section");
  const chapter = found.source.closest("section[data-href]");
  section.setAttribute("data-href", chapter?.getAttribute("data-href") ?? "");
  if (chapter) section.className = chapter.className;
  const book = chapter?.getAttribute("data-book");
  if (book != null) section.setAttribute("data-book", book);
  if (copy.tagName === "LI") {
    const list = document.createElement("ul");
    list.style.cssText = "list-style: none; margin: 0; padding: 0";
    list.appendChild(copy);
    section.appendChild(list);
  } else {
    section.appendChild(copy);
  }
  content.appendChild(section);

  return { anchor: link as HTMLElement, href: `#${found.id}`, content };
}
