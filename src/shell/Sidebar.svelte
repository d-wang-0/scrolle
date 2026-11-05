<script lang="ts">
  import type { Snippet } from "svelte";
  import Resizer from "./Resizer.svelte";
  import { swipeClose } from "./swipe.js";

  let {
    side, open, width = $bindable(), fallback, label, onclose, class: extra = "", style, element = $bindable(), children,
  }: {
    side: "left" | "right";
    open: boolean;
    width: number;
    fallback: number;
    label: string;
    onclose?: () => void;
    class?: string;
    style?: string;
    element?: HTMLElement;
    children: Snippet;
  } = $props();
</script>

<!-- The tag matters: ui-style.css styles `aside` (left) and `nav` (right) separately. -->
<svelte:element
  this={side === "left" ? "aside" : "nav"}
  bind:this={element}
  use:swipeClose={{ dir: side === "left" ? -1 : 1, onclose: () => onclose?.() }}
  class="sidebar {side} {extra}"
  class:open
  style:width="min({width}px, 90vw)"
  {style}
  aria-label={label}
>
  {@render children()}
</svelte:element>
{#if open}
  <Resizer {side} bind:width {fallback} />
{/if}

<style>
  /* Element-qualified so the specificity stays at (0,1,1), below the `html[data-ui] aside` overrides in ui-style.css. */
  :is(aside, nav) {
    position: fixed; z-index: 20; top: 0; bottom: 0; touch-action: pan-y;
    background: var(--chrome);
    visibility: hidden;
    transition: transform 0.18s ease, visibility 0s 0.18s;
  }
  aside { left: 0; border-right: 1px solid var(--line); transform: translateX(-100%); }
  nav { right: 0; border-left: 1px solid var(--line); transform: translateX(100%); }
  :is(aside, nav).open { transform: none; visibility: visible; transition: transform 0.18s ease; }
</style>
