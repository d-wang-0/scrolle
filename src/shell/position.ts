// Reading position per book: the section being read plus how far through it.
// Stored as an anchor rather than a pixel offset so it survives font-size and
// column-width changes.

export interface Position {
  /** Section element id (`ch{N}`). */
  id: string;
  /** Fraction (0-1) of the way through that section. */
  f: number;
}

import { readJson, writeJson } from "./storage.js";

const prefix = "scrolle:pos:";

export function loadPosition(key: string): Position | null {
  const p = readJson<Position>(prefix + key);
  return p && typeof p.id === "string" && typeof p.f === "number" ? p : null;
}

export function savePosition(key: string, pos: Position): void {
  writeJson(prefix + key, pos);
}
