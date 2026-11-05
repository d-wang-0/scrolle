<script lang="ts" module>
  export type IconName =
    | "settings" | "close" | "menu" | "triangle-up" | "triangle-down" | "triangle-right"
    | "search" | "fullscreen" | "fullscreen-exit" | "download-sm" | "download" | "folder-open" | "file-plus"
    | "chevron-down" | "chevrons-down-up" | "chevrons-up-down";

  /** How an icon is drawn when it is not a 24 x 24 stroke of 1.75. `stroke: 0` is a solid shape with no outline. */
  interface Spec { box?: number; stroke?: number; filled?: boolean }
  const SPECS: Partial<Record<IconName, Spec>> = {
    "triangle-up": { filled: true }, "triangle-down": { filled: true }, "triangle-right": { filled: true },
    search: { box: 16, stroke: 1.8 }, fullscreen: { box: 16, stroke: 1.8 }, "fullscreen-exit": { box: 16, stroke: 1.8 },
    "download-sm": { box: 16, stroke: 1.8 }, "chevron-down": { box: 16 },
  };
</script>

<script lang="ts">
  /** Every icon in the app is one of these: an inline SVG, never a text glyph (☰ ▸ ✕ and the like).
   *  A glyph's position depends on the font, so it never sits dead centre in a button; these are drawn
   *  symmetrically about the middle of a 24 x 24 box (a few keep the 16 x 16 box they were drawn in, see SPECS). `size` is a CSS length; the default follows the font size. */
  let { name, size = "1em" }: { name: IconName; size?: string } = $props();
  const spec = $derived(SPECS[name] ?? {});
  const box = $derived(spec.box ?? 24);
  const filled = $derived(spec.filled ?? false);
  const stroke = $derived(spec.stroke ?? (filled ? 2 : 1.75));
</script>

<svg
  viewBox="0 0 {box} {box}" width={size} height={size} aria-hidden="true" focusable="false" class:filled
  fill={filled ? "currentColor" : "none"} stroke={stroke ? "currentColor" : "none"} stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round"
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
  {:else if name === "search"}
    <circle cx="6.5" cy="6.5" r="4.5" /><path d="M10 10l4.5 4.5" />
  {:else if name === "fullscreen"}
    <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
  {:else if name === "fullscreen-exit"}
    <path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4" />
  {:else if name === "download-sm"}
    <path d="M8 2v8.5M4.5 7.5L8 11l3.5-3.5M2.5 14h11" />
  {:else if name === "download"}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  {:else if name === "folder-open"}
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  {:else if name === "file-plus"}
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" /><path d="M14 2v6h6M12 18v-6M9 15h6" />
  {:else if name === "chevron-down"}
    <path d="M4 6.5l4 4 4-4" />
  {:else if name === "chevrons-down-up"}
    <path d="m7 20 5-5 5 5M7 4l5 5 5-5" />
  {:else if name === "chevrons-up-down"}
    <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
  {/if}
</svg>

<style>
  /* Block, not inline: an inline SVG sits on the text baseline, which puts it off-centre in a button. */
  svg { display: block; flex: none; }
</style>
