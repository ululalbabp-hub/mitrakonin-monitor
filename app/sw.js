/*
 * Service worker: simpan "cangkang" aplikasi agar bisa dibuka tanpa sinyal.
 * Data (POST ke Apps Script) TIDAK disimpan di sini; data offline dikelola IndexedDB di js/inti.js.
 * Naikkan VERSI setiap rilis agar HP mengambil file baru.
 */
const VERSI = 'mk-v0.5.0';
const CANGKANG = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/inti.js', 'js/rab-import.js',
  'js/layar/umum.js', 'js/layar/pengelola.js', 'js/layar/admin.js', 'js/layar/client.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-64.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(CANGKANG)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSI).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Font Google & file statis milik aplikasi: cache dulu, lalu perbarui di belakang.
  const statis = url.origin === self.location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!statis) return;
  // config.js & index: jaringan dulu agar URL API terbaru terpakai.
  const jaringanDulu = url.origin === self.location.origin && (/\/(config\.js)?$/.test(url.pathname) || url.pathname.endsWith('index.html'));
  if (jaringanDulu) {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(VERSI).then((ca) => ca.put(req, c)); return r; }).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {
    const ambil = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(VERSI).then((ca) => ca.put(req, c)); } return r; }).catch(() => hit);
    return hit || ambil;
  }));
});
