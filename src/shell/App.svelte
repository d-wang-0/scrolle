<script lang="ts">
  import { onMount, untrack } from "svelte";
  import BookView from "./BookView.svelte";
  import Icon from "./Icon.svelte";
  import { canFullscreen, inExtension, initNative, isMobileApp, onBackButton, onFullscreenChange, setStatusBar, setWindowTitle, toggleFullscreen } from "./native.js";
  import Toc from "./Toc.svelte";
  import Menu from "./Menu.svelte";
  import Search from "./Search.svelte";
  import Scrollbar from "./Scrollbar.svelte";
  import { reader } from "./reader.svelte.js";
  import { settings, persistSettings, LIMITS } from "./settings.svelte.js";

  let fileInput: HTMLInputElement;
  // Search is the left sidebar and the table of contents the right one; both can be open.
  // Below this width sidebars overlay the book (see app.css), so two would overlap each other.
  const narrow = (): boolean => window.matchMedia("(max-width: 640px)").matches;
  // Remembered between launches. On a narrow window the panels overlay the book and each
  // other, so there only the search panel (if it was open) comes back.
  // On a touchscreen (the Android app, or a coarse primary pointer) everything starts hidden and
  // a tap on the page brings the chrome back, tablets included.
  const touchQuery = window.matchMedia("(pointer: coarse)");
  const isTouch = (): boolean => isMobileApp() || touchQuery.matches;
  let compact = $state(isTouch());
  onMount(() => {
    const update = (): void => void (compact = isTouch());
    touchQuery.addEventListener("change", update);
    return () => touchQuery.removeEventListener("change", update);
  });
  let fullscreen = $state(false);
  onMount(() => (canFullscreen() ? onFullscreenChange((on) => (fullscreen = on)) : undefined));
  let searchOpen = $state(settings.searchOpen && !untrack(() => compact));
  let tocOpen = $state(settings.tocOpen && !narrow() && !untrack(() => compact));
  let tapped = $state(false);
  let menuOpen = $state(false);
  const chromeShown = $derived(!compact || tapped || searchOpen || tocOpen || menuOpen);
  $effect(() => {
    document.documentElement.dataset.chrome = compact && !chromeShown ? "hidden" : "shown";
    // The status bar stays out of the way while reading, on tablets too.
    if (isMobileApp()) setStatusBar(compact && chromeShown);
  });
  /** A tap on the page: closes an open panel, otherwise shows or hides the chrome. */
  function onTap(): void {
    if (!compact) return;
    if (searchOpen || tocOpen) {
      searchOpen = tocOpen = false;
      tapped = false;
    } else tapped = !tapped;
  }
  function onMarginTap(e: MouseEvent): void {
    if (!(e.target as Element).closest("#content, button, a, input, .track, .foot")) onTap();
  }
  /** After picking a chapter or a result, a panel that overlays the book gets out of the way,
   *  leaving the buttons up so the reader can go back to it. */
  function onJump(): void {
    if (!narrow()) return;
    searchOpen = tocOpen = false;
    tapped = true;
  }
  let searchPanel = $state.raw<Search>();
  const leftWidth = $derived(searchOpen ? settings.searchWidth : 0);
  const rightWidth = $derived(tocOpen ? settings.tocWidth : 0);
  $effect(() => {
    settings.tocOpen = tocOpen;
    settings.searchOpen = searchOpen;
  });
  function toggleSearch(): void {
    searchOpen = !searchOpen;
    if (searchOpen && narrow()) tocOpen = false;
  }
  function toggleToc(): void {
    tocOpen = !tocOpen;
    if (tocOpen && narrow()) searchOpen = false;
  }
  const mb = (n: number): string => `${(n / 1048576).toFixed(1)} MB`;
  let dragging = $state(false);
  let dragDepth = 0;

  onMount(() => {
    void initNative((name, bytes) => reader.openBytes(name, bytes));
    onBackButton(() => {
      if (menuOpen) {
        menuOpen = false;
        return true;
      }
      if (!searchOpen && !tocOpen) return false;
      searchOpen = tocOpen = false;
      tapped = false;
      return true;
    });
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

  function onDropAppend(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
    dropTarget = "replace";
    dragDepth = 0;
    adding = true;
    pick(e.dataTransfer?.files);
  }

  function onDrop(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragging = false;
    dropTarget = "replace";
    dragDepth = 0;
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
    if (hasFiles(e) && --dragDepth <= 0) {
      dragging = false;
      dropTarget = "replace";
    }
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
      // One panel per press, search first.
      if (searchOpen) searchOpen = false;
      else tocOpen = false;
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && reader.book && inExtension()) {
      e.preventDefault();
      reader.downloadOriginals();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && reader.book) {
      e.preventDefault();
      searchOpen = true;
      if (narrow()) tocOpen = false;
      searchPanel?.focus();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} ondragenter={onDragEnter} ondragleave={onDragLeave} ondragover={(e) => e.preventDefault()} ondrop={onDrop} />

<input bind:this={fileInput} type="file" accept=".epub,application/epub+zip" multiple hidden onchange={() => pick(fileInput.files)} />

<div class="corner left">
  {#if reader.book}
    <button class="btn" aria-label="Search" aria-pressed={searchOpen} onclick={toggleSearch}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="4.5" /><path d="M10 10l4.5 4.5" />
      </svg>
    </button>
  {/if}
</div>
<div class="corner right">
  {#if reader.book}
    <button class="btn" aria-label="Table of contents" aria-pressed={tocOpen} onclick={toggleToc}><Icon name="menu" size="1.15rem" /></button>
    {#if canFullscreen()}
      <button class="btn" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={fullscreen ? "Exit fullscreen (F11)" : "Fullscreen (F11)"} onclick={() => void toggleFullscreen()}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if fullscreen}
            <path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4" />
          {:else}
            <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
          {/if}
        </svg>
      </button>
    {/if}
    {#if inExtension()}
      <button class="btn" aria-label="Download .epub" title="Download .epub (Ctrl+S)" onclick={() => reader.downloadOriginals()}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 2v8.5M4.5 7.5L8 11l3.5-3.5M2.5 14h11" />
        </svg>
      </button>
    {/if}
  {/if}
  <Menu bind:open={menuOpen} onopenfile={openFilePicker} onaddfile={addFilePicker} />
</div>

{#if reader.book}
  <Search bind:this={searchPanel} open={searchOpen} onjump={onJump} onclose={() => (searchOpen = false)} />
  <Toc nodes={reader.book.toc} open={tocOpen} onjump={onJump} onclose={() => (tocOpen = false)} />
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <!-- The text itself reports its own taps (BookView); this covers the blank space around it. -->
  <div class="layout" onclick={onMarginTap} style:--left-w="min({leftWidth}px, 90vw)" style:--right-w="min({rightWidth}px, 90vw)">
    <div class="spacer left"></div>
    <main
      style:--book-font="{settings.fontSize}px"
      style:--book-width="{settings.width}rem"
      style:--width-frac={(settings.width - LIMITS.width.min) / (LIMITS.width.max - LIMITS.width.min)}
    >
      {#key reader.book}
        <BookView book={reader.book} ontap={onTap} />
      {/key}
    </main>
    <div class="spacer right"></div>
    <Scrollbar />
    <footer class="foot">
      <div class="info">
        <div class="status" title="{reader.words.toLocaleString()} words">
          <button class="chapter" aria-label="Table of contents" aria-pressed={tocOpen} onclick={toggleToc}>
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
