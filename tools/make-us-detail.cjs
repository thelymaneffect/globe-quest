// Works out, ONE time, which rivers and mountains are inside the 50 states, and saves the answer
// in data/us-detail.js. Doing this inside the game took about 10 seconds and froze the screen.
// Run it again whenever data/rivers.js, data/features.js, or data/us.js changes:
//   node tools/make-us-detail.cjs
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = { console }; ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
for (const f of ['vendor/d3.min.js', 'vendor/topojson-client.min.js', 'data/us.js', 'data/rivers.js', 'data/features.js'])
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const { d3, topojson, GEO_US: topo, RIVERS, GEOFEATURES } = ctx;
const usa = topojson.merge(topo, topo.objects.states.geometries);
const inUS = (pt) => d3.geoContains(usa, pt);
const features = [], rivers = [];
GEOFEATURES.forEach((f, i) => { if (inUS([f[1], f[2]])) features.push(i); });
RIVERS.features.forEach((r, i) => {
  const lines = r.geometry.type === 'LineString' ? [r.geometry.coordinates] : r.geometry.coordinates;
  if (lines.some((l) => l.some((pt, j) => j % 6 === 0 && inUS(pt)))) rivers.push(i);
});
fs.writeFileSync(path.join(root, 'data/us-detail.js'),
  `/* Which rivers (by place in data/rivers.js) and mountains (by place in data/features.js) are inside the 50 states. Made by tools/make-us-detail.cjs. */\nwindow.US_DETAIL=${JSON.stringify({ rivers, features, nRivers: RIVERS.features.length, nFeatures: GEOFEATURES.length })};\n`);
console.log(`${rivers.length} rivers and ${features.length} mountains are in the USA`);
