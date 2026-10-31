// Sends .epub navigations and downloads to the reader page instead of saving them.
// Dragging a file into Chrome or opening file:///…/book.epub is a navigation to a
// file: URL and always opens the reader; EPUBs on the web only do when the
// "openWebEpubs" option (options.html) is on.

const READER = chrome.runtime.getURL("index.html");
const readerUrl = (url) => `${READER}?url=${encodeURIComponent(url)}`;

let openWeb = true;
const ready = chrome.storage.local.get({ openWebEpubs: true }).then((v) => {
  openWeb = v.openWebEpubs;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.openWebEpubs) openWeb = changes.openWebEpubs.newValue;
});

function epubScheme(url) {
  try {
    const u = new URL(url);
    return /\.epub3?$/i.test(decodeURIComponent(u.pathname)) ? u.protocol : null;
  } catch {
    return null;
  }
}

// URLs just redirected, so the download Chrome may still start for them isn't opened twice.
const redirected = new Map();
const recently = (url) => Date.now() - (redirected.get(url) ?? 0) < 10000;

chrome.webNavigation.onBeforeNavigate.addListener(async (d) => {
  if (d.frameId !== 0) return;
  const scheme = epubScheme(d.url);
  if (scheme !== "file:" && scheme !== "http:" && scheme !== "https:") return;
  if (scheme !== "file:") {
    await ready;
    if (!openWeb) return;
  }
  redirected.set(d.url, Date.now());
  chrome.tabs.update(d.tabId, { url: readerUrl(d.url) });
});

// Catches web EPUBs the navigation hook can't see: ones served without a .epub URL,
// identified by MIME type or the suggested file name.
chrome.downloads.onCreated.addListener(async (item) => {
  const url = item.finalUrl || item.url;
  if (!/^https?:/.test(url)) return;
  const epub = item.mime === "application/epub+zip" || epubScheme(url) || /\.epub3?$/i.test(item.filename);
  if (!epub) return;
  await ready;
  if (!openWeb) return;
  await chrome.downloads.cancel(item.id).catch(() => {});
  await chrome.downloads.erase({ id: item.id });
  if (!recently(url) && !recently(item.url)) chrome.tabs.create({ url: readerUrl(url) });
});

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: READER }));
