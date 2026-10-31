// Resolve EPUB resource zip paths to data: URIs, cached so repeated references
// (e.g. the same stylesheet or cover image) reuse a single encoded string.
//
// Exports inline everything as data: URIs so the output is self-contained; the
// live reader uses blob: URLs (see ResourceMode).

import type { Archive } from "./archive.js";
import type { ManifestItem } from "./types.js";
import { mimeForPath } from "./media.js";

/** How resources are referenced: inlined `data:` URIs (self-contained, for
 *  export) or `blob:` URLs (the live reader; a big book's inlined base64 can
 *  exceed the engine's maximum string length). */
export type ResourceMode = "data" | "blob";

export class ResourceResolver {
  private mode: ResourceMode;
  private archive: Archive;
  private byPath: Map<string, ManifestItem>;
  private cache = new Map<string, string | null>();

  constructor(archive: Archive, manifest: Map<string, ManifestItem>, mode: ResourceMode = "data") {
    this.mode = mode;
    this.archive = archive;
    this.byPath = new Map();
    for (const item of manifest.values()) this.byPath.set(item.href, item);
  }

  /**
   * Return a data: URI for a resource at the given absolute zip path, or null
   * if the resource is not present in the archive. Results are cached; blob:
   * URLs are cached by the archive itself, across compiles (see archive.ts).
   */
  dataUri(zipPath: string): string | null {
    if (this.cache.has(zipPath)) return this.cache.get(zipPath)!;
    const bytes = this.archive.bytes(zipPath);
    if (!bytes) {
      this.cache.set(zipPath, null);
      return null;
    }
    const mime = mimeForPath(zipPath, this.byPath.get(zipPath)?.mediaType);
    const uri =
      this.mode === "blob"
        ? this.archive.blobUrl(zipPath, mime)
        : `data:${mime};base64,${base64FromBytes(bytes)}`;
    this.cache.set(zipPath, uri);
    return uri;
  }

  /** Access the raw bytes behind a path (used by CSS url() rewriting). */
  bytes(zipPath: string): Uint8Array | null {
    return this.archive.bytes(zipPath);
  }
}

/**
 * Base64-encode bytes. Uses btoa on a binary string built in chunks to avoid
 * "Maximum call stack size exceeded" on large assets from spreading a big
 * Uint8Array into String.fromCharCode.
 */
export function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000; // 32k chars per call
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
