// Copy the release APK Gradle built into dist-apk/scrolle.apk, next to the other build outputs.

import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const source = "android/app/build/outputs/apk/release/app-release.apk";
const outDir = "dist-apk";
const out = join(outDir, "scrolle.apk");

mkdirSync(outDir, { recursive: true });
copyFileSync(source, out);
console.log(`${out}: ${(statSync(out).size / 1024 / 1024).toFixed(1)} MiB`);
