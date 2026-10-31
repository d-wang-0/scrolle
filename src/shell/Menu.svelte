<script lang="ts">
  import { Popover, ToggleGroup } from "bits-ui";
  import { reader } from "./reader.svelte.js";
  import { settings, resetSettings, LIMITS } from "./settings.svelte.js";

  let { open = $bindable(false), onopenfile, onaddfile }: { open?: boolean; onopenfile: () => void; onaddfile: () => void } = $props();

  function openFile(): void {
    open = false;
    onopenfile();
  }

  function addFile(): void {
    open = false;
    onaddfile();
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger class="btn" aria-label="Menu">⚙</Popover.Trigger>
  <Popover.Portal>
    <Popover.Content class="popover" align="end" sideOffset={8} strategy="fixed">
      <div class="actions-col">
        <div class="icons">
          <button class="btn icon" data-tip="Open book…" aria-label="Open book" onclick={openFile}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></svg>
          </button>
          <button class="btn icon" data-tip="Add book…" aria-label="Add book" disabled={!reader.book} onclick={addFile}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" /><path d="M14 2v6h6M12 18v-6M9 15h6" /></svg>
          </button>
          <button class="btn icon" data-tip="Export as .html" aria-label="Export as .html" disabled={!reader.book} onclick={() => reader.exportHtml()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          </button>
        </div>
      </div>
      <hr />
      <div class="field">
        <span>Theme</span>
        <ToggleGroup.Root
          type="single"
          class="seg"
          bind:value={() => settings.theme, (v) => v && (settings.theme = v as "dark" | "light")}
        >
          <ToggleGroup.Item value="dark">Dark</ToggleGroup.Item>
          <ToggleGroup.Item value="light">Light</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
      <div class="field">
        <span>Invert images</span>
        <ToggleGroup.Root
          type="single"
          class="seg"
          bind:value={() => settings.invertImages, (v) => v && (settings.invertImages = v as "off" | "bw" | "all")}
        >
          <ToggleGroup.Item value="off">Off</ToggleGroup.Item>
          <ToggleGroup.Item value="bw">B&amp;W</ToggleGroup.Item>
          <ToggleGroup.Item value="all">All</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
      <label class="field">
        <span>Text size <output>{settings.fontSize}px</output></span>
        <input type="range" min={LIMITS.fontSize.min} max={LIMITS.fontSize.max} step="1" bind:value={settings.fontSize} />
      </label>
      <label class="field">
        <span>Column width <output>{settings.width}rem</output></span>
        <input type="range" min={LIMITS.width.min} max={LIMITS.width.max} step="1" bind:value={settings.width} />
      </label>
      <label class="field">
        <span>Search result position <output>{settings.hitOffset}%</output></span>
        <input type="range" min={LIMITS.hitOffset.min} max={LIMITS.hitOffset.max} step="1" bind:value={settings.hitOffset} />
      </label>
      <label class="field">
        <span>Search scroll speed <output>{settings.glideMs ? `${settings.glideMs}ms` : "instant"}</output></span>
        <input type="range" min={LIMITS.glideMs.min} max={LIMITS.glideMs.max} step="20" bind:value={settings.glideMs} />
      </label>
      <button class="btn small" onclick={resetSettings}>Reset to defaults</button>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
