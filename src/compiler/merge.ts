// Merge several EPUBs into one: 
// every book's files move under their own directory, 
// manifest ids are prefixed, the spines are concatenated, 
// and each book's TOC is nested under an entry for the book.
// The result is an ordinary EpubStructure + Archive, so the rest of the
// compiler treats it as one (omnibus) book.

import { Archive } from "./archive.js";
import type { Book } from "./book.js";
import type { EpubStructure, ManifestItem, Metadata, SpineItem, TocNode } from "./types.js";

export function mergeEpubs(books: Book[]): { structure: EpubStructure; archive: Archive } {
  const manifest = new Map<string, ManifestItem>();
  const spine: SpineItem[] = [];
  const toc: TocNode[] = [];
  const parts = books.map((b) => b.structure);

  parts.forEach((part, book) => {
    const dir = `b${book}/`;
    const idPrefix = `b${book}:`;

    for (const [id, item] of part.manifest) {
      manifest.set(idPrefix + id, {
        ...item,
        id: idPrefix + id,
        href: dir + item.href,
        fallback: item.fallback ? idPrefix + item.fallback : null,
      });
    }
    for (const s of part.spine) {
      spine.push({ ...s, item: manifest.get(idPrefix + s.item.id)!, book });
    }
  });

  const authors = [...new Set(parts.flatMap((p) => p.metadata.authors))];
  parts.forEach((part, book) => {
    const first = spine.find((s) => s.book === book);
    const title = part.metadata.title ?? `Book ${book + 1}`;
    const by = authors.length > 1 && part.metadata.authors[0] ? ` by ${part.metadata.authors[0]}` : "";
    toc.push({
      label: title + by,
      href: first?.item.href ?? null,
      children: rebaseToc(part.toc, `b${book}/`),
      book,
    });
  });

  const first = parts[0]!;
  const metadata: Metadata = {
    title: parts.map((p) => p.metadata.title).filter(Boolean).join(" / ") || null,
    identifier: parts.map((p) => p.metadata.identifier).filter(Boolean).join("+") || null,
    language: first.metadata.language,
    authors,
    publisher: first.metadata.publisher,
    coverHref: first.metadata.coverHref ? `b0/${first.metadata.coverHref}` : null,
    epubVersion: first.metadata.epubVersion,
  };

  return {
    structure: { metadata, manifest, spine, toc, opfPath: `b0/${first.opfPath}`, books: parts.length },
    archive: Archive.merged(books.map((b) => b.archive)),
  };
}

function rebaseToc(nodes: TocNode[], dir: string): TocNode[] {
  return nodes.map((n) => ({
    label: n.label,
    href: n.href ? dir + n.href : null,
    children: rebaseToc(n.children, dir),
  }));
}
