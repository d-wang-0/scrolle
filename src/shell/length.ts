// Book length estimate: a page is a fixed number of characters of text, with no per-chapter rounding.
// 1650 is the median characters per page that I found reasonable

import type { TextLength } from "../compiler/index.js";

export const CHARS_PER_PAGE = 1650;

export interface BookLength {
  /** Characters of text per section, whitespace collapsed. */
  chars: number[];
  words: number;
  total: number;
}

/** Totals over the per-section lengths the compiler measured. */
export function measureLength(sections: TextLength[]): BookLength {
  const chars = sections.map((s) => s.chars);
  const words = sections.reduce((n, s) => n + s.words, 0);
  const total = chars.reduce((n, c) => n + c, 0);
  return { chars, words, total };
}

export const pageCount = (total: number): number => Math.max(1, Math.round(total / CHARS_PER_PAGE));
