<script lang="ts">
  import { Popover, ToggleGroup } from "bits-ui";
  import { reader } from "./reader.svelte.js";
  import Icon from "./Icon.svelte";
  import Slider from "./Slider.svelte";
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
  <Popover.Trigger class="btn" aria-label="Menu"><Icon name="settings" size="1.1rem" /></Popover.Trigger>
  <Popover.Portal>
    <Popover.Content class="popover" align="end" sideOffset={8} strategy="fixed">
      <div class="actions-col">
        <div class="icons">
          <button class="btn icon" data-tip="Open book…" aria-label="Open book" onclick={openFile}>
            <Icon name="folder-open" />
          </button>
          <button class="btn icon" data-tip="Add book…" aria-label="Add book" disabled={!reader.book} onclick={addFile}>
            <Icon name="file-plus" />
          </button>
          <button class="btn icon" data-tip="Export as .html" aria-label="Export as .html" disabled={!reader.book} onclick={() => reader.exportHtml()}>
            <Icon name="download" />
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
      <div class="field">
        <span>Text size <output>{settings.fontSize}px</output></span>
        <Slider min={LIMITS.fontSize.min} max={LIMITS.fontSize.max} label="Text size" bind:value={settings.fontSize} />
      </div>
      <div class="field">
        <span>Column width <output>{settings.width}rem</output></span>
        <Slider min={LIMITS.width.min} max={LIMITS.width.max} label="Column width" bind:value={settings.width} />
      </div>
      <button class="btn small" onclick={resetSettings}>Reset to defaults</button>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
