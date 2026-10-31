// Generate the Android launcher icons and the launch splash from src-tauri/app-icon.svg (the desktop app's icon) with
// `tauri icon`, and copy them into the Capacitor project's res/ folder. The results are gitignored
// (android/.gitignore), so the SVG stays the only copy; `npm run android` runs this first.

import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = "src-tauri/app-icon.svg";
const res = "android/app/src/main/res";
const tauriCli = "node_modules/@tauri-apps/cli/tauri.js";

const work = mkdtempSync(join(tmpdir(), "epub-icons-"));
try {
  // The artwork fills its whole canvas, but launchers mask the adaptive foreground to the central ~2/3
  // (and some, like One UI, shrink it further), which crops it. Pad the viewBox so the artwork covers
  // only about half the canvas, leaving a margin inside the mask.
  const padded = join(work, "icon-padded.svg");
  writeFileSync(padded, readFileSync(source, "utf8").replace('viewBox="0 0 128 128"', 'viewBox="-64 -64 256 256"'));
  execFileSync(process.execPath, [tauriCli, "icon", padded, "--output", join(work, "out")], { stdio: "ignore" });
  const android = join(work, "out", "android");

  for (const dir of readdirSync(android).filter((d) => d.startsWith("mipmap-") && d !== "mipmap-anydpi-v26")) {
    cpSync(join(android, dir), join(res, dir), { recursive: true });
  }
  // The background is the scroll's outline gradient (top to bottom) instead of tauri's plain white.
  mkdirSync(join(res, "drawable"), { recursive: true });
  writeFileSync(
    join(res, "drawable", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <gradient android:type="linear" android:angle="270" android:startColor="#2B5FCC" android:centerColor="#2252B4" android:endColor="#163A8C" />
</shape>
`,
  );

  // One adaptive icon serves both the square and the round launcher entry.
  const adaptive = join(android, "mipmap-anydpi-v26", "ic_launcher.xml");
  const adaptiveXml = readFileSync(adaptive, "utf8").replace("@color/ic_launcher_background", "@drawable/ic_launcher_background");
  mkdirSync(join(res, "mipmap-anydpi-v26"), { recursive: true });
  writeFileSync(join(res, "mipmap-anydpi-v26", "ic_launcher.xml"), adaptiveXml);
  writeFileSync(join(res, "mipmap-anydpi-v26", "ic_launcher_round.xml"), adaptiveXml);

  // The launch splash: the unpadded icon centred on black. It replaces Capacitor's stock splash.png
  // files (one per density and orientation), which would otherwise win over splash.xml.
  execFileSync(process.execPath, [tauriCli, "icon", source, "--output", join(work, "splash")], { stdio: "ignore" });
  mkdirSync(join(res, "drawable-nodpi"), { recursive: true });
  copyFileSync(join(work, "splash", "icon.png"), join(res, "drawable-nodpi", "splash_icon.png"));
  for (const dir of readdirSync(res).filter((d) => d === "drawable" || /^drawable-(port|land)-/.test(d))) {
    rmSync(join(res, dir, "splash.png"), { force: true });
  }
  writeFileSync(
    join(res, "drawable", "splash.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@android:color/black" />
  <item android:width="144dp" android:height="144dp" android:gravity="center">
    <bitmap android:src="@drawable/splash_icon" />
  </item>
</layer-list>
`,
  );

  // The template's placeholder vector icon and the color resource the gradient replaces.
  rmSync(join(res, "drawable-v24", "ic_launcher_foreground.xml"), { force: true });
  rmSync(join(res, "values", "ic_launcher_background.xml"), { force: true });
  console.log(`android icons generated from ${source}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
