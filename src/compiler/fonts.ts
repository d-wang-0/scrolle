// Font deobfuscation per EPUB 3.3 §4.4 (IDPF algorithm) and the legacy Adobe
// scheme. Fonts to deobfuscate are listed in META-INF/encryption.xml.
// See docs/epub-spec-notes.md.
//
// A synchronous SHA-1 is used (rather than async crypto.subtle) so the whole
// compile() pipeline can stay synchronous. SHA-1 here is not used for security
// — only to derive the IDPF obfuscation key as the spec mandates.

import { Archive } from "./archive.js";
import { parseXml, allByLocal, attr } from "./xml.js";
import { normalize } from "./paths.js";

export const IDPF_ALGORITHM = "http://www.idpf.org/2008/embedding";
export const ADOBE_ALGORITHM = "http://ns.adobe.com/pdf/enc#RC";

const ENCRYPTION_PATH = "META-INF/encryption.xml";

/** Map of obfuscated-resource zip path -> algorithm URI, from encryption.xml. */
export function readEncryptionList(archive: Archive): Map<string, string> {
  const map = new Map<string, string>();
  const text = archive.text(ENCRYPTION_PATH);
  if (text === null) return map;
  let doc: Document;
  try {
    doc = parseXml(text);
  } catch {
    return map;
  }
  for (const enc of allByLocal(doc, "EncryptedData")) {
    const method = allByLocal(enc, "EncryptionMethod")[0];
    const algo = method ? attr(method, "Algorithm") : null;
    const ref = allByLocal(enc, "CipherReference")[0];
    const uri = ref ? attr(ref, "URI") : null;
    if (algo && uri) {
      // URI is relative to the container root, URL-encoded.
      map.set(normalize(decodeURIComponent(uri)), algo);
    }
  }
  return map;
}

/**
 * Deobfuscate font bytes in place-ish (returns a new array) given the algorithm
 * and the book's unique identifier. Returns the input unchanged if the
 * algorithm is unknown.
 */
export function deobfuscate(
  bytes: Uint8Array,
  algorithm: string,
  uniqueIdentifier: string,
): Uint8Array {
  if (algorithm === IDPF_ALGORITHM) {
    return xorDeobfuscate(bytes, idpfKey(uniqueIdentifier), 1040);
  }
  if (algorithm === ADOBE_ALGORITHM) {
    return xorDeobfuscate(bytes, adobeKey(uniqueIdentifier), 1024);
  }
  return bytes;
}

/** IDPF key: SHA-1 of the UTF-8 unique id with XML whitespace stripped. */
function idpfKey(uniqueIdentifier: string): Uint8Array {
  const stripped = uniqueIdentifier.replace(/[\u0020\u0009\u000D\u000A]/g, "");
  return sha1(new TextEncoder().encode(stripped));
}

/** Adobe key: the UUID's hex digits (ignoring "urn:uuid:") packed into 16 bytes. */
function adobeKey(uniqueIdentifier: string): Uint8Array {
  const hex = uniqueIdentifier.replace(/urn:uuid:/i, "").replace(/[^0-9a-fA-F]/g, "");
  const key = new Uint8Array(16);
  for (let i = 0; i < 16 && i * 2 + 1 < hex.length; i++) {
    key[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return key;
}

/** XOR the first `count` bytes with a cycling key; copy the rest unchanged. */
function xorDeobfuscate(src: Uint8Array, key: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(src); // copy
  if (key.length === 0) return out;
  const n = Math.min(count, src.length);
  for (let i = 0; i < n; i++) {
    out[i] = src[i]! ^ key[i % key.length]!;
  }
  return out;
}

/** Minimal synchronous SHA-1. Returns a 20-byte digest. */
export function sha1(data: Uint8Array): Uint8Array {
  const ml = data.length * 8;
  // Pad: append 0x80, then zeros, then 64-bit big-endian length.
  const withPad = new Uint8Array((((data.length + 8) >> 6) + 1) << 6);
  withPad.set(data);
  withPad[data.length] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, ml >>> 0, false);
  dv.setUint32(withPad.length - 8, Math.floor(ml / 0x100000000), false);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Int32Array(80);

  for (let chunk = 0; chunk < withPad.length; chunk += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(chunk + i * 4, false);
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (v << 1) | (v >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) | 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = tmp;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }

  const out = new Uint8Array(20);
  const outDv = new DataView(out.buffer);
  outDv.setInt32(0, h0, false);
  outDv.setInt32(4, h1, false);
  outDv.setInt32(8, h2, false);
  outDv.setInt32(12, h3, false);
  outDv.setInt32(16, h4, false);
  return out;
}
