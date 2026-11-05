// The reader's chrome: which sidebars are open, and on a touchscreen whether the buttons are showing.
// The open flags live in `settings`, so they are remembered between launches.

import { isMobileApp } from "./native.js";
import { settings } from "./settings.svelte.js";

/** Below this width sidebars overlay the book (see app.css), so two would overlap each other. */
export const narrow = (): boolean => window.matchMedia("(max-width: 640px)").matches;

export class Chrome {
  private touchQuery = window.matchMedia("(pointer: coarse)");
  /** On a touchscreen (the Android app, or a coarse primary pointer, tablets included) everything starts hidden
   *  and a tap on the page brings the chrome back. */
  compact = $state(this.isTouch());
  tapped = $state(false);
  menuOpen = $state(false);
  shown = $derived(!this.compact || this.tapped || this.searchOpen || this.tocOpen || this.menuOpen);

  constructor() {
    // On a narrow window the panels overlay the book and each other, so there only the search panel comes back.
    settings.searchOpen &&= !this.compact;
    settings.tocOpen &&= !narrow() && !this.compact;
  }

  get searchOpen(): boolean {
    return settings.searchOpen;
  }
  set searchOpen(open: boolean) {
    settings.searchOpen = open;
  }
  get tocOpen(): boolean {
    return settings.tocOpen;
  }
  set tocOpen(open: boolean) {
    settings.tocOpen = open;
  }

  private isTouch(): boolean {
    return isMobileApp() || this.touchQuery.matches;
  }

  /** Follow the pointer type changing (a keyboard dock, a detached tablet). Returns the cleanup. */
  watch(): () => void {
    const update = (): void => void (this.compact = this.isTouch());
    this.touchQuery.addEventListener("change", update);
    return () => this.touchQuery.removeEventListener("change", update);
  }

  closePanels(): void {
    this.searchOpen = this.tocOpen = false;
  }

  showSearch(): void {
    this.searchOpen = true;
    if (narrow()) this.tocOpen = false;
  }

  toggleSearch(): void {
    if (this.searchOpen) this.searchOpen = false;
    else this.showSearch();
  }

  toggleToc(): void {
    this.tocOpen = !this.tocOpen;
    if (this.tocOpen && narrow()) this.searchOpen = false;
  }

  /** A tap on the page: closes an open panel, otherwise shows or hides the chrome. */
  tap(): void {
    if (!this.compact) return;
    if (this.searchOpen || this.tocOpen) {
      this.closePanels();
      this.tapped = false;
    } else this.tapped = !this.tapped;
  }

  /** After picking a chapter or a result, a panel that overlays the book gets out of the way,
   *  leaving the buttons up so the reader can go back to it. */
  jumped(): void {
    if (!narrow()) return;
    this.closePanels();
    this.tapped = true;
  }

  /** The Android back button. True when it closed something. */
  back(): boolean {
    if (this.menuOpen) {
      this.menuOpen = false;
      return true;
    }
    if (!this.searchOpen && !this.tocOpen) return false;
    this.closePanels();
    this.tapped = false;
    return true;
  }

  /** One panel per press, search first. */
  escape(): void {
    if (this.searchOpen) this.searchOpen = false;
    else this.tocOpen = false;
  }
}
