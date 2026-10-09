// Packs the whole game into one self-contained HTML file (stylesheet and scripts inlined),
// for sending to someone who should just double-click it. Run: node tools/build-single.js
// Writes dist/sliding-car-puzzles.html.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let html = read('index.html');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${read(href)}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = read(src);
  if (/<\/script/i.test(code)) throw new Error(`${src} contains "</script", which would end the inline block early`);
  return `<script>\n${code}</script>`;
});
if (/<(link|script)[^>]+(href|src)=/.test(html)) throw new Error('a stylesheet or script was left un-inlined');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'sliding-car-puzzles.html');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB)`);
