// One opened EPUB: unzipped, structure parsed, obfuscated fonts undone. The
// reader keeps these between compiles so appending or reordering books doesn't
// unzip and parse the books already open again.

import { Archive } from "./archive.js";
import { parseEpub } from "./parse.js";
import { readEncryptionList, deobfuscate } from "./fonts.js";
import type { EpubStructure } from "./types.js";

export class Book {
  readonly archive: Archive;
  readonly structure: EpubStructure;

  private constructor(archive: Archive, structure: EpubStructure) {
    this.archive = archive;
    this.structure = structure;
  }

  static open(bytes: Uint8Array): Book {
    const source = Archive.open(bytes);
    const structure = parseEpub(source);
    // Font obfuscation keys come from the book's identifier, so undo it here,
    // once; compiling never sees obfuscated bytes.
    const encrypted = readEncryptionList(source);
    if (!encrypted.size) return new Book(source, structure);
    const identifier = structure.metadata.identifier ?? "";
    const entries = new Map<string, Uint8Array>();
    for (const [path, data] of source.entriesList()) {
      const algo = encrypted.get(path);
      entries.set(path, algo ? deobfuscate(data, algo, identifier) : data);
    }
    return new Book(Archive.fromEntries(entries), structure);
  }

  /** Revoke the blob URLs made for this book's resources. */
  dispose(): void {
    this.archive.dispose();
  }
}
