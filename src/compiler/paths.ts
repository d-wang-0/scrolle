// Path resolution for EPUB internals.
//
// EPUB hrefs are relative to the file that contains them (the OPF, a chapter,
// or a CSS file) and are URL-encoded. Zip entry names are plain, decoded,
// forward-slash paths. So: resolve the href against the containing file's
// directory, strip any fragment/query, then decodeURIComponent before using it
// as a zip key.

/** Return the directory portion of a zip path ("" for a root-level file). */
export function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Split an href into its path and fragment ("#foo") parts. */
export function splitFragment(href: string): { path: string; fragment: string | null } {
  const i = href.indexOf("#");
  if (i === -1) return { path: href, fragment: null };
  return { path: href.slice(0, i), fragment: href.slice(i + 1) };
}

/**
 * Resolve a possibly-relative, URL-encoded href against a base *file* path,
 * returning a decoded, absolute zip path (no fragment, no query).
 *
 * @param baseFilePath the zip path of the file containing the href
 * @param href the href as written in that file
 */
export function resolveHref(baseFilePath: string, href: string): string {
  const { path } = splitFragment(href);
  const decoded = safeDecode(path.split("?")[0] ?? path);
  return normalize(joinFrom(dirOf(baseFilePath), decoded));
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Join a relative path onto a base directory (both decoded). */
function joinFrom(baseDir: string, rel: string): string {
  if (rel.startsWith("/")) return rel.slice(1);
  return baseDir ? `${baseDir}/${rel}` : rel;
}

/** Collapse "." and ".." segments. */
export function normalize(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}
