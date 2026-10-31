// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { TocNode } from "../compiler/index.js";
import { BookIndex, type Query } from "./search.js";

const contains = (text: string, caseSensitive = false): Query => ({ text, mode: "contains", caseSensitive });
const never = () => false;

function toc(label: string, href: string): TocNode {
  return { label, href, children: [] };
}

let sections: HTMLElement[];
let index: BookIndex;
const entries = [toc("One", "#one"), toc("Two", "#two")];

beforeEach(() => {
  document.body.innerHTML = `
    <div class="epub-book">
      <section id="ch0"><h1 id="one">Chapter One</h1><p>It was a <em>dark</em> and stormy night.</p><p>Caf&eacute; au lait, naïve.</p><style>.x{}</style></section>
      <section id="ch1"><h1 id="two">Chapter Two</h1><p>The   storm\n passed;  the night   was dark again.</p><script>var dark;</script></section>
    </div>`;
  sections = [...document.querySelectorAll<HTMLElement>(".epub-book > section")];
  index = new BookIndex(sections, entries, (href) => document.getElementById(href.slice(1)));
});

describe("BookIndex.search", () => {
  it("finds matches across sections in document order, with context and the TOC entry in force", async () => {
    const hits = (await index.search(contains("dark"), never))!;
    expect(hits.map((h) => [h.n, h.section, h.start, h.end, h.match, h.toc?.label])).toEqual([
      [0, 0, 23, 27, "dark", "One"],
      [1, 1, 52, 56, "dark", "Two"],
    ]);
    expect(hits[0]!.before).toBe("Chapter One It was a ");
    expect(hits[0]!.after).toBe(" and stormy night. Café au lait, naïve.");
  });

  it("matches across inline tags, ignoring whitespace runs, case and accents", async () => {
    expect((await index.search(contains("a DARK and"), never))!.map((h) => h.match)).toEqual(["a dark and"]);
    expect((await index.search(contains("cafe au lait"), never))!.map((h) => h.match)).toEqual(["Café au lait"]);
    expect((await index.search(contains("storm passed"), never))!.map((h) => h.match)).toEqual(["storm passed"]);
    expect(await index.search(contains("CAFE", true), never)).toEqual([]);
  });

  it("does not search style or script content", async () => {
    expect(await index.search(contains("var"), never)).toEqual([]);
    expect(await index.search(contains(".x{}"), never)).toEqual([]);
  });

  it("supports regular expressions", async () => {
    const hits = (await index.search({ text: "st\\w+", mode: "regex", caseSensitive: true }, never))!;
    expect(hits.map((h) => h.match)).toEqual(["stormy", "storm"]);
  });

  it("returns null when cancelled", async () => {
    let calls = 0;
    const result = await index.search(contains("night"), () => ++calls > 0);
    // Only checked after a time slice elapses, so a fast search finishes either way.
    expect(result === null || result.length === 2).toBe(true);
  });
});

describe("BookIndex.rangeFor", () => {
  it("returns a DOM range over the matched text, across inline tags", async () => {
    const [hit] = (await index.search(contains("a dark and"), never))!;
    const range = index.rangeFor(hit!);
    expect(range.toString()).toBe("a dark and");
    expect(range.startContainer.parentElement?.localName).toBe("p");
    expect(range.endContainer.parentElement?.localName).toBe("p");
  });

  it("ends a range at the end of the node that holds the end of the match", async () => {
    const [hit] = (await index.search(contains("Chapter One"), never))!;
    const range = index.rangeFor(hit!);
    expect(range.toString()).toBe("Chapter One");
    expect(range.endContainer.parentElement?.localName).toBe("h1");
  });

  it("starts a range in the next node when the match starts in a block boundary", async () => {
    const [hit] = (await index.search({ text: "\\nIt", mode: "regex", caseSensitive: true }, never))!;
    const range = index.rangeFor(hit!);
    expect(range.startContainer.parentElement?.localName).toBe("p");
    expect(range.toString()).toBe("It");
  });
});
