// Parse an EPUB's structure: container -> OPF (manifest/spine/metadata) -> TOC.

import { Archive } from "./archive.js";
import { parseXml, firstByLocal, allByLocal, childrenByLocal, attr } from "./xml.js";
import { resolveHref, splitFragment, normalize } from "./paths.js";
import type {
  EpubStructure,
  ManifestItem,
  SpineItem,
  TocNode,
  Metadata,
} from "./types.js";

const CONTAINER_PATH = "META-INF/container.xml";

/** Parse EPUB bytes into its structural model. */
export function parseEpub(source: Uint8Array | Archive): EpubStructure {
  const archive = source instanceof Archive ? source : Archive.open(source);

  const opfPath = findOpfPath(archive);
  const opfText = archive.text(opfPath);
  if (opfText === null) throw new Error(`OPF not found at ${opfPath}`);
  const opf = parseXml(opfText);

  const pkg = firstByLocal(opf, "package");
  if (!pkg) throw new Error("OPF has no <package> element");
  const epubVersion = attr(pkg, "version");

  const manifest = parseManifest(opf, opfPath);
  const spine = parseSpine(opf, manifest);
  const metadata = parseMetadata(opf, manifest, opfPath, epubVersion);
  const toc = parseToc(archive, opf, manifest, opfPath);

  return { metadata, manifest, spine, toc, opfPath };
}

/** Read META-INF/container.xml to locate the OPF package document. */
function findOpfPath(archive: Archive): string {
  const containerText = archive.text(CONTAINER_PATH);
  if (containerText === null) throw new Error("Missing META-INF/container.xml");
  const container = parseXml(containerText);
  const rootfile = firstByLocal(container, "rootfile");
  const fullPath = rootfile ? attr(rootfile, "full-path") : null;
  if (!fullPath) throw new Error("container.xml has no rootfile full-path");
  return normalize(decodeURIComponent(fullPath));
}

function parseManifest(opf: Document, opfPath: string): Map<string, ManifestItem> {
  const manifestEl = firstByLocal(opf, "manifest");
  if (!manifestEl) throw new Error("OPF has no <manifest>");
  const map = new Map<string, ManifestItem>();
  for (const el of childrenByLocal(manifestEl, "item")) {
    const id = attr(el, "id");
    const rawHref = attr(el, "href");
    if (!id || rawHref === null) continue;
    const item: ManifestItem = {
      id,
      rawHref,
      href: resolveHref(opfPath, rawHref),
      mediaType: attr(el, "media-type") ?? "",
      properties: (attr(el, "properties") ?? "").split(/\s+/).filter(Boolean),
      fallback: attr(el, "fallback"),
    };
    map.set(id, item);
  }
  return map;
}

function parseSpine(opf: Document, manifest: Map<string, ManifestItem>): SpineItem[] {
  const spineEl = firstByLocal(opf, "spine");
  if (!spineEl) throw new Error("OPF has no <spine>");
  const out: SpineItem[] = [];
  for (const el of childrenByLocal(spineEl, "itemref")) {
    const idref = attr(el, "idref");
    if (!idref) continue;
    const item = manifest.get(idref);
    if (!item) continue; // dangling idref; skip
    out.push({ item, linear: (attr(el, "linear") ?? "yes") !== "no" });
  }
  return out;
}

function parseMetadata(
  opf: Document,
  manifest: Map<string, ManifestItem>,
  opfPath: string,
  epubVersion: string | null,
): Metadata {
  const metaEl = firstByLocal(opf, "metadata");
  const text = (localName: string): string | null => {
    if (!metaEl) return null;
    const el = allByLocal(metaEl, localName)[0];
    return el?.textContent?.trim() ?? null;
  };

  const authors = metaEl
    ? allByLocal(metaEl, "creator")
        .map((e) => e.textContent?.trim() ?? "")
        .filter(Boolean)
    : [];

  // unique identifier: the <dc:identifier> whose id matches package
  // unique-identifier, falling back to the first identifier.
  const pkg = firstByLocal(opf, "package");
  const uniqueId = pkg ? attr(pkg, "unique-identifier") : null;
  let identifier: string | null = null;
  if (metaEl) {
    const ids = allByLocal(metaEl, "identifier");
    if (uniqueId) {
      identifier = ids.find((e) => e.getAttribute("id") === uniqueId)?.textContent?.trim() ?? null;
    }
    if (!identifier) identifier = ids[0]?.textContent?.trim() ?? null;
  }

  return {
    title: text("title"),
    identifier,
    language: text("language"),
    authors,
    publisher: text("publisher"),
    coverHref: findCover(opf, manifest, opfPath),
    epubVersion,
  };
}

