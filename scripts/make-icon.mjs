// Generate build/icon.png (1024x1024) from the app's SVG logo.
// electron-builder turns that single PNG into the macOS .icns and Windows .ico
// automatically, so this only needs to run when the logo changes. The result
// is committed, so CI does not need any SVG tooling.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const svg = readFileSync(path.join(root, "frontend", "public", "icon.svg"), "utf-8");

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1024 },
  background: "transparent",
});
const png = resvg.render().asPng();

mkdirSync(path.join(root, "build"), { recursive: true });
const out = path.join(root, "build", "icon.png");
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
