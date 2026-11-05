<script lang="ts">
  import { onMount } from "svelte";
  import type { CompileResult, TocNode } from "../compiler/index.js";
  import { reader, anchorTarget, goto, restoreFromHistory } from "./reader.svelte.js";
  import { settings } from "./settings.svelte.js";
  import { search } from "./search.svelte.js";
  import { loadPosition, savePosition } from "./position.js";
  import { lastAtOrBefore } from "./bsearch.js";
  import { buildNoteIndex } from "./footnotes.js";
  import type { Note } from "./footnotes.js";
  import Footnote from "./Footnote.svelte";
  import { tagGreyImages } from "./greyImages.js";
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
    return tagGreyImages(bookEl);
  });

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
    return Math.max(0, lastAtOrBefore(sectionTops.length, (i) => sectionTops[i]!, y));
  }

  /** Where the document ends, or where section `i` does. */
  const sectionEnd = (i: number): number => sectionTops[i + 1] ?? document.documentElement.scrollHeight;

  /** The section at the viewport top `y`, and how far through it that is (0 to 1). */
  function placeAt(y: number): { i: number; f: number } {
    const i = sectionAt(y + 4);
    const top = sectionTops[i]!;
    const end = sectionEnd(i);
    return { i, f: end > top ? Math.min(1, Math.max(0, (y - top) / (end - top))) : 0 };
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
    window.scrollTo({ top: top + restore.f * (sectionEnd(i) - top), behavior: "instant" });
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
      const { i, f } = placeAt(y);
      const offset = charStarts[i]! + f * length.chars[i]!;
      reader.page = Math.min(reader.pages, Math.floor(offset / CHARS_PER_PAGE) + 1);
    }

    // Active TOC entry: the one whose target is closest above the viewport top.
    const line = y + 4;
    const best = lastAtOrBefore(tocByTop.length, (i) => tocTops[tocByTop[i]!]!, line);
    reader.active = best >= 0 ? tocNodes[tocByTop[best]!]! : null;

    if (!settling && sections.length) {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        const { i, f } = placeAt(window.scrollY);
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
