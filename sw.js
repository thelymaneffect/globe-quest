/* Lyman Learning: Globe Quest — offline / airplane-mode support (service worker).
   On install it saves EVERY file the game needs (listed in js/offline-files.js), so the game
   plays with no internet at all. After that, files are served from the saved copy first and
   quietly refreshed in the background whenever the internet is available. */
importScripts('js/offline-files.js');
const { version: VERSION, files: FILES } = self.LYMAN_OFFLINE;

async function saveAll() {
  const c = await caches.open(VERSION);
  const missing = [];
  for (const f of FILES) if (!(await c.match(f))) missing.push(f);
  let failed = 0;
  const worker = async () => { while (missing.length) { const f = missing.shift(); try { await c.add(new Request(f, { cache: 'reload' })); } catch (e) { failed++; } } };
  await Promise.all(Array.from({ length: 8 }, worker));
  if (failed) throw new Error(failed + ' files could not be saved yet');
}
self.addEventListener('install', (e) => { e.waitUntil(saveAll().then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'save-all') e.waitUntil(saveAll().catch(() => {})); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // e.g. the game-request form goes straight to the internet
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(fresh); return hit; }
    return (await fresh) || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
  })());
});
