// App-level reader state: the open book and the live reading position.
// `openBytes` is the one entry point for every source of an EPUB (file picker,
// drag-drop, the OS file-association launch path).

import { tick } from "svelte";
import { Book, compile, serializeToHtml } from "../compiler/index.js";
import type { CompileResult, TocNode } from "../compiler/index.js";
import { inExtension } from "./native.js";
import { settings } from "./settings.svelte.js";
import { loadPosition, savePosition } from "./position.js";
import type { Position } from "./position.js";

class Reader {
  book = $state.raw<CompileResult | null>(null);
  /** File name without extension. */
  name = $state("");
  /** Stable per-book key for saved positions. */
  key = $state("");
  /** The opened EPUBs, kept so append/reorder/export recompile without unzipping and parsing them again. */
  private books: Book[] = [];
  /** The EPUB bytes each Book was opened from, so saving doesn't need another fetch. */
  private originals = new WeakMap<Book, Uint8Array>();
  /** File names of the books in `books`, same order. */
  fileNames = $state.raw<string[]>([]);
  loading = $state(false);
  /** While `openUrl` is fetching: bytes received so far and the expected total (0 when the server didn't say). */
  downloading = $state(false);
  fetched = $state(0);
  fetchTotal = $state(0);
  error = $state<string | null>(null);
  /** 0-1 progress through the whole document. */
  progress = $state(0);
  /** TOC entry the viewport is currently inside. */
  active = $state.raw<TocNode | null>(null);
  /** Start (document Y) of each leaf TOC entry in reading order, for the scrollbar. */
  chapters = $state.raw<{ top: number; label: string }[]>([]);
  /** Estimated length (see length.ts): word count, page count, and the page the viewport is on. */
  words = $state(0);
  pages = $state(0);
  page = $state(0);
  /** Total document height in px. */
  docHeight = $state(0);

  /** Open one or more EPUBs; several are read in order as a single omnibus book. */
  async openFiles(files: File[]): Promise<void> {
    if (!files.length) return;
    const bytes = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
    await this.open(files.map((f) => f.name), bytes);
  }

  /** Add EPUBs to the end of the open book (files already in it are skipped). */
  async appendFiles(files: File[]): Promise<void> {
    if (!this.book) return this.openFiles(files);
    const fresh = files.filter((f) => !this.fileNames.includes(f.name));
    if (!fresh.length) return;
    const bytes = await Promise.all(fresh.map(async (f) => new Uint8Array(await f.arrayBuffer())));
    await this.open([...this.fileNames, ...fresh.map((f) => f.name)], [...this.books, ...bytes], (p) => p);
  }

  async openBytes(fileName: string, bytes: Uint8Array): Promise<void> {
    await this.open([fileName], [bytes]);
  }

