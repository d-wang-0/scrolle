// Full-text search over the merged book DOM. Each section is flattened into one
// string (see textindex.ts) so a match can be mapped back to a DOM Range, even
// across inline tags.

import type { TocNode } from "../compiler/index.js";
import { flattenSection, offsetOf, rangeFor, type SectionText } from "./textindex.js";

export type SearchMode = "contains" | "regex";

export interface Query {
  text: string;
  mode: SearchMode;
  caseSensitive: boolean;
}

export interface Hit {
  /** Position in the result list. */
  n: number;
  /** Index into the book's sections. */
  section: number;
  /** Offsets into the section's flattened text. */
  start: number;
  end: number;
  match: string;
  /** Deepest TOC entry at or before the match, if any. */
  toc: TocNode | null;
  /** Index of the result group this hit was filed under. */
  g: number;
}

/** Longest match shown in a preview. Context around it is cut on demand (`BookIndex.preview`), not stored per hit. */
const MAX_PREVIEW = 160;

/** Text normalised for "Contains" matching, with each character's span in the original. */
interface Norm {
  s: string;
  from: number[];
  to: number[];
}

interface Section extends SectionText {
  norm: Map<boolean, Norm>;
}

interface Anchor {
  offset: number;
  node: TocNode;
}

type Matcher = (sec: Section) => Iterable<[number, number]>;

const QUOTES: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
};

/** Fold whitespace runs, curly quotes and soft hyphens; unless case-sensitive,
 *  also case and accents. Every output unit remembers its source span. */
function normalize(text: string, caseSensitive: boolean): Norm {
  const out: string[] = [];
  const from: number[] = [];
  const to: number[] = [];
  const emit = (str: string, a: number, b: number): void => {
    for (let k = 0; k < str.length; k++) {
      out.push(str[k]!);
      from.push(a);
      to.push(b);
    }
  };
  let lastSpace = false;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const next = i + ch.length;
    if (ch === "­" || ch === "‌" || ch === "‍") {
      i = next;
      continue;
    }
    if (/\s/.test(ch)) {
      if (lastSpace) to[to.length - 1] = next;
      else emit(" ", i, next);
      lastSpace = true;
      i = next;
      continue;
    }
    lastSpace = false;
    const q = QUOTES[ch];
    if (q) emit(q, i, next);
    else if (caseSensitive) emit(ch, i, next);
    else if (cp < 128) emit(ch.toLowerCase(), i, next);
    else emit(ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(), i, next);
    i = next;
  }
  return { s: out.join(""), from, to };
}

function containsMatcher(q: Query): Matcher {
  const needle = normalize(q.text, q.caseSensitive).s;
  return function* (sec) {
    let norm = sec.norm.get(q.caseSensitive);
    if (!norm) sec.norm.set(q.caseSensitive, (norm = normalize(sec.text, q.caseSensitive)));
    if (!needle) return;
    for (let pos = 0; ; ) {
      const i = norm.s.indexOf(needle, pos);
      if (i < 0) return;
      yield [norm.from[i]!, norm.to[i + needle.length - 1]!];
      pos = i + needle.length;
    }
  };
}

function regexMatcher(q: Query): Matcher {
  const flags = (q.caseSensitive ? "" : "i") + "gm";
  let re: RegExp;
  try {
    re = new RegExp(q.text, flags + "u");
  } catch {
    // Some patterns are only valid without `u` (e.g. `\-` escapes).
    re = new RegExp(q.text, flags);
  }
  return function* (sec) {
    re.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = re.exec(sec.text)); ) {
      if (m[0] === "") re.lastIndex++;
      else yield [m.index, m.index + m[0].length];
    }
  };
}

const flat = (s: string): string => s.replace(/\s+/g, " ");

export class BookIndex {
  private sections: Section[];
  private anchors: Anchor[][];
  /** TOC entry in force at the start of each section (from earlier sections). */
  private carry: (TocNode | null)[];

  constructor(sections: HTMLElement[], toc: TocNode[], resolve: (href: string) => HTMLElement | null) {
    this.sections = sections.map((el) => ({ ...flattenSection(el), norm: new Map() }));
    const byEl = new Map<Element, number>(sections.map((el, i) => [el, i]));
    this.anchors = sections.map(() => []);
    for (const node of toc) {
      const el = node.href ? resolve(node.href) : null;
      // Books nest their own <section>s inside ours, so match the top-level one only.
      const si = el ? byEl.get(el.closest(".epub-book > section") as Element) : undefined;
      if (!el || si === undefined) continue;
      this.anchors[si]!.push({ offset: offsetOf(this.sections[si]!, el), node });
    }
    for (const list of this.anchors) list.sort((a, b) => a.offset - b.offset);
    this.carry = [];
    let last: TocNode | null = null;
    for (const list of this.anchors) {
      this.carry.push(last);
      if (list.length) last = list[list.length - 1]!.node;
    }
  }

  private tocFor(section: number, start: number): TocNode | null {
    let found = this.carry[section]!;
    for (const a of this.anchors[section]!) {
      if (a.offset > start) break;
      found = a.node;
    }
    return found;
  }

  private hit(n: number, section: number, start: number, end: number): Hit {
    const text = this.sections[section]!.text;
    let match = flat(text.slice(start, end));
    if (match.length > MAX_PREVIEW) match = match.slice(0, MAX_PREVIEW) + "…";
    return { n, section, start, end, match, toc: this.tocFor(section, start), g: 0 };
  }

  /** Text around a hit: about `lead` characters before it and `rest` after, whitespace folded.
   *  A cut start lands on a word boundary and gets an ellipsis; the end is left for CSS to clip. */
  preview(h: Hit, lead: number, rest: number): { before: string; after: string } {
    const text = this.sections[h.section]!.text;
    const from = Math.max(0, h.start - lead * 2 - 8);
    let before = flat(text.slice(from, h.start));
    if (from === 0) before = before.trimStart();
    if (lead <= 0) before = "";
    else if (from > 0 || before.length > lead) {
      before = before.slice(-lead);
      const sp = before.indexOf(" ");
      if (sp >= 0 && sp < before.length - 1) before = before.slice(sp + 1);
      before = "…" + before;
    }
    const after = flat(text.slice(h.end, h.end + Math.max(0, rest) * 2)).trimEnd();
    return { before, after: after.slice(0, Math.max(0, rest)) };
  }

  /** All matches in document order, or null if `cancelled()` turned true midway. Throws on a bad regex. */
  async search(q: Query, cancelled: () => boolean): Promise<Hit[] | null> {
    const match = q.mode === "regex" ? regexMatcher(q) : containsMatcher(q);
    const hits: Hit[] = [];
    let sliceStart = performance.now();
    for (let s = 0; s < this.sections.length; s++) {
      if (performance.now() - sliceStart > 16) {
        await new Promise((r) => setTimeout(r));
        if (cancelled()) return null;
        sliceStart = performance.now();
      }
      for (const [start, end] of match(this.sections[s]!)) hits.push(this.hit(hits.length, s, start, end));
    }
    return hits;
  }

  rangeFor(h: Hit): Range {
    return rangeFor(this.sections[h.section]!, h.start, h.end);
  }
}
