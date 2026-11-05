<script lang="ts">
  import type { TocNode } from "../compiler/index.js";
  import { reader, goto } from "./reader.svelte.js";
  import TocItem from "./TocItem.svelte";
  import Sidebar from "./Sidebar.svelte";
  import { settings, SIDEBAR_DEFAULTS } from "./settings.svelte.js";

  let { nodes, open, onjump, onclose }: { nodes: TocNode[]; open: boolean; onjump?: () => void; onclose?: () => void } = $props();
  let nav = $state<HTMLElement>();

  function pick(node: TocNode): void {
    if (!node.href) return;
    goto(node.href, { record: false });
    onjump?.();
  }

  $effect(() => {
    if (!reader.active || !open) return;
    nav?.querySelector(".row.active")?.scrollIntoView({ block: "nearest" });
  });
</script>

<Sidebar side="right" {open} bind:width={settings.tocWidth} fallback={SIDEBAR_DEFAULTS.toc} label="Table of contents" {onclose} class="toc" bind:element={nav}>
  {#if nodes.length}
    <ul>
      {#each nodes as node}
        <TocItem {node} onpick={pick} onmove={(from, before) => void reader.moveBook(from, before)} />
      {/each}
    </ul>
  {:else}
    <p class="empty">This book has no table of contents.</p>
  {/if}
</Sidebar>

<style>
  /* The panel's own layout; the position, slide and border are Sidebar's. */
  :global(.sidebar.toc) {
    /* No side padding, so a row's highlight spans the full width; the top clears the corner buttons. */
    padding: var(--bar-h) 0 0.5rem;
    overflow-y: auto; overscroll-behavior: contain;
  }
  ul { list-style: none; margin: 0; padding: 0; }
  .empty { color: var(--fg-dim); padding: 0.5rem 0.8rem; }
</style>
