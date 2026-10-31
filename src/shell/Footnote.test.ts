// @vitest-environment happy-dom
import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it } from "vitest";
import Footnote from "./Footnote.svelte";
import { noteFor } from "./footnotes.js";

describe("Footnote popup", () => {
  it("renders the note's content", () => {
    document.body.innerHTML = `<div class="epub-book"><section id="ch0" data-href="c.xhtml">
      <p>Text<sup><a id="ref" href="#ch0--n" epub:type="noteref" role="doc-noteref">1</a></sup></p>
      <ol><li id="ch0--n" epub:type="rearnote"><p class="FNTX"><a hidden href="#ref"><span>1</span></a> The note text.</p></li></ol>
    </section></div>`;
    const note = noteFor(document.getElementById("ref")!)!;
    const target = document.createElement("div");
    document.body.appendChild(target);
    const app = mount(Footnote, { target, props: { note, onclose: () => {} } });
    flushSync();
    const body = target.querySelector(".body")!;
    expect(body.textContent).toContain("The note text.");
    void unmount(app);
  });
});
