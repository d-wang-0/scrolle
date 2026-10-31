// Public compiler entry point and the standalone-HTML serializer.

import { Book } from "./book.js";
import { transform } from "./transform.js";
import { mergeEpubs } from "./merge.js";
import type { CompileResult } from "./types.js";
import type { ResourceMode } from "./resources.js";

type Source = Uint8Array | Book;

/** Compile EPUBs (bytes, or Books opened earlier) into a { fragment, toc, metadata }.
 *  With the default `data` mode the fragment is self-contained; `blob` mode
 *  references resources by object URL, owned by the Book (see Book.dispose), and
 *  suits only the live reader. Several EPUBs are merged, in order, into one
 *  omnibus book (see merge.ts). */
export function compile(books: Source | Source[], mode: ResourceMode = "data"): CompileResult {
  const list = (Array.isArray(books) ? books : [books]).map((b) => (b instanceof Book ? b : Book.open(b)));
  if (list.length > 1) {
    const { structure, archive } = mergeEpubs(list);
    return transform(structure, archive, mode);
  }
  const { structure, archive } = list[0]!;
  return transform(structure, archive, mode);
}

/**
 * Serialize a CompileResult into a standalone HTML document string. Because all
 * resources are inlined as data: URIs, the output opens in any browser with no
 * external dependencies. Used for inspection/validation and as the export.
 * `dark` selects the theme the file opens in (default: dark).
 */
export function serializeToHtml(result: CompileResult, { dark = true }: { dark?: boolean } = {}): string {
  const { metadata, fragment } = result;
  const doc = document.implementation.createHTMLDocument(metadata.title ?? "EPUB");

  // <head> metadata.
  const meta = doc.createElement("meta");
  meta.setAttribute("charset", "utf-8");
  doc.head.appendChild(meta);
  const viewport = doc.createElement("meta");
  viewport.setAttribute("name", "viewport");
  viewport.setAttribute("content", "width=device-width, initial-scale=1");
  doc.head.appendChild(viewport);
  // A static page: no scripts, nothing from the network.
  const csp = doc.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute("content", "default-src 'none'; img-src data:; media-src data:; font-src data:; style-src 'unsafe-inline'");
  doc.head.appendChild(csp);
  if (metadata.language) doc.documentElement.setAttribute("lang", metadata.language);

  // Reading defaults for the standalone file: a comfortable base size (EPUB
  // CSS sizes text in ems relative to this) and a centred reading column.
  const base = doc.createElement("style");
  // The reader owns the page colours; the book's inverted dark CSS (scoped to
  // `.epub-book.dark`) overrides the :where() defaults below.
  base.textContent = [
    "body { margin: 0; background: " + (dark ? "#000" : "#fff") + "; }",
    ":where(.epub-book) { background: #fff; color: #111; }",
    ":where(.epub-book.dark) { background: #000; color: #e8e8e8; }",
    ".epub-book { font-size: 1.25rem; max-width: 42rem; margin: 2rem auto; padding: 0 1.25rem; }",
    ".epub-book > section { margin-block: 2rem; }",
    ".epub-book img { max-width: 100%; height: auto; }",
  ].join("\n");
  doc.head.appendChild(base);

  // Body: a clone of the merged fragment, themed.
  doc.body.appendChild(fragment.cloneNode(true));
  doc.body.querySelector(".epub-book")?.classList.toggle("dark", dark);

  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
