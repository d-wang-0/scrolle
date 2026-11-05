// Binary searches over sorted data that is not always an array (DOM ranges, keys read through an index).

/** The first index in 0..count for which `test` is true, or `count` if there is none. `test` must be false up to some index and true from there on. */
export function firstWhere(count: number, test: (i: number) => boolean): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (test(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Index of the last of `count` ascending keys that is <= `target`, or -1. */
export function lastAtOrBefore(count: number, key: (i: number) => number, target: number): number {
  return firstWhere(count, (i) => key(i) > target) - 1;
}
