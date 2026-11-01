<script lang="ts">
  import type { TocNode } from "../compiler/index.js";
  import { reader } from "./reader.svelte.js";
  import TocItem from "./TocItem.svelte";
  import Icon from "./Icon.svelte";

  let {
    node,
    onpick,
    depth = 0,
    onmove,
  }: {
    node: TocNode;
    onpick: (node: TocNode) => void;
    depth?: number;
    /** Given on a merged set's book entries: move book `from` before book `before`. */
    onmove?: (from: number, before: number) => void;
  } = $props();
  let open = $state(true);

  // Book entries can be dragged by their grip to reorder the set.
  const MIME = "application/x-epub-book";
  const movable = $derived(onmove !== undefined && node.book !== undefined);
  let drop = $state<"before" | "after" | null>(null);

  function dragStart(e: DragEvent): void {
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.setData(MIME, String(node.book));
    dt.effectAllowed = "move";
    const row = (e.currentTarget as HTMLElement).closest(".row");
    if (row) dt.setDragImage(row, 12, 12);
  }

  function dragOver(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes(MIME)) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drop = e.clientY < r.top + r.height / 2 ? "before" : "after";
  }

  function dragLeave(e: DragEvent): void {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) drop = null;
  }

  function dragDrop(e: DragEvent): void {
    const from = e.dataTransfer?.getData(MIME);
    const where = drop;
    drop = null;
    if (from === undefined || from === "" || !where) return;
    e.preventDefault();
    onmove?.(Number(from), node.book! + (where === "after" ? 1 : 0));
  }
</script>

<li
  class:drop-before={drop === "before"}
  class:drop-after={drop === "after"}
  ondragover={movable ? dragOver : undefined}
  ondragleave={movable ? dragLeave : undefined}
  ondrop={movable ? dragDrop : undefined}
>
  <!-- Indented by padding on the row, not the list, so the active highlight spans the full width. -->
  <div class="row" class:active={reader.active === node} style:padding-left="{0.3 + depth * 0.7}rem">
    {#if node.children.length}
      <button class="twisty" aria-label={open ? "Collapse" : "Expand"} aria-expanded={open} onclick={() => (open = !open)}>
        <Icon name={open ? "triangle-down" : "triangle-right"} size="0.6rem" />
      </button>
    {:else}
      <span class="twisty"></span>
    {/if}
    <button
      class="label"
      disabled={!node.href}
      title={node.book !== undefined ? reader.fileNames[node.book] : undefined}
      onclick={() => onpick(node)}>{node.label}</button
    >
    {#if movable}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span class="grip" draggable="true" ondragstart={dragStart} title="Drag to reorder" aria-label="Drag to reorder">⠿</span>
    {/if}
  </div>
  {#if node.children.length && open}
    <ul>
      {#each node.children as child}
        <TocItem node={child} {onpick} depth={depth + 1} />
      {/each}
    </ul>
  {/if}
</li>

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  li { margin: 0; }
  li.drop-before { box-shadow: inset 0 2px 0 var(--accent); }
  li.drop-after { box-shadow: inset 0 -2px 0 var(--accent); }
  .grip { flex: none; cursor: move; color: var(--fg-dim); user-select: none; padding-inline: 0.15rem; }
  .grip:hover { color: var(--fg); }
  .row { display: flex; align-items: baseline; padding-right: 0.4rem; font-size: 0.9rem; }
  .row.active { background: var(--accent-soft); }
  .row.active .label { color: var(--fg); font-weight: 600; }
  button { font: inherit; background: none; border: 0; color: var(--fg-dim); cursor: pointer; padding: 0.15rem 0.25rem; }
  .twisty { display: grid; place-items: center; width: 1.1rem; flex: none; text-align: center; padding-inline: 0; }
  .label { text-align: left; flex: 1; line-height: 1.25; }
  .label:hover:not(:disabled) { color: var(--fg); }
  .label:disabled { cursor: default; }
</style>
