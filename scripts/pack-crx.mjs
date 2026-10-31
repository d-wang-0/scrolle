// Pack dist-extension/ into a signed CRX3 file, using only fflate (already a dependency)
// and node:crypto. The signing key is extension.pem (created on first run, gitignored);
// the extension's ID is derived from it, so keep it to keep the same ID across builds.

import { createHash, createPrivateKey, createPublicKey, createSign, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { zipSync } from "fflate";

const dir = "dist-extension";
const keyPath = "extension.pem";
const outDir = "dist-crx";
const out = join(outDir, "scrolle.crx");

if (!existsSync(keyPath)) {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  console.log(`created ${keyPath}`);
}
const privateKey = createPrivateKey(readFileSync(keyPath));
const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" });

const files = {};
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else files[relative(dir, p).split(sep).join("/")] = readFileSync(p);
  }
};
walk(dir);
const zip = Buffer.from(zipSync(files, { level: 9 }));

// Minimal protobuf encoding: length-delimited fields only.
const varint = (n) => {
  const b = [];
  for (; n > 0x7f; n = Math.floor(n / 128)) b.push((n & 0x7f) | 0x80);
  b.push(n);
  return Buffer.from(b);
};
const field = (num, data) => Buffer.concat([varint(num * 8 + 2), varint(data.length), data]);
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};

const crxId = createHash("sha256").update(publicKey).digest().subarray(0, 16);
const signedData = field(1, crxId);
const signature = createSign("sha256")
  .update(Buffer.concat([Buffer.from("CRX3 SignedData\0"), u32(signedData.length), signedData, zip]))
  .sign(privateKey);
const header = Buffer.concat([field(2, Buffer.concat([field(1, publicKey), field(2, signature)])), field(10000, signedData)]);

mkdirSync(outDir, { recursive: true });
writeFileSync(out, Buffer.concat([Buffer.from("Cr24"), u32(3), u32(header.length), header, zip]));

// Chrome shows the ID with a-p in place of 0-f.
const id = [...crxId].map((b) => String.fromCharCode(97 + (b >> 4), 97 + (b & 15))).join("");
console.log(`${out}: ${(zip.length / 1024).toFixed(0)} KiB, extension ID ${id}`);
