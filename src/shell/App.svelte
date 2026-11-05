<script lang="ts">
  import { onMount } from "svelte";
  import BookView from "./BookView.svelte";
  import Icon from "./Icon.svelte";
  import { canFullscreen, inExtension, initNative, isMobileApp, onBackButton, onFullscreenChange, setStatusBar, setWindowTitle, toggleFullscreen } from "./native.js";
  import Toc from "./Toc.svelte";
  import Menu from "./Menu.svelte";
  import Search from "./Search.svelte";
  import Scrollbar from "./Scrollbar.svelte";
  import { Chrome } from "./chrome.svelte.js";
  import { reader } from "./reader.svelte.js";
  import { settings, persistSettings, LIMITS } from "./settings.svelte.js";

  let fileInput: HTMLInputElement;
  // Search is the left sidebar and the table of contents the right one; both can be open.
  const chrome = new Chrome();
  onMount(() => chrome.watch());
  let fullscreen = $state(false);
  onMount(() => (canFullscreen() ? onFullscreenChange((on) => (fullscreen = on)) : undefined));
  $effect(() => {
    document.documentElement.dataset.chrome = chrome.compact && !chrome.shown ? "hidden" : "shown";
    // The status bar stays out of the way while reading, on tablets too.
    if (isMobileApp()) setStatusBar(chrome.compact && chrome.shown);
  });
  function onMarginTap(e: MouseEvent): void {
    if (!(e.target as Element).closest("#content, button, a, input, .track, .foot")) chrome.tap();
  }
  let searchPanel = $state.raw<Search>();
  const leftWidth = $derived(chrome.searchOpen ? settings.searchWidth : 0);
  const rightWidth = $derived(chrome.tocOpen ? settings.tocWidth : 0);
  const mb = (n: number): string => `${(n / 1048576).toFixed(1)} MB`;
  let dragging = $state(false);
  let dragDepth = 0;

  onMount(() => {
    void initNative((name, bytes) => reader.openBytes(name, bytes));
    onBackButton(() => chrome.back());
    // The browser extension sends EPUB links here as ?url=.
    const url = new URLSearchParams(location.search).get("url");
    if (url) void reader.openUrl(url);
  });

  $effect(() => {
    persistSettings();
    document.documentElement.dataset.theme = settings.theme;
  });

  $effect(() => {
    const meta = reader.book?.metadata;
    const title = meta?.title ?? reader.name;
    document.title = !reader.book ? "Scrolle" : meta?.authors.length ? `${title} — ${meta.authors.join(", ")}` : title;
    setWindowTitle(document.title);
  });

  let dropTarget = $state<"replace" | "add">("replace");
  let adding = false;

  function pick(files: FileList | null | undefined): void {
    if (!files?.length) return;
    void (adding ? reader.appendFiles([...files]) : reader.openFiles([...files]));
    adding = false;
  }

  function endDrag(): void {
    dragging = false;
    dropTarget = "replace";
    dragDepth = 0;
  }

  function onDropAppend(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    endDrag();
    adding = true;
    pick(e.dataTransfer?.files);
  }

  function onDrop(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    endDrag();
    pick(e.dataTransfer?.files);
  }

  // Only file drags open or add books; in-page drags (reordering the contents) are not ours.
  const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes("Files") ?? false;

  function onDragEnter(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dragging = true;
  }

  function onDragLeave(e: DragEvent): void {
    if (hasFiles(e) && --dragDepth <= 0) endDrag();
  }

  function openFilePicker(): void {
    adding = false;
    fileInput.click();
  }

  function addFilePicker(): void {
    adding = true;
    fileInput.click();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "F11" && canFullscreen()) {
      // Browsers do this natively; the exe's webview does not.
      e.preventDefault();
      void toggleFullscreen();
    } else if (e.key === "Escape") {
      chrome.escape();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && reader.book && inExtension()) {
      e.preventDefault();
      reader.downloadOriginals();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && reader.book) {
      e.preventDefault();
      chrome.showSearch();
      searchPanel?.focus();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} ondragenter={onDragEnter} ondragleave={onDragLeave} ondragover={(e) => e.preventDefault()} ondrop={onDrop} />

<input bind:this={fileInput} type="file" accept=".epub,application/epub+zip" multiple hidden onchange={() => pick(fileInput.files)} />

