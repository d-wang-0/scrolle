# EPUB spec notes (compiler reference)

Facts the compiler is built against, taken from the **EPUB 3.3** W3C Recommendation (13 January 2026) and EPUB 2.0.1 for legacy features. These are normative values we must not guess at; cited by section so decisions are traceable to the spec rather than to any one sample book.

## Core media types (§3.2)

Resources of these MIME types do **not** require a manifest fallback. Everything else is a "foreign resource" and (when used in the spine) needs a fallback chain ending in an EPUB content document.

- Images: `image/gif`, `image/jpeg`, `image/png`, `image/svg+xml`, `image/webp`
- Audio: `audio/mpeg`, `audio/mp4`, `audio/ogg; codecs=opus`
- Style: `text/css`
- Fonts: `font/ttf`, `application/font-sfnt`, `font/otf`, `application/vnd.ms-opentype`, `font/woff`, `application/font-woff`, `font/woff2`
- XHTML: `application/xhtml+xml`
- Scripts: `application/javascript`, `application/ecmascript`, `text/javascript`
- Legacy NCX: `application/x-dtbncx+xml`

## EPUB content documents (§6, and definitions)

- An **EPUB content document** is a spine (or fallback-chain) resource conforming to the **XHTML** (`application/xhtml+xml`) or **SVG** (`image/svg+xml`) content-document definitions.
- Therefore a spine `itemref` may reference **XHTML or SVG** directly. Body extraction must handle both: XHTML → take `<body>`; SVG → take the root `<svg>`.
- Any other (foreign) media type referenced from the spine requires a **manifest fallback chain** (§3.5.1) with at least one EPUB content document. The compiler follows `item@fallback` id references to resolve these.

## Manifest fallbacks (§3.5.1)

- A manifest `item` may carry `fallback="<idref>"` pointing at another manifest item.
- To render a foreign spine item, walk the fallback chain until an XHTML/SVG content document is found. Guard against cycles.

## Font obfuscation (§4.4) — IDPF algorithm

Needed for books that obfuscate embedded fonts. Fonts to deobfuscate are listed in `META-INF/encryption.xml` (an `EncryptedData` whose `EncryptionMethod@Algorithm` is the IDPF obfuscation URI `http://www.idpf.org/2008/embedding`; Adobe's scheme uses a different URI and key derivation).

Key (§4.4.3):
1. Take the publication **unique identifier** (the `dc:identifier` referenced by `package@unique-identifier`).
2. Remove XML whitespace code points: `U+0020`, `U+0009`, `U+000D`, `U+000A`.
3. Key = **SHA-1 digest** of the UTF-8 bytes of that string (20 bytes).

Algorithm (§4.4.4):
- Modify the **first 1040 bytes** of the font file (or the whole file if shorter).
- XOR source bytes with the 20-byte key, cycling the key every 20 bytes; i.e. byte `i` (0-based, for `i < 1040`) is `source[i] ^ key[i % 20]`.
- Copy any bytes beyond 1040 unchanged.

(Adobe's older obfuscation uses the first 1024 bytes and a key derived differently from the identifier; detect via the algorithm URI in `encryption.xml` and handle separately if encountered.)

## Navigation (§7) and legacy TOC (§5.9.5)

- EPUB 3 nav document: an XHTML content document with `properties="nav"` in the manifest. The TOC is the `<nav epub:type="toc">` containing a nested `<ol>`/`<li>`/`<a>` tree.
- EPUB 2 fallback: the NCX (`application/x-dtbncx+xml`), referenced by `spine@toc`, with a `navMap` of nested `navPoint`s.

## Spine `linear` (§5.7.2)

- `itemref@linear="no"` marks auxiliary content (notes, etc.). We include these in place (links commonly target them) but record the flag.
