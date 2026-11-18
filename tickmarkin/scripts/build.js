// Builds dist/ for static hosting (Vercel): copies site/ and injects the shared header/footer.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadPartials, renderHtml, PUBLIC_DIR } = require('../lib/server');

const OUT = path.join(__dirname, '..', 'dist');
const partials = loadPartials();
fs.rmSync(OUT, { recursive: true, force: true });

(function copy(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const src = path.join(dir, e.name);
    const dst = path.join(OUT, path.relative(PUBLIC_DIR, src));
    if (e.isDirectory()) { copy(src); continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (e.name.endsWith('.html')) fs.writeFileSync(dst, renderHtml(fs.readFileSync(src, 'utf8'), partials));
    else fs.copyFileSync(src, dst);
  }
})(PUBLIC_DIR);
console.log('Built', OUT);