<div class="corner left">
  {#if reader.book}
    <button class="btn" aria-label="Search" aria-pressed={chrome.searchOpen} onclick={() => chrome.toggleSearch()}>
      <Icon name="search" size="14px" />
    </button>
  {/if}
</div>
<div class="corner right">
  {#if reader.book}
    <button class="btn" aria-label="Table of contents" aria-pressed={chrome.tocOpen} onclick={() => chrome.toggleToc()}><Icon name="menu" size="1.15rem" /></button>
    {#if canFullscreen()}
      <button class="btn" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={fullscreen ? "Exit fullscreen (F11)" : "Fullscreen (F11)"} onclick={() => void toggleFullscreen()}>
        <Icon name={fullscreen ? "fullscreen-exit" : "fullscreen"} size="14px" />
      </button>
    {/if}
    {#if inExtension()}
      <button class="btn" aria-label="Download .epub" title="Download .epub (Ctrl+S)" onclick={() => reader.downloadOriginals()}>
        <Icon name="download-sm" size="14px" />
      </button>
    {/if}
  {/if}
  <Menu bind:open={chrome.menuOpen} onopenfile={openFilePicker} onaddfile={addFilePicker} />
</div>

{#if reader.book}
  <Search bind:this={searchPanel} open={chrome.searchOpen} onjump={() => chrome.jumped()} onclose={() => (chrome.searchOpen = false)} />
  <Toc nodes={reader.book.toc} open={chrome.tocOpen} onjump={() => chrome.jumped()} onclose={() => (chrome.tocOpen = false)} />
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <!-- The text itself reports its own taps (BookView); this covers the blank space around it. -->
  <div class="layout" onclick={onMarginTap} style:--left-open="min({leftWidth}px, 90vw)" style:--right-open="min({rightWidth}px, 90vw)">
    <div class="spacer left"></div>
    <main
      style:--book-font="{settings.fontSize}px"
      style:--book-width="{settings.width}rem"
      style:--width-frac={(settings.width - LIMITS.width.min) / (LIMITS.width.max - LIMITS.width.min)}
    >
      {#key reader.book}
        <BookView book={reader.book} ontap={() => chrome.tap()} />
      {/key}
    </main>
    <div class="spacer right"></div>
    <Scrollbar />
    <footer class="foot">
      <div class="info">
        <div class="status" title="{reader.words.toLocaleString()} words">
          <button class="chapter" aria-label="Table of contents" aria-pressed={chrome.tocOpen} onclick={() => chrome.toggleToc()}>
            {reader.active?.label ?? "Contents"}
          </button>
          <span class="pct">p. {reader.page.toLocaleString()} / {reader.pages.toLocaleString()} · {Math.round(reader.progress * 100)}%</span>
        </div>
      </div>
    </footer>
  </div>
{:else}
  <main class="empty">
    {#if reader.downloading}
      <p>Downloading…</p>
      <progress max={reader.fetchTotal || 1} value={reader.fetchTotal ? reader.fetched : undefined}></progress>
      <p>{mb(reader.fetched)}{reader.fetchTotal ? ` of ${mb(reader.fetchTotal)}` : ""}</p>
    {:else if reader.loading}
      <p>Opening…</p>
    {:else}
      <p>Drop an <strong>.epub</strong> anywhere, or</p>
      <button class="btn primary" onclick={openFilePicker}>Open a book</button>
      {#if reader.error}<p class="error">{reader.error}</p>{/if}
    {/if}
  </main>
{/if}

{#if dragging}
  <!-- Two side-by-side drop zones; the one under the pointer is highlighted. A drop on the replace zone bubbles to the window handler. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drop-zones">
    <div class="drop-zone replace" class:inactive={dropTarget !== "replace"} ondragover={() => (dropTarget = "replace")}>
      <span class="drop-label">{reader.book ? "Drop to replace" : "Drop to open"}</span>
    </div>
    {#if reader.book}
      <div class="drop-zone add" class:inactive={dropTarget !== "add"} ondragover={() => (dropTarget = "add")} ondrop={onDropAppend}>
        <span class="drop-label">Drop to add to the end</span>
      </div>
    {/if}
  </div>
{/if}