  /** Fetch an EPUB by URL (http(s), or file: from the browser extension) and open it. */
  async openUrl(url: string): Promise<void> {
    const name = decodeURIComponent(url.split(/[?#]/)[0]!.split("/").pop() || "book.epub");
    this.loading = true;
    this.error = null;
    this.downloading = true;
    this.fetched = this.fetchTotal = 0;
    let bytes: Uint8Array;
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Content-Length counts encoded bytes, so it only matches what we read when nothing is encoded.
      this.fetchTotal = res.headers.get("content-encoding") ? 0 : Number(res.headers.get("content-length")) || 0;
      if (!res.body) {
        bytes = new Uint8Array(await res.arrayBuffer());
      } else {
        const chunks: Uint8Array[] = [];
        const body = res.body.getReader();
        for (;;) {
          const { done, value } = await body.read();
          if (done) break;
          chunks.push(value);
          this.fetched += value.length;
        }
        bytes = new Uint8Array(this.fetched);
        let at = 0;
        for (const c of chunks) {
          bytes.set(c, at);
          at += c.length;
        }
      }
    } catch (err) {
      this.loading = false;
      const hint = url.startsWith("file:") ? " Local files need “Allow access to file URLs” enabled for the extension." : "";
      this.error = `Could not load ${name}: ${(err as Error).message}.${hint}`;
      return;
    } finally {
      this.downloading = false;
    }
    await this.open([name], [bytes]);
  }

  /** Move book `from` so it sits before book `before` (0..n, in the current order). */
  async moveBook(from: number, before: number): Promise<void> {
    const n = this.books.length;
    const to = before > from ? before - 1 : before;
    if (!this.book || this.loading || from === to || from < 0 || from >= n || to < 0 || to >= n) return;

    // Sections per book, to translate the saved place (`ch{N}`) into the new order.
    const counts = this.book.sectionCounts;
    const order = [...counts.keys()];
    order.splice(to, 0, ...order.splice(from, 1));
    const oldStart: number[] = [];
    let sum = 0;
    for (const c of counts) {
      oldStart.push(sum);
      sum += c;
    }
    const newStart = new Map<number, number>();
    let at = 0;
    for (const b of order) {
      newStart.set(b, at);
      at += counts[b]!;
    }

    const carry = (p: Position): Position => {
      const idx = Number(/^ch(\d+)$/.exec(p.id)?.[1]);
      let b = -1;
      oldStart.forEach((start, i) => {
        if (start <= idx) b = i;
      });
      return Number.isNaN(idx) || b < 0 ? p : { ...p, id: `ch${newStart.get(b)! + idx - oldStart[b]!}` };
    };
    await this.open(order.map((i) => this.fileNames[i]!), order.map((i) => this.books[i]!), carry);
  }

  /** Open a set of books; `sources` are already open Books or the bytes of new ones. */
  private async open(fileNames: string[], sources: (Book | Uint8Array)[], carry?: (p: Position) => Position): Promise<void> {
    this.loading = true;
    this.error = null;
    // Yield so the loading state paints before the (synchronous) compile.
    await new Promise((r) => setTimeout(r, 0));
    const fileName = fileNames.join(" + ");
    const books: Book[] = [];
    try {
      for (const s of sources) {
        if (s instanceof Book) {
          books.push(s);
        } else {
          const b = Book.open(s);
          // Only the extension can save the original, so only it pays for keeping it.
          if (inExtension()) this.originals.set(b, s);
          books.push(b);
        }
      }
      const book = compile(books, "blob");
      const key = book.metadata.identifier ?? book.metadata.title ?? fileName.replace(/\.epub\b/gi, "");
      // The set changed but the reader's place in it needn't: carry it over to the new key.
      const place = carry ? loadPosition(this.key) : null;
      if (place) savePosition(key, carry!(place));
      const dropped = this.books.filter((b) => !books.includes(b));
      this.books = books;
      this.fileNames = fileNames;
      this.key = key;
      this.name = fileName.replace(/\.epub\b/gi, "");
      this.progress = 0;
      this.active = null;
      this.chapters = [];
      this.words = this.pages = this.page = 0;
      this.book = book;
      // Free the resources of books no longer open, once the old view has gone.
      if (dropped.length) void tick().then(() => dropped.forEach((b) => b.dispose()));
    } catch (err) {
      // Books opened just for this attempt; ones already open keep serving the current view.
      for (const b of books) if (!this.books.includes(b)) b.dispose();
      this.error = `Could not open ${fileName}: ${(err as Error).message}`;
      console.error(err);
    } finally {
      this.loading = false;
    }
  }

  /** Save the open EPUB file(s) exactly as they were loaded, one download per book. */
  downloadOriginals(): void {
    this.books.forEach((book, i) => {
      const bytes = this.originals.get(book);
      if (!bytes) return;
      const name = this.fileNames[i]!;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/epub+zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = /\.epub3?$/i.test(name) ? name : `${name}.epub`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  /** Download the current book as a standalone .html file. */
  exportHtml(): void {
    if (!this.book || !this.books.length) return;
    // The live book references resources by blob: URL; recompile self-contained.
    let html: string;
    try {
      html = serializeToHtml(compile(this.books), { dark: settings.theme === "dark" });
    } catch (err) {
      this.error = `Could not export ${this.name}: ${(err as Error).message}`;
      return;
    }
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.name || "book"}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export const reader = new Reader();

/** Resolve an in-page `#id` href to its element. */
export function anchorTarget(href: string): HTMLElement | null {
  if (!href.startsWith("#")) return null;
  let id = href.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep the raw id
  }
  return document.getElementById(id);
}

/** Scroll so the in-page anchor sits at the top of the viewport. With
 *  `record`, the jump is a history entry so Back returns to where the reader was. */
export function goto(href: string, { record = true }: { record?: boolean } = {}): boolean {
  const el = anchorTarget(href);
  if (!el) return false;
  scrollToY(el.getBoundingClientRect().top + window.scrollY, record);
  return true;
}

/** Scroll to a document Y, optionally as a history entry (see `goto`). */
export function scrollToY(top: number, record = true, smooth = false): void {
  if (record) {
    history.replaceState({ key: reader.key, y: window.scrollY }, "");
    history.pushState({ key: reader.key, y: top }, "");
  }
  cancelGlide?.();
  if (smooth) glideTo(top);
  else window.scrollTo({ top, behavior: "instant" });
}

let cancelGlide: (() => void) | null = null;

/** Ease-out scroll to `top` over a fixed short duration (native smooth scrolling is slower and not tunable). */
function glideTo(top: number): void {
  const ms = settings.glideMs;
  if (ms <= 0) {
    window.scrollTo({ top, behavior: "instant" });
    return;
  }
  const from = window.scrollY;
  const start = performance.now();
  let raf = 0;
  const stop = (): void => {
    cancelAnimationFrame(raf);
    for (const ev of ["wheel", "touchstart", "keydown"]) window.removeEventListener(ev, stop);
    cancelGlide = null;
  };
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / ms);
    window.scrollTo({ top: from + (top - from) * (1 - (1 - t) ** 3), behavior: "instant" });
    if (t < 1) raf = requestAnimationFrame(step);
    else stop();
  };
  for (const ev of ["wheel", "touchstart", "keydown"]) window.addEventListener(ev, stop, { passive: true });
  cancelGlide = stop;
  raf = requestAnimationFrame(step);
}

/** Restore the scroll position stored on a history entry made by `goto`. */
export function restoreFromHistory(state: unknown): void {
  const s = state as { key?: string; y?: number } | null;
  if (s && s.key === reader.key && typeof s.y === "number") {
    window.scrollTo({ top: s.y, behavior: "instant" });
  }
}
