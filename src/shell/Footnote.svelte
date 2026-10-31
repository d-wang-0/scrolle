<script lang="ts">
  import { goto } from "./reader.svelte.js";
  import { settings } from "./settings.svelte.js";
  import type { Note } from "./footnotes.js";

  let { note, onclose }: { note: Note; onclose: () => void } = $props();

  let box: HTMLElement;
  let body: HTMLElement;
  let side = $state<"below" | "above">("below");

  /** Gap between the link and the popup (room for the arrow). */
  const GAP = 12;
  const MARGIN = 8;
  const ARROW_INSET = 18;

  /**
   * The popup is column-wide and centred; it sits below the link (above if
   * there is more room there) and the arrow slides along its edge to the link.
   */
  function place(): void {
    const r = note.anchor.getClientRects()[0] ?? note.anchor.getBoundingClientRect();
    const footer = document.querySelector<HTMLElement>(".foot")?.offsetHeight ?? 0;
    const below = window.innerHeight - footer - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;

    box.style.removeProperty("--note-max");
    const natural = box.offsetHeight;
    side = below >= natural || below >= above ? "below" : "above";
    const room = Math.max(120, side === "below" ? below : above);
    box.style.setProperty("--note-max", `${room}px`);

    if (side === "below") {
      box.style.top = `${r.bottom + GAP}px`;
      box.style.bottom = "auto";
    } else {
      box.style.top = "auto";
      box.style.bottom = `${window.innerHeight - r.top + GAP}px`;
    }

    const left = box.getBoundingClientRect().left;
    const center = r.left + r.width / 2 - left;
    const x = Math.min(Math.max(center, ARROW_INSET), box.offsetWidth - ARROW_INSET);
    box.style.setProperty("--arrow-x", `${x}px`);
  }

  $effect(() => {
    // Each open gets its own copy; the indexed original stays untouched.
    const copy = note.content.cloneNode(true) as HTMLElement;
    copy.classList.toggle("dark", settings.theme === "dark");
    body.replaceChildren(copy);
    place();
  });

  function jump(): void {
    goto(note.href);
    onclose();
  }

  function onBodyClick(e: MouseEvent): void {
    const a = (e.target as Element).closest("a[href]");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href")!;
    if (/^(https?|mailto):/i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
  }

  function onPointerDown(e: PointerEvent): void {
    const t = e.target as Node;
    if (!box.contains(t) && !note.anchor.contains(t)) onclose();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onpointerdown={onPointerDown} onkeydown={onKeydown} onscroll={onclose} onresize={place} />

<div class="note {side}" role="dialog" aria-label="Note" bind:this={box}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="body" bind:this={body} onclick={onBodyClick}></div>
  <div class="actions">
    <button class="btn small" onclick={jump}>Go to note</button>
    <button class="btn small" onclick={onclose}>Close</button>
  </div>
</div>

<style>
  .note {
    position: fixed; z-index: 35; left: 50%; transform: translateX(-50%);
    width: min(var(--book-width), calc(100vw - 16px));
    display: flex; flex-direction: column; max-height: min(var(--note-max, 22rem), 22rem);
    background: var(--chrome); color: var(--fg); border: 1px solid var(--line); border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  }
  /* Arrow pointing at the link; --arrow-x is set from the link's position. */
  .note::before {
    content: ""; position: absolute; left: var(--arrow-x, 50%); width: 12px; height: 12px;
    background: var(--chrome); transform: translateX(-50%) rotate(45deg);
  }
  .note.below::before { top: -7px; border-left: 1px solid var(--line); border-top: 1px solid var(--line); }
  .note.above::before { bottom: -7px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .body { overflow-y: auto; padding: 0.75rem 1rem; font-size: calc(var(--book-font) * 0.85); overscroll-behavior: contain; }
  /* The note keeps its book styling; only the box itself follows the shell theme. */
  .body :global(.epub-book) { background: transparent !important; max-width: none; margin: 0; padding: 0; }
  .body :global(.epub-book > section) { margin: 0; }
  .body :global(img) { max-width: 100%; height: auto; }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; padding: 0.4rem 0.75rem; border-top: 1px solid var(--line); }
</style>
