// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { compile, serializeToHtml } from "./index.js";
import { stripRemoteUrls } from "./css.js";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** A one-chapter EPUB whose chapter body, stylesheet and extra files are given. */
function epub(body: string, css = "p { color: red }", head = ""): Uint8Array {
  return zipSync({
    "mimetype": strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
    "OEBPS/content.opf": strToU8(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title><dc:identifier id="id">t</dc:identifier></metadata>
        <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="css" href="s.css" media-type="text/css"/><item id="img" href="a.png" media-type="image/png"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest>
        <spine toc="ncx"><itemref idref="c1"/></spine></package>`,
    ),
    "OEBPS/toc.ncx": strToU8(
      `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="n1"><navLabel><text>One</text></navLabel><content src="c1.xhtml"/></navPoint></navMap></ncx>`,
    ),
    "OEBPS/s.css": strToU8(css),
    "OEBPS/a.png": PNG,
    "OEBPS/c1.xhtml": strToU8(
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="s.css"/>${head}</head><body>${body}</body></html>`,
    ),
  });
}

function render(body: string, css?: string, head?: string): { root: HTMLElement; css: string } {
  const root = document.createElement("div");
  root.appendChild(compile(epub(body, css, head)).fragment.cloneNode(true));
  return { root, css: root.querySelector("style")!.textContent! };
}

describe("a book cannot reach outside itself", () => {
  it("removes scripts, handlers and elements that embed or restyle the page", () => {
    const { root } = render(
      `<p onclick="x()">a</p><script>x()</script><iframe src="http://e.test/"></iframe><iframe srcdoc="&lt;b&gt;"></iframe>` +
        `<object data="http://e.test/"></object><embed src="http://e.test/"/><style>p { font-family: serif }</style>` +
        `<link rel="stylesheet" href="http://e.test/x.css"/><base href="http://e.test/"/><meta http-equiv="refresh" content="0;url=http://e.test"/>` +
        `<form action="http://e.test/"><button formaction="http://e.test/">x</button></form>`,
    );
    const section = root.querySelector("section")!;
    expect(section.querySelector("script, iframe, object, embed, style, link, base, meta")).toBeNull();
    expect(section.querySelector("[onclick], [action], [formaction]")).toBeNull();
  });

  it("keeps a body <style> scoped instead of letting it apply to the app", () => {
    const { root, css } = render(`<p>a</p><style>p { font-family: serif }</style>`);
    expect(root.querySelector("section style")).toBeNull();
    expect(css).toMatch(/@scope \(\.epub-book\)[^]*font-family: serif/);
  });

  it("drops remote images, media and svg references, keeps the book's own", () => {
    const { root } = render(
      `<img id="remote" src="https://e.test/p.png"/><img id="proto" src="//e.test/p.png"/><img id="own" src="a.png"/>` +
        `<img id="missing" src="nope.png"/><img id="set" srcset="https://e.test/p.png 2x"/>` +
        `<video poster="http://e.test/p.png" src="http://e.test/v.mp4"></video>` +
        `<svg xmlns="http://www.w3.org/2000/svg"><image href="http://e.test/p.png"/><use href="http://e.test/s.svg#a"/></svg>`,
    );
    const q = (s: string): Element => root.querySelector(s.startsWith("#") ? `[id$="--${s.slice(1)}"]` : s)!;
    expect(q("#remote").hasAttribute("src")).toBe(false);
    expect(q("#proto").hasAttribute("src")).toBe(false);
    expect(q("#missing").hasAttribute("src")).toBe(false);
    expect(q("#set").hasAttribute("srcset")).toBe(false);
    expect(q("#own").getAttribute("src")).toMatch(/^(blob:|data:image\/png)/);
    expect(q("video").hasAttribute("src")).toBe(false);
    expect(q("video").hasAttribute("poster")).toBe(false);
    expect(q("image").hasAttribute("href")).toBe(false);
    expect(q("use").hasAttribute("href")).toBe(false);
  });

  it("allows only web, mail and phone links", () => {
    const { root } = render(
      `<a id="web" href="https://e.test/">w</a><a id="mail" href="mailto:a@e.test">m</a>` +
        `<a id="js" href="javascript:x()">j</a><a id="data" href="data:text/html,x">d</a><a id="file" href="file:///c:/x">f</a>` +
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a id="svg" xlink:href="javascript:x()"><text>s</text><set attributeName="href" to="javascript:x()"/></a></svg>`,
    );
    const link = (n: string): Element => root.querySelector(`[id$="--${n}"]`)!;
    expect(link("web").getAttribute("href")).toBe("https://e.test/");
    expect(link("mail").hasAttribute("href")).toBe(true);
    for (const n of ["js", "data", "file"]) expect(link(n).hasAttribute("href")).toBe(false);
    expect(link("svg").hasAttribute("xlink:href")).toBe(false);
    expect(root.querySelector("set")).toBeNull();
  });

  it("removes network references from stylesheets and inline styles", () => {
    const css =
      `@import url("https://e.test/a.css");\n@import "//e.test/b.css";\n` +
      `@font-face { font-family: F; src: url(https://e.test/f.woff2) }\n` +
      `p { background: url('http://e.test/p.png'); color: red }`;
    const { root, css: out } = render(`<p style="background-image: url(https://e.test/q.png)">a</p>`, css);
    expect(out).not.toMatch(/e\.test/);
    expect(out).toContain("color: red");
    expect(root.querySelector("p")!.getAttribute("style") ?? "").not.toContain("e.test");
  });

  it("gives the exported page a CSP that allows no network and no scripts", () => {
    const html = serializeToHtml(compile(epub("<p>a</p>")));
    expect(html).toMatch(/Content-Security-Policy[^>]*default-src 'none'/);
  });
});

describe("stripRemoteUrls", () => {
  it("leaves local and data URLs alone", () => {
    const css = `a { background: url(data:image/png;base64,AAAA) } b { background: url("x.png") }`;
    expect(stripRemoteUrls(css)).toBe(css);
  });
  it("neutralises image-set() strings", () => {
    expect(stripRemoteUrls(`a { background: image-set("https://e.test/a.png" 1x, "https://e.test/b.png" 2x) }`)).not.toContain("e.test");
  });
});
