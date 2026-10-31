import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearHighlight, setHighlight } from "./highlights.js";

class FakeHighlight {
  priority = 0;
  ranges: unknown[];
  constructor(...ranges: unknown[]) {
    this.ranges = ranges;
  }
}

let layers: Map<string, FakeHighlight>;

beforeEach(() => {
  layers = new Map();
  Object.assign(globalThis, { Highlight: FakeHighlight, CSS: { highlights: layers } });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "Highlight");
  Reflect.deleteProperty(globalThis, "CSS");
});

const range = {} as Range;

describe("highlight layers", () => {
  it("shows ranges as a named layer, replacing the previous ones", () => {
    setHighlight("spoken", [range]);
    setHighlight("spoken", [range, range]);
    expect(layers.get("spoken")!.ranges).toHaveLength(2);
  });

  it("sets the priority of a layer", () => {
    setHighlight("current", [range], 3);
    expect(layers.get("current")!.priority).toBe(3);
  });

  it("removes a layer when given no ranges or cleared", () => {
    setHighlight("a", [range]);
    setHighlight("a", []);
    expect(layers.has("a")).toBe(false);
    setHighlight("b", [range]);
    clearHighlight("b");
    expect(layers.has("b")).toBe(false);
  });

  it("does nothing where the Highlight API is missing", () => {
    Reflect.deleteProperty(globalThis, "Highlight");
    expect(() => setHighlight("a", [range])).not.toThrow();
    expect(layers.size).toBe(0);
  });
});
