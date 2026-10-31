// Selector constants shared between the CSS and dark-theme passes.

/** The selector that scopes book CSS to the rendered container. */
export const SCOPE_ROOT = ".epub-book";

/** The container while the dark theme is active (the reader adds `.dark`). */
export const DARK_SCOPE_ROOT = ".epub-book.dark";

/**
 * The `@scope` prelude for `root`. For a merged set of books, `book` limits it
 * to that book's sections (tagged `data-book`), so one book's CSS can't reach
 * another's; null scopes to the whole container.
 */
export function scopeFor(root: string, book: number | null): string {
  return book === null ? `(${root})` : `(${root}) to (:scope > section:not([data-book="${book}"]))`;
}

/** The element each chapter's <body> class/id/style was moved onto. */
export const CHAPTER_ROOT = ":where(section[data-href])";
