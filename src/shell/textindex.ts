// A section of the book as one flat string, with a way back from offsets in that string to DOM ranges.
// The section's text nodes are concatenated (block boundaries become newlines, so text is joined across
// inline tags but never across paragraphs). Search works on offsets into this
// string, so they agree on where a piece of text is.

const SKIP = new Set(["style", "script", "template", "title", "desc"]);
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "details", "div", "dl", "dt", "figcaption",
  "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol",
  "p", "pre", "section", "summary", "table", "td", "th", "tr", "ul",
]);

export interface SectionText {
  el: HTMLElement;
  text: string;
  /** The non-empty text nodes in document order. */
  nodes: Text[];
  /** Start offset of each text node within `text`. */
  starts: number[];
}

export function flattenSection(el: HTMLElement): SectionText {
  const nodes: Text[] = [];
  const starts: number[] = [];
  const parts: string[] = [];
  let len = 0;
  const push = (s: string): void => {
    parts.push(s);
    len += s.length;
  };
  const walk = (parent: Node): void => {
    for (let c = parent.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === Node.TEXT_NODE) {
        const t = c as Text;
        if (!t.data) continue;
        nodes.push(t);
        starts.push(len);
        push(t.data);
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        const e = c as Element;
        if (SKIP.has(e.localName)) continue;
        const block = BLOCK.has(e.localName);
        if (block) push("\n");
        walk(e);
        if (block) push("\n");
      }
    }
  };
  walk(el);
  return { el, text: parts.join(""), nodes, starts };
}

/** Text node holding `pos`; for an end position, the node whose text ends at or after it. */
export function locate(sec: SectionText, pos: number, isEnd: boolean): { node: Text; off: number } {
  let lo = 0;
  let hi = sec.starts.length - 1;
  let i = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (isEnd ? sec.starts[mid]! < pos : sec.starts[mid]! <= pos) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const node = sec.nodes[i]!;
  const off = pos - sec.starts[i]!;
  // A start that falls in a block-boundary newline belongs to the next node.
  if (!isEnd && off >= node.data.length && i + 1 < sec.nodes.length) return { node: sec.nodes[i + 1]!, off: 0 };
  return { node, off: Math.min(off, node.data.length) };
}

/** A DOM range over [start, end) of the section's flattened text. The section must have text. */
export function rangeFor(sec: SectionText, start: number, end: number): Range {
  const a = locate(sec, start, false);
  const b = locate(sec, end, true);
  const r = document.createRange();
  r.setStart(a.node, a.off);
  r.setEnd(b.node, b.off);
  return r;
}

/** Text offset of the first text node at or after `el` in document order. */
export function offsetOf(sec: SectionText, el: Element): number {
  let lo = 0;
  let hi = sec.nodes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (el.compareDocumentPosition(sec.nodes[mid]!) & Node.DOCUMENT_POSITION_FOLLOWING) hi = mid;
    else lo = mid + 1;
  }
  return lo < sec.nodes.length ? sec.starts[lo]! : sec.text.length;
}
