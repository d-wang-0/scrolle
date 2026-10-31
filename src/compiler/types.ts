// Core data types for the EPUB compiler.

import type { TextLength } from "./text.js";

/** A single entry in the OPF <manifest>. */
export interface ManifestItem {
  /** The manifest item's `id` attribute. */
  id: string;
  /** Absolute zip path (resolved against the OPF location, decoded). */
  href: string;
  /** The raw, undecoded href as written in the OPF (relative to OPF dir). */
  rawHref: string;
  /** MIME type, e.g. "application/xhtml+xml". */
  mediaType: string;
  /** Space-separated `properties` tokens, if any (e.g. "nav", "cover-image"). */
  properties: string[];
  /** The `fallback` idref (manifest fallback chain, §3.5.1), if any. */
  fallback: string | null;
}

/** A single entry in the OPF <spine>, in reading order. */
export interface SpineItem {
  /** The manifest item this spine entry references (idref), resolved. */
  item: ManifestItem;
  /** Whether the item is part of the linear reading order. */
  linear: boolean;
  /** Which book of a merged set this entry came from (absent for a single book). */
  book?: number;
}

/** A node in the table-of-contents tree. */
export interface TocNode {
  label: string;
  /** Target href as written in the nav/NCX (resolved to an absolute zip path,
   *  may include a fragment). */
  href: string | null;
  children: TocNode[];
  /** On a merged set's top-level entries: the index of the book the entry stands for. */
  book?: number;
}

/** Book metadata pulled from the OPF <metadata>. */
export interface Metadata {
  title: string | null;
  /** The book's unique identifier (dc:identifier referenced by unique-identifier). */
  identifier: string | null;
  language: string | null;
  authors: string[];
  publisher: string | null;
  /** Absolute zip path to the cover image, if determinable. */
  coverHref: string | null;
  /** EPUB version from the <package> element, e.g. "3.0" or "2.0". */
  epubVersion: string | null;
}

/** The parsed structure of an EPUB (container -> OPF -> manifest, spine, metadata, TOC). */
export interface EpubStructure {
  metadata: Metadata;
  manifest: Map<string, ManifestItem>;
  spine: SpineItem[];
  toc: TocNode[];
  /** Absolute zip path of the OPF file (the package document). */
  opfPath: string;
  /** Number of books merged into this structure (absent for a single book). */
  books?: number;
}

/** The compiled, self-contained output. */
export interface CompileResult {
  /** Merged document fragment: one <section> per spine content document,
   *  with resources inlined and references rewritten to in-page anchors. */
  fragment: DocumentFragment;
  /** TOC tree with hrefs rewritten to in-page anchors (#ch{N} / #ch{N}--id). */
  toc: TocNode[];
  metadata: Metadata;
  /** Number of sections from each book of the set, in order (one entry for a single book). */
  sectionCounts: number[];
  /** Text length of each section, in order. */
  lengths: TextLength[];
}
