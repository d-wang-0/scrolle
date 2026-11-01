<script lang="ts" module>
  export type IconName = "settings" | "close" | "menu" | "triangle-up" | "triangle-down" | "triangle-right";
  /** Drawn as solid shapes; the rest are strokes. */
  const FILLED: ReadonlySet<IconName> = new Set(["triangle-up", "triangle-down", "triangle-right"]);
</script>

<script lang="ts">
  /** Every icon in the app is one of these: an inline SVG, never a text glyph (☰ ▸ ✕ and the like).
   *  A glyph's position depends on the font, so it never sits dead centre in a button; these are drawn
   *  symmetrically about the middle of a 24 x 24 box. `size` is a CSS length; the default follows the font size. */
  let { name, size = "1em" }: { name: IconName; size?: string } = $props();
  const filled = $derived(FILLED.has(name));
</script>

<svg
  viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"
  fill={filled ? "currentColor" : "none"} stroke="currentColor" stroke-width={filled ? 2 : 1.75} stroke-linecap="round" stroke-linejoin="round"
>
  {#if name === "settings"}
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  {:else if name === "close"}
    <path d="M18 6 6 18M6 6l12 12" />
  {:else if name === "menu"}
    <path d="M4 6h16M4 12h16M4 18h16" />
  {:else if name === "triangle-up"}
    <path d="M12 5 20 19H4z" />
  {:else if name === "triangle-down"}
    <path d="M12 19 4 5h16z" />
  {:else if name === "triangle-right"}
    <path d="M6 4l14 8-14 8z" />
  {/if}
</svg>

<style>
  /* Block, not inline: an inline SVG sits on the text baseline, which puts it off-centre in a button. */
  svg { display: block; flex: none; }
</style>
