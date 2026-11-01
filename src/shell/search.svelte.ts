// Search state: the query's results, grouped by TOC entry, plus the match
// highlighting in the book. The index is built lazily on the first query.

import type { TocNode } from "../compiler/index.js";
import { setHighlight } from "./highlights.js";
import { anchorTarget, scrollToY } from "./reader.svelte.js";
import { settings } from "./settings.svelte.js";
import { BookIndex } from "./search.js";
import type { Hit } from "./search.js";

/** A TOC entry in the results tree. Hits sit under the deepest entry they fall in. */
export interface Group {
  id: number;
  node: TocNode | null;
  label: string;
  /** Nesting level of the TOC entry (0 for top level). */
  depth: number;
  /** Hits in this entry and everything beneath it. */
  count: number;
  /** Hits directly under this entry (not under a child). */
  hits: Hit[];
  children: Group[];
  parent: Group | null;
}

function flatten(nodes: TocNode[], parent: TocNode | null, out: TocNode[], parents: Map<TocNode, TocNode | null>): void {
  for (const n of nodes) {
    out.push(n);
    parents.set(n, parent);
    flatten(n.children, n, out, parents);
  }
}

class SearchState {
  text = $state("");
  /** Top-level groups of the results tree. */
  groups = $state.raw<Group[]>([]);
  /** Number of TOC entries that contain at least one hit. */
  sectionCount = $state(0);
  total = $state(0);
  busy = $state(false);
  error = $state<string | null>(null);
  /** Contains-mode query is too short to search yet. */
  tooShort = $state(false);
  /** Selected hit, or -1. */
  current = $state(-1);

  private source: { sections: HTMLElement[]; toc: TocNode[] } | null = null;
  private parents = new Map<TocNode, TocNode | null>();
  private all: Group[] = [];
  private index: BookIndex | null = null;
  private hits: Hit[] = [];
  private ranges: Range[] = [];
  private selected: Range | null = null;
  private token = 0;
  private visible = $state(true);
  private ys = $state.raw<number[]>([]);

  /** Document Y of every hit while highlights are showing, for the scrollbar. */
  get marks(): number[] {
    return this.visible ? this.ys : [];
  }

  /** Re-read each hit's document Y; call whenever layout may have shifted. */
  measure(): void {
    const base = window.scrollY;
    this.ys = this.ranges.map((r) => r.getBoundingClientRect().top + base);
  }

  attach(sections: HTMLElement[], tocTree: TocNode[]): void {
    const toc: TocNode[] = [];
    this.parents.clear();
    flatten(tocTree, null, toc, this.parents);
    this.source = { sections, toc };
  }

  detach(): void {
    this.token++;
    this.source = null;
    this.index = null;
    this.text = "";
    this.clear();
  }

  hitAt(n: number): Hit | undefined {
    return this.hits[n];
  }

  groupAt(id: number): Group | undefined {
    return this.all[id];
  }

  async run(): Promise<void> {
    const token = ++this.token;
    const text = this.text;
    const mode = settings.searchMode;
    this.clear();
    if (!this.source || !text) return;
    if (mode === "contains" && text.trim().length < 2) {
      this.tooShort = true;
      return;
    }
    this.busy = true;
    try {
      this.index ??= new BookIndex(this.source.sections, this.source.toc, anchorTarget);
      const hits = await this.index.search({ text, mode, caseSensitive: settings.searchCase }, () => token !== this.token);
      if (!hits || token !== this.token) return;
      this.show(hits, this.index);
    } catch (err) {
      if (token === this.token) this.error = (err as Error).message;
    } finally {
      if (token === this.token) this.busy = false;
    }
  }

