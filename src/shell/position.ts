// Reading position per book: the section being read plus how far through it.
// Stored as an anchor rather than a pixel offset so it survives font-size and
// column-width changes.

export interface Position {
  /** Section element id (`ch{N}`). */
  id: string;
  /** Fraction (0-1) of the way through that section. */
  f: number;
}

const prefix = "scrolle:pos:";

export function loadPosition(key: string): Position | null {
  try {
    const p = JSON.parse(localStorage.getItem(prefix + key) ?? "null") as Position | null;
    return p && typeof p.id === "string" && typeof p.f === "number" ? p : null;
  } catch {
    return null;
  }
}

export function savePosition(key: string, pos: Position): void {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(pos));
  } catch {
    // Storage unavailable; position just won't persist.
  }
}
