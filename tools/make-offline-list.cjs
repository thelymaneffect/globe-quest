// Run with:  node tools/make-offline-list.cjs
// Rebuilds js/offline-files.js — the list of every file the app saves for airplane-mode play.
// Run it (and bump VERSION) whenever you add, remove or change files.
const fs = require('fs'), path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const VERSION = 'lyman-wd-v22';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = ['./', 'index.html', 'manifest.webmanifest',
  ...['css', 'js', 'vendor', 'data', 'flags', 'icons', 'fonts', 'pics'].flatMap(walk)]
  .filter((f) => !/(^|\/)\.|\.DS_Store$/.test(f)).map((f) => f.split(path.sep).join('/'));
fs.writeFileSync('js/offline-files.js', `/* Every file the app saves for airplane-mode play. Made by tools/make-offline-list.cjs. */\nself.LYMAN_OFFLINE = ${JSON.stringify({ version: VERSION, files }, null, 0)};\n`);
console.log(VERSION, files.length, 'files');
