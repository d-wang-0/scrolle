// Named highlight layers over the book (CSS Custom Highlight API: no DOM changes). Search paints its
// hits through this. A layer is styled in CSS with
// `::highlight(name)`; where layers overlap, the higher priority wins.

const supported = (): boolean => typeof CSS !== "undefined" && !!CSS.highlights && typeof Highlight !== "undefined";

/** Show `ranges` as the layer `name`, replacing what it showed before. An empty list removes the layer. */
export function setHighlight(name: string, ranges: Range[], priority = 0): void {
  if (!supported()) return;
  if (!ranges.length) {
    CSS.highlights.delete(name);
    return;
  }
  const layer = new Highlight(...ranges);
  layer.priority = priority;
  CSS.highlights.set(name, layer);
}

export function clearHighlight(name: string): void {
  if (supported()) CSS.highlights.delete(name);
}
