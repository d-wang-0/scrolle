<script lang="ts">
  import { LIMITS } from "./settings.svelte.js";

  /** Which screen edge the panel is pinned to; the handle sits on its inner edge. */
  let { width = $bindable(), fallback, side = "left" }: { width: number; fallback: number; side?: "left" | "right" } = $props();
  /** Width under the pointer while dragging. The panel only takes it on release: every width
   *  change reflows the whole book, far too slow to do per pointer move. */
  let preview = $state<number | null>(null);
  const dragging = $derived(preview !== null);
  const shown = $derived(preview ?? width);
  // Dragging toward the page centre widens the panel, which is a different direction per side.
  const sign = $derived(side === "left" ? 1 : -1);

  const clamp = (w: number): number =>
    Math.round(Math.min(LIMITS.sidebar.max, window.innerWidth * 0.9, Math.max(LIMITS.sidebar.min, w)));

  function onpointerdown(e: PointerEvent): void {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    preview = width;
  }

  function onpointermove(e: PointerEvent): void {
    // The panel is pinned to a screen edge, so its width is the pointer's distance from it
    // (measured to the viewport's edge, which excludes the page scrollbar).
    if (dragging) preview = clamp(side === "left" ? e.clientX : document.documentElement.clientWidth - e.clientX);
  }

  function onpointerup(): void {
    if (preview !== null && preview !== width) width = preview;
    preview = null;
  }

  function onkeydown(e: KeyboardEvent): void {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowRight") width = clamp(width + sign * step);
    else if (e.key === "ArrowLeft") width = clamp(width - sign * step);
    else return;
    e.preventDefault();
  }
</script>

<!-- Pinned to the panel's inner edge (not inside it, so a scrolling panel doesn't carry it away).
     A focusable separator is the ARIA "window splitter" pattern, which Svelte's a11y lint doesn't recognise. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="handle"
  class:dragging
  role="separator"
  aria-orientation="vertical"
  aria-label="Resize sidebar"
  aria-valuenow={shown}
  aria-valuemin={LIMITS.sidebar.min}
  aria-valuemax={LIMITS.sidebar.max}
  tabindex="0"
  style:left={side === "left" ? `calc(min(${shown}px, 90vw) - 4px)` : null}
  style:right={side === "right" ? `calc(min(${shown}px, 90vw) - 4px)` : null}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={() => (preview = null)}
  ondblclick={() => (width = fallback)}
  {onkeydown}
></div>

<style>
  .handle {
    position: fixed; z-index: 21; top: 0; bottom: 0; width: 8px;
    cursor: col-resize; touch-action: none;
  }
  /* A thin line shows only on hover, focus or drag. */
  .handle::after {
    content: ""; position: absolute; top: 0; bottom: 0; left: 3px; width: 2px;
    background: var(--accent); opacity: 0; transition: opacity 0.12s;
  }
  .handle:hover::after, .handle:focus-visible::after { opacity: 0.8; }
  /* While dragging, the line is a guide to where the panel edge will land on release. */
  .handle.dragging::after { opacity: 1; }
  .handle:focus-visible { outline: none; }
</style>
