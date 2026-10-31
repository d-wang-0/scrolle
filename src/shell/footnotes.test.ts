// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { buildNoteIndex, noteFor } from "./footnotes.js";

/** Mount a one-chapter book and return a lookup for its links. */
function mount(html: string): (id: string) => Element {
  document.body.innerHTML = `<div class="epub-book"><section id="ch0" data-href="c.xhtml" class="body-class">${html}</section></div>`;
  return (id) => document.getElementById(id)!;
}

describe("noteFor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens a noteref pointing at an epub:type footnote, without ids or backlinks", () => {
    const $ = mount(`
      <p>Text<a id="ref1" href="#ch0--n1" epub:type="noteref">1</a></p>
      <aside id="ch0--n1" epub:type="footnote"><p id="inner">The note. <a href="#ref1" epub:type="backlink">back</a></p></aside>`);
    const note = noteFor($("ref1"));
    expect(note).not.toBeNull();
    expect(note!.href).toBe("#ch0--n1");
    expect(note!.content.querySelector("[id]")).toBeNull();
    expect(note!.content.querySelector("a")).toBeNull();
    expect(note!.content.textContent).toContain("The note.");
    expect(note!.content.querySelector("section")!.className).toBe("body-class");
  });

  it("recognises ARIA roles and notes without a noteref marker", () => {
    const $ = mount(`
      <p><a id="r" href="#ch0--n" role="doc-noteref">1</a></p>
      <ol><li id="ch0--n" role="doc-endnote">Endnote text</li></ol>`);
    const note = noteFor($("r"));
    expect(note!.content.textContent).toContain("Endnote text");
    expect(note!.content.querySelector("ul > li")).not.toBeNull();
  });

  it("falls back to the block around an unmarked target of a noteref", () => {
    const $ = mount(`
      <p><a id="r" href="#ch0--x" role="doc-noteref">1</a></p>
      <p>Before <a id="ch0--x"></a>the note body</p>`);
    expect(noteFor($("r"))!.content.textContent).toContain("the note body");
  });

  // Calibre can split endnote lists at page breaks and leave an empty copy of the
  // cut <li> (same id) in the first file; links land on that empty copy.
  const split = `
    <p>Text<a id="r" href="#ch2--footnote-126" role="doc-noteref" epub:type="noteref">4</a></p>
    </section>
    <section id="ch2" data-href="split_148.html"><ol>
      <li id="ch2--footnote-127" epub:type="rearnote" role="doc-endnote"><p>Other note.</p></li>
      <li id="ch2--footnote-126" epub:type="rearnote" role="doc-endnote"><div id="ch2--calibre_pb_298"></div></li>
    </ol></section>
    <section id="ch3" data-href="split_149.html"><ol>
      <li id="ch3--footnote-126" epub:type="rearnote" role="doc-endnote"><p>Sounds exhausting.</p></li>
      <li id="ch3--footnote-125" epub:type="rearnote" role="doc-endnote"><div id="ch3--calibre_pb_300"></div></li>
    </ol>`;

  it("finds the real note when the link lands on an empty Calibre split shell", () => {
    const $ = mount(split);
    const note = noteFor($("r"));
    expect(note!.content.textContent).toContain("Sounds exhausting.");
    expect(note!.href).toBe("#ch3--footnote-126");
  });

  it("shows no popup for a note that is empty everywhere", () => {
    const $ = mount(split.replace("Sounds exhausting.", ""));
    expect(noteFor($("r"))).toBeNull();
  });

  it("indexes note links once, without indexing ordinary links", () => {
    mount(`${split}<p><a id="plain" href="#ch2--footnote-127">x</a></p>`);
    const index = buildNoteIndex(document.body);
    expect(index.has(document.getElementById("r")!)).toBe(true);
    expect(index.get(document.getElementById("r")!)!.content.textContent).toContain("Sounds exhausting.");
    // Points at a real, non-empty rearnote, so it is a note link too.
    expect(index.get(document.getElementById("plain")!)!.content.textContent).toContain("Other note.");
  });

  it("ignores ordinary links, backlinks, and links inside a note", () => {
    const $ = mount(`
      <p><a id="plain" href="#ch0--h">see heading</a></p>
      <h2 id="ch0--h">Heading</h2>
      <aside id="ch0--n" epub:type="footnote">Note <a id="inner" href="#ch0--h">xref</a> <a id="bl" href="#plain" epub:type="backlink">↩</a></aside>`);
    expect(noteFor($("plain"))).toBeNull();
    expect(noteFor($("inner"))).toBeNull();
    expect(noteFor($("bl"))).toBeNull();
  });
});
