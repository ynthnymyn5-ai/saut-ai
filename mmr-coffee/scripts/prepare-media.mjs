#!/usr/bin/env node
// Converts raw photos/videos in media-src/ into web-ready files in public/media/
// and records them in src/lib/media.json. Requires ffmpeg on PATH.
//
//   media-src/hero.jpg                  -> opening photograph (top of the site)
//   media-src/story.jpg                 -> Our Story photograph
//   media-src/experience.mp4|mov        -> Experience background film
//   media-src/products/<id>.jpg         -> signature | velvet | gold | coldbrew
//   media-src/menu/<drink-name>.jpg     -> e.g. flat-white.jpg, iced-americano.jpg
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

const SRC = "media-src", OUT = "public/media", MANIFEST = "src/lib/media.json";
const IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);
const VID = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const widths = { menu: 900, products: 1400, story: 2000, hero: 2400 };

try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { console.error("ffmpeg is required: https://ffmpeg.org/download.html"); process.exit(1); }

const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
const probe = (file) => {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString().trim();
  const [width, height] = out.split(",").map(Number);
  return { width, height };
};
const kb = (f) => Math.round(statSync(f).size / 1024);

// Keep entries for files already converted earlier; only the files found now are replaced.
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
function image(file, key, maxW) {
  const out = join(OUT, `${key}.webp`);
  mkdirSync(join(OUT, key.split("/").slice(0, -1).join("/") || "."), { recursive: true });
  ff(["-i", file, "-vf", `scale='min(${maxW},iw)':-2`, "-c:v", "libwebp", "-quality", "80", "-compression_level", "6", out]);
  manifest[key] = { src: `/media/${key}.webp`, ...probe(out) };
  console.log(`image  ${key.padEnd(28)} ${kb(file)} KB -> ${kb(out)} KB`);
}
function video(file, key) {
  const mp4 = join(OUT, `${key}.mp4`), webm = join(OUT, `${key}.webm`), poster = join(OUT, `${key}-poster.webp`);
  mkdirSync(OUT, { recursive: true });
  const vf = "scale='min(1600,iw)':-2,fps=30";
  ff(["-i", file, "-an", "-t", "20", "-vf", vf, "-c:v", "libx264", "-crf", "26", "-maxrate", "2500k", "-bufsize", "5000k", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  ff(["-i", file, "-an", "-t", "20", "-vf", vf, "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "2000k", "-row-mt", "1", webm]);
  ff(["-i", mp4, "-frames:v", "1", "-vf", "scale='min(1600,iw)':-2", "-c:v", "libwebp", "-quality", "70", poster]);
  manifest[key] = { src: `/media/${key}.mp4`, webm: `/media/${key}.webm`, poster: `/media/${key}-poster.webp`, ...probe(mp4) };
  console.log(`video  ${key.padEnd(28)} ${kb(file)} KB -> mp4 ${kb(mp4)} KB, webm ${kb(webm)} KB`);
}

const find = (dir, name) => existsSync(dir) ? readdirSync(dir).find((f) => basename(f, extname(f)).toLowerCase() === name) : undefined;
const hero = find(SRC, "hero");
if (hero && IMG.has(extname(hero).toLowerCase())) image(join(SRC, hero), "hero", widths.hero);
const story = find(SRC, "story");
if (story && IMG.has(extname(story).toLowerCase())) image(join(SRC, story), "story", widths.story);
const exp = find(SRC, "experience");
if (exp && VID.has(extname(exp).toLowerCase())) video(join(SRC, exp), "experience");
for (const group of ["products", "menu"]) {
  const dir = join(SRC, group);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!IMG.has(extname(f).toLowerCase())) continue;
    const name = basename(f, extname(f)).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    image(join(dir, f), `${group}/${name}`, widths[group]);
  }
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`\n${Object.keys(manifest).length} media files ready. Run npm run build to publish them.`);
