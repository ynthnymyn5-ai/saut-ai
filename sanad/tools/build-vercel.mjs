/**
 * Vercel build (Build Output API v3) — run by Vercel as the build command:
 *   .vercel/output/static            the PWA (Vite build)
 *   .vercel/output/functions/api.func  the Express app as one Node function
 *   .vercel/output/config.json       routes: /api/* and /invoice/* → function, SPA fallback
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, ".vercel/output");
fs.rmSync(out, { recursive: true, force: true });

// 1. Client
execSync(`npx vite build --outDir ${path.join(out, "static")}`, { cwd: root, stdio: "inherit" });

// 2. Server → one ESM bundle (dependencies included)
const fnDir = path.join(out, "functions/api.func");
await build({
  entryPoints: [path.join(root, "server/vercel.ts")],
  outfile: path.join(fnDir, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  // optional / dev-only modules that must not be bundled
  external: ["pg-native", "vite", "lightningcss", "fsevents"],
  alias: { "@shared": path.join(root, "shared") },
  // CommonJS dependencies (express, pg…) call require(); give ESM a real one
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});
fs.writeFileSync(
  path.join(fnDir, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60, supportsResponseStreaming: false }, null, 2),
);

// 3. Routing
fs.writeFileSync(
  path.join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/sw.js", headers: { "cache-control": "no-cache" }, continue: true },
        { src: "/assets/(.*)", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "/api/(.*)", dest: "/api" },
        { src: "/invoice/(.*)", dest: "/api" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log("✓ .vercel/output ready");
