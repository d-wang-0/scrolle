<script lang="ts" module>
  /** Whether each image (by blob URL) is greyscale. A book's URLs survive
   *  recompiles (append/reorder), so its images are checked once. */
  const greyByUrl = new Map<string, boolean>();
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import type { CompileResult, TocNode } from "../compiler/index.js";
  import { reader, anchorTarget, goto, restoreFromHistory } from "./reader.svelte.js";
  import { settings } from "./settings.svelte.js";
  import { search } from "./search.svelte.js";
  import { loadPosition, savePosition } from "./position.js";
  import { buildNoteIndex } from "./footnotes.js";
  import type { Note } from "./footnotes.js";
  import Footnote from "./Footnote.svelte";
  import { measureLength, pageCount, CHARS_PER_PAGE } from "./length.js";
  import type { BookLength } from "./length.js";

  let { book, ontap }: { book: CompileResult; ontap?: () => void } = $props();

  let host: HTMLElement;
  let note = $state.raw<Note | null>(null);
  let notes = new Map<Element, Note>();
  let bookEl = $state.raw<HTMLElement | null>(null);

  $effect(() => {
    bookEl?.classList.toggle("dark", settings.theme === "dark");
  });

  $effect(() => {
    const mode = settings.invertImages;
    bookEl?.classList.toggle("invert-all", mode === "all");
    bookEl?.classList.toggle("invert-bw", mode === "bw");
    if (mode !== "bw" || !bookEl) return;
    const imgs = bookEl.querySelectorAll("img");
    const onLoad = (e: Event) => tagGrayscale(e.currentTarget as HTMLImageElement);
    for (const img of imgs) {
      const known = greyByUrl.get(img.currentSrc || img.src);
      if (known !== undefined) img.dataset[known ? "bw" : "colour"] = "";
      else if (img.complete && img.naturalWidth) tagGrayscale(img);
      else img.addEventListener("load", onLoad, { once: true });
    }
    return () => imgs.forEach((img) => img.removeEventListener("load", onLoad));
  });

  /** Mark an image `data-bw` if (nearly) all its pixels are grey. */
  function tagGrayscale(img: HTMLImageElement): void {
    if (img.dataset.bw !== undefined || img.dataset.colour !== undefined) return;
    const SIZE = 48;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    try {
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
      let coloured = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3]! < 16) continue;
        if (Math.max(px[i]!, px[i + 1]!, px[i + 2]!) - Math.min(px[i]!, px[i + 1]!, px[i + 2]!) > 24) coloured++;
      }
      const grey = coloured / (SIZE * SIZE) < 0.02;
      img.dataset[grey ? "bw" : "colour"] = "";
      greyByUrl.set(img.currentSrc || img.src, grey);
    } catch {
      // Tainted or undecodable image: leave it alone.
    }
  }

  // Section and TOC-target tops (document Y), cached because layout changes
  // (images loading, resizes, font-size changes) are rarer than scroll events.
  let sections: HTMLElement[] = [];
  let sectionTops: number[] = [];
  let tocNodes: TocNode[] = [];
  let tocTops: number[] = [];
  /** Indices of TOC entries with a target, by target top (ties: TOC order). */
  let tocByTop: number[] = [];
  let length: BookLength = { chars: [], words: 0, total: 0 };
  /** Characters before each section, for locating the viewport in the text. */
  let charStarts: number[] = [];

  function flatten(nodes: TocNode[], out: TocNode[] = []): TocNode[] {
    for (const n of nodes) {
      out.push(n);
      flatten(n.children, out);
    }
    return out;
  }

  function measure(): void {
    const base = window.scrollY;
    sectionTops = sections.map((s) => s.getBoundingClientRect().top + base);
    tocTops = tocNodes.map((n) => {
      const el = n.href ? anchorTarget(n.href) : null;
      return el ? el.getBoundingClientRect().top + base : NaN;
    });
    tocByTop = [...tocTops.keys()]
      .filter((i) => Number.isFinite(tocTops[i]))
      .sort((a, b) => tocTops[a]! - tocTops[b]! || a - b);

    // Leaf entries by position, one per distinct start, for the scrollbar's chapter blocks.
    const leaves = tocNodes
      .map((n, i) => ({ top: tocTops[i]!, label: n.label, leaf: n.children.length === 0 }))
      .filter((c) => c.leaf && Number.isFinite(c.top))
      .sort((a, b) => a.top - b.top);
    reader.chapters = leaves.filter((c, i) => i === 0 || c.top > leaves[i - 1]!.top + 1);
    reader.docHeight = document.documentElement.scrollHeight;
    search.measure();
  }

  /** Index of the last section whose top is at or above `y`. */
  function sectionAt(y: number): number {
    let lo = 0;
    let hi = sectionTops.length - 1;
    let found = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sectionTops[mid]! <= y) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  }

  // Until the reader scrolls themselves, keep re-applying the restored
  // position while late layout (images) shifts content around.
  let settling = false;
  const restore = loadPosition(reader.key);

  function applyRestore(): void {
    if (!restore) return;
    const i = sections.findIndex((s) => s.id === restore.id);
    if (i < 0) return;
    const top = sectionTops[i]!;
    const end = sectionTops[i + 1] ?? document.documentElement.scrollHeight;
    window.scrollTo({ top: top + restore.f * (end - top), behavior: "instant" });
  }

  let frame = 0;
  let saveTimer = 0;

  function update(): void {
    frame = 0;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    reader.progress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;

    // Current page: characters before the viewport top (whole sections, plus the fraction
    // of this one scrolled past) over the page size.
    if (sections.length && length.total) {
      const i = sectionAt(y + 4);
      const top = sectionTops[i]!;
      const end = sectionTops[i + 1] ?? document.documentElement.scrollHeight;
      const f = end > top ? Math.min(1, Math.max(0, (y - top) / (end - top))) : 0;
      const offset = charStarts[i]! + f * length.chars[i]!;
      reader.page = Math.min(reader.pages, Math.floor(offset / CHARS_PER_PAGE) + 1);
    }

    // Active TOC entry: the one whose target is closest above the viewport top.
    const line = y + 4;
    let lo = 0;
    let hi = tocByTop.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tocTops[tocByTop[mid]!]! <= line) {
        best = tocByTop[mid]!;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    reader.active = best >= 0 ? tocNodes[best]! : null;

    if (!settling && sections.length) {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        const i = sectionAt(window.scrollY + 4);
        const top = sectionTops[i]!;
        const end = sectionTops[i + 1] ?? document.documentElement.scrollHeight;
        const f = end > top ? Math.max(0, (window.scrollY - top) / (end - top)) : 0;
        savePosition(reader.key, { id: sections[i]!.id, f });
      }, 400);
    }
  }

  function onScroll(): void {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function endSettling(): void {
    settling = false;
  }

  onMount(() => {
    // Moves the content out of the fragment (no copy), leaving it empty: the view
    // must mount once per compiled book, which `{#key reader.book}` in App ensures.
    host.replaceChildren(book.fragment);
    bookEl = host.querySelector<HTMLElement>(".epub-book");
    sections = [...host.querySelectorAll<HTMLElement>(".epub-book > section")];
    tocNodes = flatten(book.toc);
    notes = buildNoteIndex(host);
    search.attach(sections, book.toc);
    length = measureLength(book.lengths);
    let sum = 0;
    charStarts = length.chars.map((n) => (sum += n) - n);
    reader.words = length.words;
    reader.pages = pageCount(length.total);

    measure();
    settling = restore !== null;
    if (restore) applyRestore();
    else window.scrollTo({ top: 0, behavior: "instant" });
    update();

    const settleTimer = window.setTimeout(endSettling, 3000);
    const ro = new ResizeObserver(() => {
      measure();
      if (settling) applyRestore();
      onScroll();
    });
    ro.observe(host);

    const userEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const e of userEvents) window.addEventListener(e, endSettling, { passive: true });

    return () => {
      search.detach();
      ro.disconnect();
      clearTimeout(settleTimer);
      clearTimeout(saveTimer);
      cancelAnimationFrame(frame);
      for (const e of userEvents) window.removeEventListener(e, endSettling);
    };
  });

  function onClick(e: MouseEvent): void {
    const a = (e.target as Element).closest("a[href]");
    if (e.defaultPrevented) return;
    if (!a) {
      if (window.getSelection()?.isCollapsed ?? true) {
        search.pick(e.clientX, e.clientY);
        ontap?.();
      }
      return;
    }
    const href = a.getAttribute("href")!;
    const found = notes.get(a);
    if (found) {
      e.preventDefault();
      note = found;
    } else if (href.startsWith("#")) {
      e.preventDefault();
      goto(href);
    } else if (/^(https?|mailto):/i.test(href)) {
      e.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      // Anything else (a relative path, data:, file:) would navigate the app itself away from the book.
      e.preventDefault();
    }
  }
</script>

<svelte:window onscroll={onScroll} onpopstate={(e) => restoreFromHistory(e.state)} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div id="content" bind:this={host} onclick={onClick}></div>

{#if note}
  <Footnote {note} onclose={() => (note = null)} />
{/if}
