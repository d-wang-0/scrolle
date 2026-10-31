<script lang="ts">
  import { reader } from "./reader.svelte.js";
  import { search } from "./search.svelte.js";

  /** Gap left between neighbouring chapter blocks, and the smallest a block is drawn. */
  const GAP = 2;
  const MIN_BLOCK = 3;
  /** Kept tiny so the thumb spans exactly the chapters in view; a long book's real viewport is only a few px. */
  const MIN_THUMB = 4;
  /** Extra grab area around a thin thumb. */
  const SLOP = 6;

  let scrollY = $state(0);
  let innerHeight = $state(0);
  let trackH = $state(0);
  let track: HTMLElement;
  let dragging = $state(false);
  let grab = 0;

  const scale = $derived(reader.docHeight > 0 ? trackH / reader.docHeight : 0);
  const thumbH = $derived(Math.min(trackH, Math.max(MIN_THUMB, innerHeight * scale)));
  const thumbTop = $derived(Math.min(trackH - thumbH, scrollY * scale));

  /** One block per leaf chapter, running to the next chapter's start (or the end of the book).
   *  Anything before the first chapter gets an unlabelled block of its own. */
  const blocks = $derived.by(() => {
    const starts = reader.chapters;
    const out: { top: number; end: number; label: string }[] = [];
    if (starts.length && starts[0]!.top > 1) out.push({ top: 0, end: starts[0]!.top, label: "" });
    starts.forEach((c, i) => out.push({ top: c.top, end: starts[i + 1]?.top ?? reader.docHeight, label: c.label }));
    return out;
  });
  const current = $derived(blocks.reduce((found, b, i) => (b.top <= scrollY + 4 ? i : found), -1));

  /** Opacity of one hit's line; hits landing on the same pixel row stack up as if layered. */
  const HIT_ALPHA = 0.3;

  /** Hit count per pixel row of the track, so the DOM holds at most one line per row however many hits there are. */
  const marks = $derived.by(() => {
    const rows = new Map<number, number>();
    if (scale) {
      for (const y of search.marks) {
        const row = Math.min(Math.floor(trackH) - 1, Math.floor(y * scale));
        rows.set(row, (rows.get(row) ?? 0) + 1);
      }
    }
    return [...rows].map(([row, n]) => ({ row, opacity: 1 - (1 - HIT_ALPHA) ** n }));
  });

  function scrollToTrack(py: number): void {
    window.scrollTo({ top: (py - grab) / scale, behavior: "instant" });
  }

  function onpointerdown(e: PointerEvent): void {
    if (!scale) return;
    e.preventDefault();
    track.setPointerCapture(e.pointerId);
    const py = e.clientY - track.getBoundingClientRect().top;
    if (py >= thumbTop - SLOP && py <= thumbTop + thumbH + SLOP) grab = py - thumbTop;
    else {
      // Clicking the track puts the thumb's middle under the pointer, then carries on as a drag.
      grab = thumbH / 2;
      scrollToTrack(py);
    }
    dragging = true;
  }

  function onpointermove(e: PointerEvent): void {
    if (dragging) scrollToTrack(e.clientY - track.getBoundingClientRect().top);
  }
</script>

<svelte:window bind:scrollY bind:innerHeight />

<div
  bind:this={track}
  bind:clientHeight={trackH}
  class="track"
  class:dragging
  role="scrollbar"
  aria-orientation="vertical"
  aria-controls="content"
  aria-valuenow={Math.round(reader.progress * 100)}
  aria-valuemin={0}
  aria-valuemax={100}
  tabindex="-1"
  {onpointerdown}
  {onpointermove}
  onpointerup={() => (dragging = false)}
  onpointercancel={() => (dragging = false)}
>
  {#each blocks as b, i}
    <div
      class="block"
      class:current={i === current}
      title={b.label}
      style:top="{b.top * scale}px"
      style:height="{Math.max(MIN_BLOCK, (b.end - b.top) * scale - GAP)}px"
    ></div>
  {/each}
  {#each marks as m (m.row)}
    <div class="mark" style:top="{m.row}px" style:opacity={m.opacity}></div>
  {/each}
  <div class="thumb" style:top="{thumbTop}px" style:height="{thumbH}px"></div>
</div>

<style>
  .track {
    position: fixed; z-index: 15; top: calc(0.5rem + env(safe-area-inset-top)); bottom: 0.5rem; right: var(--right-w); width: 14px;
    touch-action: none; user-select: none; cursor: default;
  }
  .block {
    position: absolute; left: 4px; right: 4px; border-radius: 1px;
    /* Opaque, so tiny chapters stretched to the minimum height overlap without stacking tints. */
    background: color-mix(in srgb, var(--fg) 20%, var(--page));
  }
  .block.current { z-index: 1; background: color-mix(in srgb, var(--accent) 50%, var(--page)); }
  .mark {
    position: absolute; z-index: 1; left: 4px; right: 4px; height: 2px; pointer-events: none;
    background: #ff9632;
  }
  .thumb {
    position: absolute; z-index: 2; left: 1px; right: 1px; pointer-events: none; border-radius: 3px;
    background: color-mix(in srgb, var(--fg) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--fg) 60%, transparent);
  }
  .track:hover .thumb, .track.dragging .thumb { background: color-mix(in srgb, var(--fg) 25%, transparent); }
</style>
