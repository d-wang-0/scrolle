<script lang="ts">
  import type { TocNode } from "../compiler/index.js";
  import { reader, goto } from "./reader.svelte.js";
  import TocItem from "./TocItem.svelte";
  import Resizer from "./Resizer.svelte";
  import { settings, SIDEBAR_DEFAULTS } from "./settings.svelte.js";
  import { swipeClose } from "./swipe.js";

  let { nodes, open, onjump, onclose }: { nodes: TocNode[]; open: boolean; onjump?: () => void; onclose?: () => void } = $props();
  let nav: HTMLElement;

  function pick(node: TocNode): void {
    if (!node.href) return;
    goto(node.href, { record: false });
    onjump?.();
  }

  // Keep the current chapter visible in the sidebar as the reader scrolls.
  $effect(() => {
    if (!reader.active || !open) return;
    nav.querySelector(".row.active")?.scrollIntoView({ block: "nearest" });
  });
</script>

<nav bind:this={nav} use:swipeClose={{ dir: 1, onclose: () => onclose?.() }} class:open style:width="min({settings.tocWidth}px, 90vw)" aria-label="Table of contents">
  {#if nodes.length}
    <ul>
      {#each nodes as node}
        <TocItem {node} onpick={pick} onmove={(from, before) => void reader.moveBook(from, before)} />
      {/each}
    </ul>
  {:else}
    <p class="empty">This book has no table of contents.</p>
  {/if}
</nav>
{#if open}
  <Resizer side="right" bind:width={settings.tocWidth} fallback={SIDEBAR_DEFAULTS.toc} />
{/if}

<style>
  nav {
    position: fixed; z-index: 20; top: 0; bottom: 0; right: 0;
    /* No side padding, so a row's highlight spans the full width; the top clears the corner buttons. */
    padding: var(--bar-h) 0 0.5rem;
    overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;
    background: var(--chrome); border-left: 1px solid var(--line);
    transform: translateX(100%); visibility: hidden;
    transition: transform 0.18s ease, visibility 0s 0.18s;
  }
  nav.open { transform: none; visibility: visible; transition: transform 0.18s ease; }
  ul { list-style: none; margin: 0; padding: 0; }
  .empty { color: var(--fg-dim); padding: 0.5rem 0.8rem; }
</style>
