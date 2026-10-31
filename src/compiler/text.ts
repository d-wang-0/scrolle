// Amount of text in a section, for the reader's length estimate (see shell/length.ts).

const SKIPPED = "style, script, template, title, desc";

export interface TextLength {
  /** Characters of text, whitespace collapsed. */
  chars: number;
  words: number;
}

export function textLength(root: Element): TextLength {
  let chars = 0;
  let words = 0;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    if (!/\S/.test(text) || node.parentElement?.closest(SKIPPED)) continue;
    chars += text.replace(/\s+/g, " ").length;
    words += text.match(/\S+/g)?.length ?? 0;
  }
  return { chars, words };
}