/** Find the cover image via manifest properties or the legacy meta name=cover. */
function findCover(
  opf: Document,
  manifest: Map<string, ManifestItem>,
  _opfPath: string,
): string | null {
  // EPUB 3: manifest item with properties="cover-image".
  for (const item of manifest.values()) {
    if (item.properties.includes("cover-image")) return item.href;
  }
  // EPUB 2: <meta name="cover" content="manifest-id">.
  const metaEl = firstByLocal(opf, "metadata");
  if (metaEl) {
    for (const m of allByLocal(metaEl, "meta")) {
      if (m.getAttribute("name") === "cover") {
        const ref = m.getAttribute("content");
        const item = ref ? manifest.get(ref) : null;
        if (item) return item.href;
      }
    }
  }
  return null;
}

function parseToc(
  archive: Archive,
  opf: Document,
  manifest: Map<string, ManifestItem>,
  opfPath: string,
): TocNode[] {
  // Prefer EPUB 3 nav document (manifest item with properties="nav").
  const navItem = [...manifest.values()].find((i) => i.properties.includes("nav"));
  if (navItem) {
    const text = archive.text(navItem.href);
    if (text !== null) {
      try {
        const nav = parseNavDocument(text, navItem.href);
        if (nav.length) return nav;
      } catch {
        // fall through to NCX
      }
    }
  }

  // EPUB 2 fallback: NCX referenced by spine@toc.
  const spineEl = firstByLocal(opf, "spine");
  const ncxId = spineEl ? attr(spineEl, "toc") : null;
  const ncxItem = ncxId ? manifest.get(ncxId) : [...manifest.values()].find((i) => i.mediaType === "application/x-dtbncx+xml");
  if (ncxItem) {
    const text = archive.text(ncxItem.href);
    if (text !== null) {
      try {
        return parseNcx(text, ncxItem.href);
      } catch {
        return [];
      }
    }
  }
  void opfPath;
  return [];
}

/** Parse an EPUB 3 nav document's toc nav into a tree. */
function parseNavDocument(text: string, navPath: string): TocNode[] {
  const doc = parseXml(text, "application/xhtml+xml");
  // Find <nav epub:type="toc">, else the first <nav>.
  const navs = allByLocal(doc, "nav");
  let tocNav =
    navs.find((n) => (attr(n, "type") ?? "").split(/\s+/).includes("toc")) ?? navs[0];
  if (!tocNav) return [];
  const ol = childrenByLocal(tocNav, "ol")[0];
  return ol ? parseNavList(ol, navPath) : [];
}

function parseNavList(ol: Element, navPath: string): TocNode[] {
  const out: TocNode[] = [];
  for (const li of childrenByLocal(ol, "li")) {
    const a = childrenByLocal(li, "a")[0] ?? childrenByLocal(li, "span")[0];
    const rawHref = a ? attr(a, "href") : null;
    const node: TocNode = {
      label: (a?.textContent ?? "").replace(/\s+/g, " ").trim(),
      href: rawHref ? resolveWithFragment(navPath, rawHref) : null,
      children: [],
    };
    const childOl = childrenByLocal(li, "ol")[0];
    if (childOl) node.children = parseNavList(childOl, navPath);
    out.push(node);
  }
  return out;
}

/** Parse an EPUB 2 NCX navMap into a tree. */
function parseNcx(text: string, ncxPath: string): TocNode[] {
  const doc = parseXml(text);
  const navMap = firstByLocal(doc, "navMap");
  if (!navMap) return [];
  return parseNavPoints(navMap, ncxPath);
}

function parseNavPoints(parent: Element, ncxPath: string): TocNode[] {
  const out: TocNode[] = [];
  for (const np of childrenByLocal(parent, "navPoint")) {
    const labelEl = childrenByLocal(np, "navLabel")[0];
    const textEl = labelEl ? childrenByLocal(labelEl, "text")[0] : null;
    const contentEl = childrenByLocal(np, "content")[0];
    const src = contentEl ? attr(contentEl, "src") : null;
    const node: TocNode = {
      label: (textEl?.textContent ?? "").replace(/\s+/g, " ").trim(),
      href: src ? resolveWithFragment(ncxPath, src) : null,
      children: parseNavPoints(np, ncxPath),
    };
    out.push(node);
  }
  return out;
}

/** Resolve an href to an absolute zip path, preserving any fragment. */
function resolveWithFragment(basePath: string, href: string): string {
  const { fragment } = splitFragment(href);
  const path = resolveHref(basePath, href);
  return fragment ? `${path}#${fragment}` : path;
}
