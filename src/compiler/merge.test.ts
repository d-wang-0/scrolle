// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { compile } from "./compile.js";
import { Book } from "./book.js";

/** A minimal one-chapter EPUB 2 with its own stylesheet. */
function epub(title: string, author: string, css: string, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    ...extra,
    "mimetype": strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
    "OEBPS/content.opf": strToU8(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:identifier id="id">${title}-id</dc:identifier></metadata>
        <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="css" href="s.css" media-type="text/css"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest>
        <spine toc="ncx"><itemref idref="c1"/></spine></package>`,
    ),
    "OEBPS/toc.ncx": strToU8(
      `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="n1"><navLabel><text>Chapter One</text></navLabel><content src="c1.xhtml#top"/></navPoint></navMap></ncx>`,
    ),
    "OEBPS/s.css": strToU8(css),
    "OEBPS/c1.xhtml": strToU8(
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="s.css"/></head><body><h1 id="top">${title}</h1><p>Text</p></body></html>`,
    ),
  });
}

describe("@import in a book's stylesheet", () => {
  it("is inlined inside the scope instead of being hoisted unscoped", () => {
    const book = epub("Imp", "Ann", `@import url("m.css");\np { color: red }`, {
      "OEBPS/m.css": strToU8("body { font-family: serif }"),
    });
    const el = document.createElement("div");
    el.appendChild(compile(book).fragment.cloneNode(true));
    const css = el.querySelector("style")!.textContent!;
    expect(css).not.toContain("@import");
    expect(css).toMatch(/@scope \(\.epub-book\) \{[^]*:scope\s*\{\s*font-family: serif/);
  });
});

describe("compile with several books", () => {
  const a = epub("Alpha", "Ann", "p { color: red } body { margin: 0 }");
  const b = epub("Beta", "Bob", "p { color: blue }");
  const result = compile([a, b]);
  const root = document.createElement("div");
  root.appendChild(result.fragment.cloneNode(true));

  it("lays the books out as sections of one container, tagged by book", () => {
    const sections = [...root.querySelectorAll(".epub-book > section")];
    expect(sections.map((s) => [s.id, s.getAttribute("data-book")])).toEqual([
      ["ch0", "0"],
      ["ch1", "1"],
    ]);
    expect(root.querySelector("#ch1--top")?.textContent).toBe("Beta");
  });

  it("nests each book's contents under an entry for the book", () => {
    expect(result.toc.map((n) => n.label)).toEqual(["Alpha by Ann", "Beta by Bob"]);
    expect(result.toc.map((n) => n.href)).toEqual(["#ch0", "#ch1"]);
    expect(result.toc[1]!.children.map((n) => [n.label, n.href])).toEqual([["Chapter One", "#ch1--top"]]);
    expect(result.metadata.title).toBe("Alpha / Beta");
    expect(result.metadata.authors).toEqual(["Ann", "Bob"]);
  });

  it("confines each book's CSS to its own sections", () => {
    const css = root.querySelector("style")!.textContent!;
    expect(css).toContain(`@scope (.epub-book) to (:scope > section:not([data-book="0"]))`);
    expect(css).toContain(`@scope (.epub-book) to (:scope > section:not([data-book="1"]))`);
    // Book-level body rules target the chapter sections, not the shared container.
    expect(css).toMatch(/:where\(section\[data-href\]\)\s*\{\s*margin: 0/);
  });

  it("leaves a single book unscoped", () => {
    const single = document.createElement("div");
    single.appendChild(compile(a).fragment.cloneNode(true));
    expect(single.querySelector("style")!.textContent).toContain("@scope (.epub-book) {");
    expect(single.querySelector("section")!.hasAttribute("data-book")).toBe(false);
  });

  it("counts sections per book", () => {
    expect(result.sectionCounts).toEqual([1, 1]);
    expect(compile(a).sectionCounts).toEqual([1]);
    expect(result.lengths).toEqual([
      { chars: "AlphaText".length, words: 2 },
      { chars: "BetaText".length, words: 2 },
    ]);
  });

  it("recompiles opened books in a new order without changing them", () => {
    const books = [Book.open(a), Book.open(b)];
    const html = (r: ReturnType<typeof compile>): string => {
      const el = document.createElement("div");
      el.appendChild(r.fragment);
      return el.innerHTML;
    };
    const first = html(compile(books));
    const swapped = compile([books[1]!, books[0]!]);
    expect(swapped.toc.map((n) => n.label)).toEqual(["Beta by Bob", "Alpha by Ann"]);
    expect(html(compile(books))).toBe(first);
  });
});
