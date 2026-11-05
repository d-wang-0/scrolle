// Bridge to the native shells (Tauri on desktop, Capacitor on Android): files the OS hands
// the app (file association, "Open with") arrive here and are read as bytes.
// A no-op in a plain browser.

import { Capacitor, SystemBars, SystemBarType, registerPlugin } from "@capacitor/core";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type OpenBytes = (fileName: string, bytes: Uint8Array) => Promise<void>;

const inTauri = (): boolean => "__TAURI_INTERNALS__" in window;

/** True on the extension's reader page (see extension/). */
export const inExtension = (): boolean => !!(globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id;

/** True inside the Android app, where the reader chrome is hidden until the page is tapped. */
export const isMobileApp = (): boolean => Capacitor.isNativePlatform();

/** Fullscreen is offered everywhere except the Android app, which is already edge to edge. */
export const canFullscreen = (): boolean => !isMobileApp() && (inTauri() || document.fullscreenEnabled);

/** Toggle fullscreen: the native window in the exe, the Fullscreen API in a browser or the extension. */
export async function toggleFullscreen(): Promise<void> {
  if (!canFullscreen()) return;
  if (inTauri()) {
    const win = getCurrentWindow();
    await win.setFullscreen(!(await win.isFullscreen()));
  } else if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await document.documentElement.requestFullscreen();
  }
}

/** Whether the window is fullscreen. In a browser this also catches the browser's own F11, which
 *  the Fullscreen API does not report, by comparing the viewport with the screen. */
async function isFullscreen(): Promise<boolean> {
  if (inTauri()) return getCurrentWindow().isFullscreen();
  return document.fullscreenElement !== null || (innerWidth === screen.width && innerHeight === screen.height);
}

/** Call `cb` with the new state whenever fullscreen is entered or left; returns the unsubscribe. */
export function onFullscreenChange(cb: (on: boolean) => void): () => void {
  const check = (): void => void isFullscreen().then(cb);
  document.addEventListener("fullscreenchange", check);
  addEventListener("resize", check); // covers F11 in a browser and the exe's window
  check();
  return () => {
    document.removeEventListener("fullscreenchange", check);
    removeEventListener("resize", check);
  };
}

/** Show or hide the Android status bar. */
export function setStatusBar(visible: boolean): void {
  void (visible ? SystemBars.show : SystemBars.hide)({ bar: SystemBarType.StatusBar });
}

/** Set the native window title (the page `<title>` doesn't drive it). */
export function setWindowTitle(title: string): void {
  if (inTauri()) void getCurrentWindow().setTitle(title);
}

// The Android app (Capacitor) hands an opened .epub over as a content:// URI. Its plugins are
// registered by name rather than imported, so the web builds bundle none of them.
type AppPlugin = {
  getLaunchUrl(): Promise<{ url?: string } | undefined>;
  exitApp(): Promise<void>;
  addListener(event: "appUrlOpen", cb: (e: { url: string }) => void): unknown;
  addListener(event: "backButton", cb: (e: { canGoBack: boolean }) => void): unknown;
};
type FilesystemPlugin = {
  readFile(o: { path: string }): Promise<{ data: string | Blob }>;
  stat(o: { path: string }): Promise<{ name?: string }>;
};

const App = registerPlugin<AppPlugin>("App");

/** Android's Back button. `consume` returns true when it handled the press (by closing a panel);
 *  otherwise Back walks the page history, and exits the app once there is none. */
export function onBackButton(consume: () => boolean): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener("backButton", ({ canGoBack }) => {
    if (consume()) return;
    if (canGoBack) history.back();
    else void App.exitApp();
  });
}

async function initCapacitor(open: OpenBytes): Promise<void> {
  const Filesystem = registerPlugin<FilesystemPlugin>("Filesystem");

  const openUri = async (uri: string): Promise<void> => {
    const { data } = await Filesystem.readFile({ path: uri });
    const bytes = Uint8Array.from(atob(data as string), (c) => c.charCodeAt(0));
    let name = decodeURIComponent(uri.split(/[\\/]/).pop() ?? "");
    // content:// URIs are often opaque ids, so ask the provider for the real file name.
    const stat = await Filesystem.stat({ path: uri }).catch(() => undefined);
    if (stat?.name) name = stat.name;
    await open(/\.epub$/i.test(name) ? name : `${name || "book"}.epub`, bytes);
  };

  void App.addListener("appUrlOpen", (e) => void openUri(e.url));
  const launched = await App.getLaunchUrl();
  if (launched?.url) await openUri(launched.url);
}

export async function initNative(open: OpenBytes): Promise<void> {
  if (Capacitor.isNativePlatform()) return initCapacitor(open);
  if (!inTauri()) return;

  const openPath = async (path: string): Promise<void> => {
    const bytes = new Uint8Array(await invoke<ArrayBuffer>("read_epub", { path }));
    await open(path.split(/[\\/]/).pop() ?? path, bytes);
  };

  const launched = await invoke<string | null>("take_launch_file");
  if (launched) await openPath(launched);
}
