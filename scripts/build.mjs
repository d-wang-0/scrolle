// Build targets as a dependency graph: `node scripts/build.mjs <target>...`.
// Each target runs at most once per invocation, after the targets it depends on.
// Run it through npm (`npm run build:all`) so node_modules/.bin is on PATH.

import { spawnSync } from "node:child_process";

const bin = (name) => (process.platform === "win32" ? `${name}.cmd` : name);
const gradle = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";

// Each run is [command, args, options]; spawned without a shell so args need no quoting.
const targets = {
  tsc: { run: [bin("tsc"), []] },
  web: { deps: ["tsc"], run: [bin("vite"), ["build"]] },

  single: {
    deps: ["tsc"],
    run: [bin("vite"), ["build", "--config", "vite.single.config.ts"]],
    then: ["node", ["scripts/inline-build.mjs"]],
  },

  extension: { deps: ["tsc"], run: [bin("vite"), ["build", "--config", "vite.extension.config.ts"]] },
  crx: { deps: ["extension"], run: ["node", ["scripts/pack-crx.mjs"]] },
  zip: { deps: ["extension"], run: ["node", ["scripts/pack-zip.mjs"]] },

  // The web bundle is already built by `web`, so Tauri's own beforeBuildCommand is blanked.
  exe: {
    deps: ["web"],
    run: [bin("tauri"), ["build", "--no-bundle", "--config", JSON.stringify({ build: { beforeBuildCommand: "" } })]],
  },

  "android-icons": { run: ["node", ["scripts/android-icons.mjs"]] },
  "apk-build": {
    deps: ["web", "android-icons"],
    run: [bin("cap"), ["sync", "android"]],
    then: [gradle, ["assembleRelease"], { cwd: "android" }],
  },
  apk: { deps: ["apk-build"], run: ["node", ["scripts/pack-apk.mjs"]] },

  all: { deps: ["single", "crx", "zip", "exe", "apk"] },
};

const done = new Set();

function exec([cmd, args, opts]) {
  // .cmd/.bat files on Windows only run through a shell; the JSON arg is the one that needs care.
  const shell = process.platform === "win32" && /\.(cmd|bat)$/.test(cmd);
  const quoted = shell ? args.map((a) => (/[\s"{]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : args;
  const r = spawnSync(cmd, quoted, { stdio: "inherit", shell, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function build(name) {
  const t = targets[name];
  if (!t) {
    console.error(`unknown target "${name}"; available: ${Object.keys(targets).join(", ")}`);
    process.exit(1);
  }
  if (done.has(name)) return;
  done.add(name);
  for (const dep of t.deps ?? []) build(dep);
  if (t.run) {
    console.log(`\n> ${name}`);
    exec(t.run);
    if (t.then) exec(t.then);
  }
}

for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ["all"]) build(name);
