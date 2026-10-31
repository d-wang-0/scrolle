// Media-type knowledge, per EPUB 3.3 §3.2 (core media types) and §6
// (content documents). See docs/epub-spec-notes.md.

/** MIME types that are valid EPUB content documents (renderable in the spine). */
export const XHTML_MEDIA_TYPE = "application/xhtml+xml";
export const SVG_MEDIA_TYPE = "image/svg+xml";

export function isXhtml(mediaType: string): boolean {
  return mediaType === XHTML_MEDIA_TYPE;
}

export function isSvg(mediaType: string): boolean {
  return mediaType === SVG_MEDIA_TYPE;
}

/** True if the media type is an EPUB content document (XHTML or SVG). */
export function isContentDocument(mediaType: string): boolean {
  return isXhtml(mediaType) || isSvg(mediaType);
}

/**
 * Map a file extension to a MIME type for building data: URIs. Covers the EPUB
 * core media types (§3.2) plus a few common extras. Falls back to
 * application/octet-stream.
 */
const EXT_TO_MIME: Record<string, string> = {
  // images
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  // fonts
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  // style / markup
  css: "text/css",
  xhtml: "application/xhtml+xml",
  html: "text/html",
  xml: "application/xml",
  // audio
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  ogg: "audio/ogg",
};

/** Best-effort MIME type for a zip path, preferring the manifest media-type. */
export function mimeForPath(path: string, manifestMediaType?: string): string {
  if (manifestMediaType) return manifestMediaType;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}
