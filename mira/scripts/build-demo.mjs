/**
 * Builds the static, single-file demo (no server needed):
 *   VITE_DEMO=1 vite build → inline JS + CSS into demo/mira-demo.html
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist-demo");
execSync(`npx vite build --base ./ --outDir ${out}`, { cwd: root, stdio: "inherit", env: { ...process.env, VITE_DEMO: "1" } });

let html = fs.readFileSync(path.join(out, "index.html"), "utf8");
const assets = path.join(out, "assets");
for (const f of fs.readdirSync(assets)) {
  const src = fs.readFileSync(path.join(assets, f), "utf8");
  if (f.endsWith(".js")) {
    html = html.replace(new RegExp(`<script type="module" crossorigin src="\\./assets/${f.replace(".", "\\.")}"></script>`), () => `<script type="module">${src.replace(/<\/script/gi, "<\\/script")}</script>`);
  } else if (f.endsWith(".css")) {
    html = html.replace(new RegExp(`<link rel="stylesheet" crossorigin href="\\./assets/${f.replace(".", "\\.")}">`), () => `<style>${src}</style>`);
  }
}
// The artifact host supplies the document skeleton; keep head content + body.
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>/, "")
  .replace(/<meta name="viewport"[^>]*>/, "")
  .replace(/<link rel="manifest"[^>]*>/, "")
  .replace(/<link rel="(icon|apple-touch-icon)"[^>]*>/g, "")
  .replace(/<title>Mira<\/title>/, "");
const bodyInner = html.match(/<body>([\s\S]*?)<\/body>/)[1];
// Module scripts are deferred, so they can sit before #root in the output.
fs.mkdirSync(path.join(root, "demo"), { recursive: true });
fs.writeFileSync(path.join(root, "demo", "mira-demo.html"), page);
console.log(`✓ demo/mira-demo.html (${(page.length / 1024).toFixed(0)} KB)`);
