<script lang="ts">
  import { tick } from "svelte";
  import { Toggle, ToggleGroup } from "bits-ui";
  import { search } from "./search.svelte.js";
  import type { Group } from "./search.svelte.js";
  import Resizer from "./Resizer.svelte";
  import { settings, SIDEBAR_DEFAULTS } from "./settings.svelte.js";
  import { swipeClose } from "./swipe.js";

  let { open, onjump, onclose }: { open: boolean; onjump?: () => void; onclose?: () => void } = $props();
  let input: HTMLInputElement;
  let list: HTMLElement;
  /** Pinned-header step in px; nested headers pin at multiples of it. Whole pixels,
   *  so stacked headers never leave a sub-pixel seam (see `.group` in the styles). */
  const HEADER_H = 26;
  let folded = $state<Record<number, boolean | undefined>>({});

  export function focus(): void {
    input.focus();
    input.select();
  }

  $effect(() => {
    if (open) focus();
    search.showHighlights(open);
  });

  // Re-run shortly after the query or its options change.
  $effect(() => {
    void [search.text, settings.searchMode, settings.searchCase];
    const t = setTimeout(() => void search.run(), 180);
    return () => clearTimeout(t);
  });

  $effect(() => {
    void search.groups;
    folded = {};
  });

  // Keep the selected hit visible, unfolding its group if needed.
  $effect(() => {
    const h = search.hitAt(search.current);
    if (!h) return;
    for (let g = search.groupAt(h.g); g; g = g.parent) folded[g.id] = false;
    void tick().then(() => list.querySelector(".hit.current")?.scrollIntoView({ block: "nearest" }));
  });

  function onInputKey(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      search.step(e.shiftKey ? -1 : 1);
    }
  }

  const isFolded = (id: number): boolean => folded[id] ?? search.total > 1000;
</script>

