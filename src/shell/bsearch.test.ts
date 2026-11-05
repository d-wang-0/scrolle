import { describe, expect, it } from "vitest";
import { firstWhere, lastAtOrBefore } from "./bsearch.js";

const keys = [1, 3, 3, 5, 8, 8, 8, 13];
const naiveLast = (target: number): number => keys.reduce((last, k, i) => (k <= target ? i : last), -1);
const naiveFirst = (target: number): number => {
  const i = keys.findIndex((k) => k >= target);
  return i < 0 ? keys.length : i;
};

describe("firstWhere", () => {
  it("finds where the test turns true, for every target", () => {
    for (let target = 0; target <= 15; target++) {
      expect(firstWhere(keys.length, (i) => keys[i]! >= target)).toBe(naiveFirst(target));
    }
  });

  it("returns the count when the test is never true, and 0 for nothing", () => {
    expect(firstWhere(5, () => false)).toBe(5);
    expect(firstWhere(0, () => true)).toBe(0);
  });
});

describe("lastAtOrBefore", () => {
  it("finds the last key at or before the target, for every target", () => {
    for (let target = 0; target <= 15; target++) {
      expect(lastAtOrBefore(keys.length, (i) => keys[i]!, target)).toBe(naiveLast(target));
    }
  });

  it("is -1 when everything is later, or there is nothing", () => {
    expect(lastAtOrBefore(keys.length, (i) => keys[i]!, 0)).toBe(-1);
    expect(lastAtOrBefore(0, () => 0, 5)).toBe(-1);
  });
});
