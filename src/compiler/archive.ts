// Thin wrapper over fflate's unzip, exposing entries by decoded zip path.
// An Archive also caches what compiling derives from its entries (parsed
// documents, blob URLs), so a book recompiled into a new set reuses them.

import { unzipSync, strFromU8 } from "fflate";

export class Archive {
  private entries: Map<string, Uint8Array>;
  /** For a merged set: each book's archive, seen under the directory `b{N}/`. */
  private parts: Archive[];
  private docs = new Map<string, Document | null>();
  private urls = new Map<string, string>();

  private constructor(entries: Map<string, Uint8Array>, parts: Archive[] = []) {
    this.entries = entries;
    this.parts = parts;
  }

  /** Unzip EPUB bytes into an Archive. */
  static open(bytes: Uint8Array): Archive {
    const raw = unzipSync(bytes);
    const entries = new Map<string, Uint8Array>();
    for (const name of Object.keys(raw)) {
      // fflate keys are the raw zip names (already forward-slash, undecoded
      // percent-escapes are rare in practice but normalize just in case).
      entries.set(name, raw[name]!);
    }
    return new Archive(entries);
  }

  /** Build an Archive from already-extracted entries (see book.ts). */
  static fromEntries(entries: Map<string, Uint8Array>): Archive {
    return new Archive(entries);
  }

  /** A view of several archives, book N's entries under `b{N}/` (see merge.ts).
   *  Lookups and caches go to the owning archive, so they outlive the view. */
  static merged(parts: Archive[]): Archive {
    return new Archive(new Map(), parts);
  }

  /** The archive that holds `path`, and the path within it. */
  private locate(path: string): [Archive, string] | null {
    if (!this.parts.length) return [this, path];
    const m = /^b(\d+)\/(.*)$/s.exec(path);
    const part = m ? this.parts[Number(m[1])] : undefined;
    return part ? part.locate(m![2]!) : null;
  }

  /** Every entry as [zip path, bytes]. */
  entriesList(): [string, Uint8Array][] {
    if (!this.parts.length) return [...this.entries];
    return this.parts.flatMap((p, i) => p.entriesList().map(([path, b]): [string, Uint8Array] => [`b${i}/${path}`, b]));
  }

  has(path: string): boolean {
    return this.bytes(path) !== null;
  }

  /** Get raw bytes for a zip path, or null if absent. */
  bytes(path: string): Uint8Array | null {
    const at = this.locate(path);
    return at ? (at[0].entries.get(at[1]) ?? null) : null;
  }

  /** Get a UTF-8 text entry, or null if absent. */
  text(path: string): string | null {
    const b = this.bytes(path);
    return b ? strFromU8(b) : null;
  }

  /** The text entry at `path` parsed with `parse`, cached. Callers must not
   *  modify the document: later compiles get the same one. */
  doc(path: string, parse: (text: string) => Document): Document | null {
    const at = this.locate(path);
    if (!at) return null;
    const [owner, own] = at;
    if (!owner.docs.has(own)) {
      const text = owner.text(own);
      owner.docs.set(own, text === null ? null : parse(text));
    }
    return owner.docs.get(own)!;
  }

  /** A blob: URL for the entry at `path`, made once and kept until dispose(). */
  blobUrl(path: string, mime: string): string | null {
    const at = this.locate(path);
    const bytes = at && at[0].entries.get(at[1]);
    if (!bytes) return null;
    const [owner, own] = at;
    let url = owner.urls.get(own);
    if (!url) {
      url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
      owner.urls.set(own, url);
    }
    return url;
  }

  /** Revoke this archive's blob URLs. A merged view owns none. */
  dispose(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }

  /** All entry paths (for debugging). */
  list(): string[] {
    return this.entriesList().map(([path]) => path);
  }
}