<!-- One collapsible level of the results tree; headers pin below their ancestors' headers. -->
{#snippet branch(group: Group)}
  <section>
    <button
      class="group"
      style:top="{group.depth * HEADER_H}px"
      style:z-index={100 - group.depth}
      style:padding-left="{0.4 + group.depth * 0.7}rem"
      aria-expanded={!isFolded(group.id)}
      onclick={() => (folded[group.id] = !isFolded(group.id))}
    >
      <span class="twisty">{isFolded(group.id) ? "▸" : "▾"}</span>
      <span class="label">{group.label}</span>
      <span class="count">{group.count.toLocaleString()}</span>
    </button>
    {#if !isFolded(group.id)}
      {#if group.hits.length}
        <ul style:padding-left="{1.4 + group.depth * 0.7}rem">
          {#each group.hits as hit (hit.n)}
            <li>
              <button
                class="hit"
                class:current={hit.n === search.current}
                style:scroll-margin-top="{(group.depth + 1) * HEADER_H + 5}px"
                onclick={() => {
                  search.select(hit.n);
                  onjump?.();
                }}
                >{hit.before}<mark>{hit.match}</mark>{hit.after}</button
              >
            </li>
          {/each}
        </ul>
      {/if}
      {#each group.children as child (child.id)}
        {@render branch(child)}
      {/each}
    {/if}
  </section>
{/snippet}

<aside use:swipeClose={{ dir: -1, onclose: () => onclose?.() }} class:open style:width="min({settings.searchWidth}px, 90vw)" style:--hdr="{HEADER_H}px" aria-label="Search">
  <div class="head">
    <div class="query">
      <input
        bind:this={input}
        bind:value={search.text}
        onkeydown={onInputKey}
        type="search"
        placeholder="Search"
        spellcheck="false"
        autocomplete="off"
      />
      <button class="btn step" aria-label="Previous match" disabled={!search.total} onclick={() => search.step(-1)}>▲</button>
      <button class="btn step" aria-label="Next match" disabled={!search.total} onclick={() => search.step(1)}>▼</button>
    </div>
    <div class="opts">
      <ToggleGroup.Root
        type="single"
        class="seg"
        bind:value={() => settings.searchMode, (v) => v && (settings.searchMode = v as "contains" | "regex")}
      >
        <ToggleGroup.Item value="contains">Contains</ToggleGroup.Item>
        <ToggleGroup.Item value="regex">Regex</ToggleGroup.Item>
      </ToggleGroup.Root>
      <Toggle.Root class="btn case" aria-label="Case sensitive" title="Case sensitive" bind:pressed={settings.searchCase}>Aa</Toggle.Root>
    </div>
    <p class="status" class:error={search.error}>
      {#if search.error}
        {search.error}
      {:else if search.busy}
        Searching…
      {:else if search.tooShort}
        Type at least 2 characters
      {:else if search.text && !search.total}
        No results
      {:else if search.total}
        {search.current >= 0 ? `${search.current + 1} of ` : ""}{search.total.toLocaleString()} result{search.total === 1 ? "" : "s"}
        in {search.sectionCount.toLocaleString()} section{search.sectionCount === 1 ? "" : "s"}
      {/if}
    </p>
  </div>

  <div class="results" bind:this={list}>
    {#each search.groups as group (group.id)}
      {@render branch(group)}
    {/each}
  </div>
</aside>
{#if open}
  <Resizer bind:width={settings.searchWidth} fallback={SIDEBAR_DEFAULTS.search} />
{/if}

<style>
  aside {
    position: fixed; z-index: 20; top: 0; bottom: 0; left: 0;
    display: flex; flex-direction: column; overflow-x: hidden; touch-action: pan-y;
    padding-top: calc(0.5rem + env(safe-area-inset-top));
    background: var(--chrome); border-right: 1px solid var(--line);
    transform: translateX(-100%); visibility: hidden;
    transition: transform 0.18s ease, visibility 0s 0.18s;
  }
  aside.open { transform: none; visibility: visible; transition: transform 0.18s ease; }
  .head { display: grid; gap: 0.4rem; min-width: 0; padding: 0 0.6rem; border-bottom: 1px solid var(--line); }
  /* Starts right of the search toggle (a fixed corner button) so the two read as one row:
     the button's 0.5rem inset + its width + a gap, less this panel's own 0.6rem padding. */
  .query { display: flex; gap: 0.3rem; min-width: 0; height: var(--ctl-h); margin-left: calc(0.5rem + var(--search-btn-w) + 0.3rem - 0.6rem); }
  .query input {
    flex: 1; min-width: 0; font: inherit; color: var(--fg); background: var(--page);
    border: 1px solid var(--line); border-radius: 6px; padding: 0.35rem 0.55rem;
  }
  .query input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .step { flex: none; padding: 0.2rem 0.5rem; font-size: 0.7rem; }
  .step:disabled { opacity: 0.4; cursor: default; }
  /* Wraps onto two lines when the panel is dragged narrow. */
  .opts { display: flex; flex-wrap: wrap; gap: 0.5rem 0.8rem; align-items: center; justify-content: space-between; font-size: 0.85rem; color: var(--fg-dim); }
  .opts :global(.seg) { flex: none; }
  /* About as tall as the checkbox label beside it. */
  .opts :global(.seg [data-toggle-group-item]) { padding: 0.05rem 0.7rem; font-size: 0.75rem; line-height: 1.2; }
  /* The case-sensitivity switch: a small toggle button reading Aa. */
  .opts :global(.case) { flex: none; padding: 0.05rem 0.55rem; font-size: 0.75rem; font-weight: 600; line-height: 1.2; letter-spacing: -0.02em; color: var(--fg-dim); }
  .opts :global(.case[data-state="on"]) { background: var(--accent); color: #fff; }
  .status { margin: -0.1rem 0 -0.1rem; min-height: 1.2em; font-size: 0.72rem; line-height: 1.2; text-align: center; color: var(--fg-dim); }
  .status.error { color: #ff6b6b; }

  /* No side padding, so group headers (and their highlight) span the full width; hits are inset by their list's padding. */
  .results { flex: 1; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; padding: 0 0 0.5rem; }
  /* A little room above the first hit, so the selected hit's outline (which draws outside its box)
     doesn't run into the header it sits directly under. */
  ul { list-style: none; margin: 0; padding: 3px 0.4rem 0.15rem 0; }
  button { font: inherit; background: none; border: 0; color: var(--fg-dim); cursor: pointer; text-align: left; }
  /* Pinned while its hits scroll past. Nested headers stack via an inline `top`, and
     an inline z-index that falls with depth, so a child scrolling away slides under
     its parent instead of across it. Each header is 1px taller than the step to the
     next, so neighbours overlap rather than leaving a seam; no rounded corners, which
     would let the text behind show through. Opaque so the hits don't show through. */
  .group {
    position: sticky;
    display: flex; width: 100%; height: calc(var(--hdr) + 1px); align-items: center; gap: 0.2rem; padding-block: 0; padding-right: 0.5rem;
    background: var(--chrome); color: var(--fg); font-weight: 600;
  }
  .group:hover { background: color-mix(in srgb, var(--accent) 18%, var(--chrome)); }
  .twisty { width: 1.1rem; flex: none; text-align: center; font-weight: 400; color: var(--fg-dim); }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { font-weight: 400; font-size: 0.75rem; color: var(--fg-dim); font-variant-numeric: tabular-nums; }
  .hit { display: block; width: 100%; padding: 0.12rem 0.4rem; border-radius: 4px; font-size: 0.8rem; line-height: 1.3; }
  .hit:hover { background: var(--accent-soft); }
  .hit.current { background: var(--accent-soft); outline: 1px solid var(--accent); }
  mark { background: none; color: var(--fg); font-weight: 700; }
</style>