  private show(hits: Hit[], index: BookIndex): void {
    // Hits arrive in document order, so the open chain of ancestors only
    // needs trimming back to the part it shares with the next hit's chain.
    const roots: Group[] = [];
    const all: Group[] = [];
    let stack: Group[] = [];
    for (const h of hits) {
      const chain: (TocNode | null)[] = [];
      for (let n = h.toc; n; n = this.parents.get(n) ?? null) chain.unshift(n);
      if (!chain.length) chain.push(null);
      let i = 0;
      while (i < stack.length && i < chain.length && stack[i]!.node === chain[i]) i++;
      stack.length = i;
      for (; i < chain.length; i++) {
        const node = chain[i]!;
        const parent = stack[i - 1] ?? null;
        const g: Group = {
          id: all.length, node, label: node?.label.trim() || "Start of book", depth: i,
          count: 0, hits: [], children: [], parent,
        };
        all.push(g);
        (parent?.children ?? roots).push(g);
        stack.push(g);
      }
      const leaf = stack[stack.length - 1]!;
      leaf.hits.push(h);
      h.g = leaf.id;
      for (let g: Group | null = leaf; g; g = g.parent) g.count++;
    }
    this.all = all;
    this.hits = hits;
    this.ranges = hits.map((h) => index.rangeFor(h));
    this.measure();
    this.total = hits.length;
    this.sectionCount = all.filter((g) => g.hits.length).length;
    this.groups = roots;
    this.apply();
  }

  private clear(): void {
    this.hits = [];
    this.ranges = [];
    this.ys = [];
    this.groups = [];
    this.all = [];
    this.sectionCount = 0;
    this.total = 0;
    this.current = -1;
    this.error = null;
    this.tooShort = false;
    this.busy = false;
    this.selected = null;
    this.apply();
  }

  /** Show or hide the in-book highlights (hidden while the panel is closed). */
  showHighlights(on: boolean): void {
    this.visible = on;
    this.apply();
  }

  private apply(): void {
    setHighlight("search", this.visible ? this.ranges : []);
    setHighlight("search-current", this.visible && this.selected ? [this.selected] : [], 1);
  }

  /** True while highlights are showing in the book. */
  get active(): boolean {
    return this.visible && this.ranges.length > 0;
  }

  /** Select the hit under a click in the book, without scrolling. */
  pick(x: number, y: number): void {
    if (!this.active) return;
    let node: Node | null = null;
    let off = 0;
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) ({ offsetNode: node, offset: off } = p);
    } else {
      const r = document.caretRangeFromPoint?.(x, y);
      if (r) ({ startContainer: node, startOffset: off } = r);
    }
    if (!node) return;
    // Ranges are in document order, so binary-search for the one containing the point.
    let lo = 0;
    let hi = this.ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const side = this.ranges[mid]!.comparePoint(node, off);
      if (side === 0) {
        this.select(mid, false);
        return;
      }
      if (side < 0) hi = mid - 1;
      else lo = mid + 1;
    }
  }

  select(n: number, scroll = true): void {
    const range = this.ranges[n];
    if (!range) return;
    // Only the first jump of a search becomes a history entry, so Back returns to where the reader was.
    const first = this.current < 0;
    this.current = n;
    this.selected = range;
    this.apply();
    if (!scroll) return;
    const rect = range.getBoundingClientRect();
    const vh = window.innerHeight;
    // Already on screen: just highlight. Within a couple of screens: glide there. Otherwise jump.
    if (rect.top >= 0 && rect.bottom <= vh) return;
    const near = rect.bottom > -2 * vh && rect.top < 3 * vh;
    scrollToY(Math.max(0, rect.top + window.scrollY - vh * settings.hitOffset / 100), first, near);
  }

  /** Index of the first hit not above the top of the viewport (the hit count if all are). */
  private firstInView(): number {
    let lo = 0;
    let hi = this.ranges.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ranges[mid]!.getBoundingClientRect().top < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Step from the selected hit; with none selected, from the viewport (wrapping at the ends). */
  step(dir: 1 | -1): void {
    const n = this.total;
    if (!n) return;
    if (this.current >= 0) return this.select((this.current + dir + n) % n);
    const first = this.firstInView();
    this.select(dir > 0 ? first % n : (first - 1 + n) % n);
  }

  /** Context around a hit for the results list; empty until a search has built the index. */
  preview(h: Hit, lead: number, rest: number): { before: string; after: string } {
    return this.index?.preview(h, lead, rest) ?? { before: "", after: "" };
  }

  /** Every group in the results tree, in document order. */
  get allGroups(): Group[] {
    return this.all;
  }
}

export const search = new SearchState();
