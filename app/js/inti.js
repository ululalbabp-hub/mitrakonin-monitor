/*
 * Inti PWA: template aman (auto-escape), format angka/tanggal, penyimpanan lokal,
 * panggilan API, antrian offline, kamera/foto/video, router & kerangka layar.
 */
export const CFG = window.APP_CONFIG || {};

// ---------------------------------------------------------------- template aman
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function keStr(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(keStr).join('');
  return esc(v);
}
/** html`<b>${nilai}</b>` — semua nilai di-escape kecuali raw()/html lain. */
export function html(str, ...vals) {
  let o = '';
  str.forEach((s, i) => { o += s; if (i < vals.length) o += keStr(vals[i]); });
  return new Raw(o);
}

// ---------------------------------------------------------------- format
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_P = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export function angka(n, d = 0) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '–';
  return Number(n).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const rp = (n) => (n === null || n === undefined || n === '' ? '–' : 'Rp ' + angka(Math.round(n)));
export function rpS(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return 'Rp ' + angka(n / 1e9, 2) + ' M';
  if (a >= 1e6) return 'Rp ' + angka(n / 1e6, 1) + ' jt';
  return rp(n);
}
export function pct(n, d = 2, tanda = false) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '–';
  return (tanda && n > 0 ? '+' : '') + angka(n, d) + '%';
}
export function tglObj(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
}
export function tgl(s, tahun = true) { const d = tglObj(s); return d ? d.getDate() + ' ' + BULAN[d.getMonth()] + (tahun ? ' ' + d.getFullYear() : '') : '–'; }
export function jam(s) { const d = tglObj(s); return d && /T/.test(s) ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : ''; }
export function tglPanjang(d = new Date()) { return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN_P[d.getMonth()] + ' ' + d.getFullYear(); }
export function hariIni() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function sekarangIso() { const d = new Date(); return hariIni() + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); }
export function selisihHari(a, b) { const x = tglObj(a), y = tglObj(b); return x && y ? Math.round((y - x) / 864e5) : null; }
export function tambahHari(s, n) { const d = tglObj(s); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export const warnaKelas = (w) => ({ Hijau: 'ok', Kuning: 'warn', Merah: 'bad' }[w] || 'info');
export const statusKelas = (s) => ({ Disetujui: 'ok', Lunas: 'ok', Menunggu: 'warn', Ditagih: 'warn', Ditolak: 'bad', Belum: 'info', Terbuka: 'bad', Dimitigasi: 'warn', Selesai: 'ok' }[s] || 'info');

// ---------------------------------------------------------------- penyimpanan lokal
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* mode privat */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } },
};
export { LS };

let dbJanji = null;
function db() {
  if (dbJanji) return dbJanji;
  dbJanji = new Promise((ok) => {
    try {
      const r = indexedDB.open('mitrakonin', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('antrian', { keyPath: 'id' }); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
    } catch (e) { ok(null); }
  });
  return dbJanji;
}
const memori = { kv: new Map(), antrian: new Map() };
async function idb(store, mode, fn) {
  const d = await db();
  if (!d) return fn(null);
  return new Promise((ok, gagal) => {
    const tx = d.transaction(store, mode), s = tx.objectStore(store);
    const req = fn(s);
    tx.oncomplete = () => ok(req && 'result' in req ? req.result : undefined);
    tx.onerror = () => gagal(tx.error);
  });
}
export const kv = {
  get: (k) => idb('kv', 'readonly', (s) => (s ? s.get(k) : { result: memori.kv.get(k) })),
  set: (k, v) => idb('kv', 'readwrite', (s) => (s ? s.put(v, k) : memori.kv.set(k, v))),
  hapusSemua: () => idb('kv', 'readwrite', (s) => (s ? s.clear() : memori.kv.clear())),
};
const antrianDb = {
  semua: () => idb('antrian', 'readonly', (s) => (s ? s.getAll() : { result: [...memori.antrian.values()] })),
  simpan: (j) => idb('antrian', 'readwrite', (s) => (s ? s.put(j) : memori.antrian.set(j.id, j))),
  hapus: (id) => idb('antrian', 'readwrite', (s) => (s ? s.delete(id) : memori.antrian.delete(id))),
};

// ---------------------------------------------------------------- sesi & API
export const sesi = {
  get() { return LS.get('mk_sesi'); },
  set(s) { LS.set('mk_sesi', s); },
  hapus() { LS.del('mk_sesi'); },
  user() { const s = LS.get('mk_sesi'); return s && s.user; },
};

export class ApiError extends Error { constructor(e) { super(e.pesan || 'Gagal'); this.kode = e.kode; } }
export const status = { dariCache: false, waktuCache: null };

/**
 * Panggil API. opsi.cache = simpan hasil untuk dipakai saat offline.
 * Saat offline/gagal jaringan dan ada cache: kembalikan cache (status.dariCache = true).
 */
const AKSI_BACA = new Set(['list', 'get', 'dashboard', 'dashboardProyek', 'antrianApproval', 'periodeLaporan', 'config', 'me', 'userList']);
const TTL_MEMORI = 90000;
const memoriApi = new Map();
/**
 * Panggilan API dengan cache memori untuk aksi BACA (90 dtk): pindah tab/layar yang datanya sama
 * tampil seketika. Aksi tulis membuang seluruh cache agar angka selalu segar setelah approve/input.
 * Permintaan identik yang sedang berjalan digabung (tidak dikirim dua kali).
 * opsi.segar = true memaksa ambil ulang dari server.
 */
export function api(action, data = {}, opsi = {}) {
  if (!AKSI_BACA.has(action)) {
    memoriApi.clear();
    return apiMentah(action, data, opsi);
  }
  const k = ((sesi.get() || {}).token || '') + '|' + action + '|' + JSON.stringify(data);
  const ada = memoriApi.get(k);
  if (!opsi.segar && ada && (ada.janji || Date.now() - ada.t < TTL_MEMORI)) return ada.janji || Promise.resolve(ada.d);
  const janji = apiMentah(action, data, opsi).then(
    (d) => { memoriApi.set(k, { t: Date.now(), d }); return d; },
    (e) => { memoriApi.delete(k); throw e; });
  memoriApi.set(k, { t: 0, janji });
  janji.then(() => { const m = memoriApi.get(k); if (m) delete m.janji; }, () => {});
  return janji;
}
export function bersihkanCacheApi() { memoriApi.clear(); }

async function apiMentah(action, data = {}, opsi = {}) {
  const kunci = opsi.cache ? 'c:' + (sesi.user() || {}).user_id + ':' + action + ':' + JSON.stringify(data) : null;
  if (!CFG.API_URL || /GANTI/.test(CFG.API_URL)) throw new ApiError({ kode: 'KONFIG', pesan: 'API_URL di config.js belum diisi.' });
  let j;
  try {
    const r = await fetch(CFG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
      body: JSON.stringify({ action, token: (sesi.get() || {}).token, data }),
    });
    j = await r.json();
  } catch (e) {
    if (kunci) {
      const c = await kv.get(kunci);
      if (c) { status.dariCache = true; status.waktuCache = c.t; return c.d; }
    }
    throw new ApiError({ kode: 'OFFLINE', pesan: 'Tidak ada koneksi ke server. Periksa sinyal lalu coba lagi.' });
  }
  if (!j.ok) {
    if (j.error.kode === 'AUTH' && action !== 'login' && action !== 'gantiPassword') { sesi.hapus(); setTimeout(() => { location.hash = '#/login'; }, 0); }
    throw new ApiError(j.error);
  }
  if (kunci) { status.dariCache = false; kv.set(kunci, { t: Date.now(), d: j.data }); }
  return j.data;
}

// ---------------------------------------------------------------- antrian offline
let prosesJalan = false;
const pendengarAntrian = new Set();
export const antrian = {
  async semua() { return (await antrianDb.semua()) || []; },
  async jumlah() { return (await antrian.semua()).filter((j) => !j.gagal).length; },
  dengar(fn) { pendengarAntrian.add(fn); return () => pendengarAntrian.delete(fn); },
  /** job: {tab, row, refTipe, media:[{tipe,mime,nama_file,data_base64,lat,lng,waktu_ambil}], label} */
  async tambah(job) {
    job.id = 'J' + Date.now() + Math.random().toString(36).slice(2, 6);
    job.dibuat = sekarangIso();
    job.user_id = (sesi.user() || {}).user_id;
    await antrianDb.simpan(job);
    kabari();
    await antrian.proses();
    const sisa = (await antrian.semua()).find((x) => x.id === job.id);
    return { terkirim: !sisa, gagal: sisa && sisa.gagal, idDibuat: sisa ? sisa.idDibuat : job.idDibuat, peringatan: job.peringatan || [] };
  },
  async proses() {
    if (prosesJalan || !navigator.onLine) return;
    prosesJalan = true;
    try {
      for (const job of await antrian.semua()) {
        if (job.gagal) continue;
        if (job.user_id && sesi.user() && job.user_id !== sesi.user().user_id) continue;
        try { await kirimJob(job); }
        catch (e) {
          if (e.kode === 'OFFLINE' || e.kode === 'SIBUK') break;
          if (e.kode === 'AUTH') break;
          job.gagal = e.message; await antrianDb.simpan(job);
        }
      }
    } finally { prosesJalan = false; kabari(); }
  },
  async hapus(id) { await antrianDb.hapus(id); kabari(); },
};
async function kirimJob(job) {
  if (!job.idDibuat) {
    const r = await api('create', { tab: job.tab, row: job.row });
    job.idDibuat = r.id; job.peringatan = r.peringatan; await antrianDb.simpan(job);
  }
  while (job.media && job.media.length) {
    const m = job.media[0];
    await api('upload', Object.assign({}, m, { proyek_id: job.row.proyek_id, ref_tipe: job.refTipe, ref_id: job.idDibuat }));
    job.media.shift(); await antrianDb.simpan(job);
  }
  await antrianDb.hapus(job.id);
  toast((job.label || 'Input') + ' terkirim.');
}
function kabari() { antrian.jumlah().then((n) => pendengarAntrian.forEach((f) => f(n))); }
window.addEventListener('online', () => { antrian.proses(); render(); });
window.addEventListener('offline', () => render());

// ---------------------------------------------------------------- foto, video, GPS
let lokasiTerakhir = null;
export function ambilLokasi() {
  if (lokasiTerakhir && Date.now() - lokasiTerakhir.t < 120000) return Promise.resolve(lokasiTerakhir);
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { lokasiTerakhir = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), t: Date.now() }; ok(lokasiTerakhir); },
      () => ok(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}

function blobKeBase64(blob) {
  return new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = gagal; r.readAsDataURL(blob); });
}

async function bukaGambar(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* lanjut */ } }
  return new Promise((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = URL.createObjectURL(file); });
}

/** Kompres foto ke ±maksKb, beri cap waktu + GPS + keterangan di bagian bawah. */
export async function siapkanFoto(file, { maksKb = 300, keterangan = '', lokasi = null } = {}) {
  const img = await bukaGambar(file);
  const w0 = img.width, h0 = img.height;
  let sisi = 1600, q = 0.82, blob = null;
  for (let coba = 0; coba < 8; coba++) {
    const s = Math.min(1, sisi / Math.max(w0, h0)), w = Math.round(w0 * s), h = Math.round(h0 * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const waktu = new Date();
    const baris = [
      tglPanjang(waktu) + ' ' + String(waktu.getHours()).padStart(2, '0') + ':' + String(waktu.getMinutes()).padStart(2, '0'),
      lokasi ? 'GPS ' + lokasi.lat + ', ' + lokasi.lng : 'GPS tidak tersedia',
      keterangan,
    ].filter(Boolean);
    const fs = Math.max(14, Math.round(w / 42)), pad = Math.round(fs * 0.6), tinggiBand = baris.length * fs * 1.3 + pad * 2;
    g.fillStyle = 'rgba(11,33,73,0.72)'; g.fillRect(0, h - tinggiBand, w, tinggiBand);
    g.fillStyle = '#F2A91E'; g.fillRect(0, h - tinggiBand, w, Math.max(2, fs / 6));
    g.fillStyle = '#fff'; g.font = '600 ' + fs + 'px Inter, sans-serif'; g.textBaseline = 'top';
    baris.forEach((t, i) => g.fillText(t.slice(0, 80), pad, h - tinggiBand + pad + i * fs * 1.3));
    blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));
    if (blob.size <= maksKb * 1024) break;
    if (q > 0.5) q -= 0.1; else sisi = Math.round(sisi * 0.8);
  }
  return { blob, url: URL.createObjectURL(blob), kb: Math.round(blob.size / 1024), base64: await blobKeBase64(blob), mime: 'image/jpeg' };
}

export function cekVideo(file, maksDetik = 60) {
  return new Promise((ok) => {
    const v = document.createElement('video'); v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); ok({ durasi: v.duration, ok: !(v.duration > maksDetik + 0.5) }); };
    v.onerror = () => ok({ durasi: null, ok: true });
    v.src = URL.createObjectURL(file);
  });
}
export async function siapkanVideo(file, maksDetik) {
  const c = await cekVideo(file, maksDetik);
  if (!c.ok) throw new Error('Video ' + Math.round(c.durasi) + ' detik. Maksimal ' + maksDetik + ' detik.');
  if (file.size > 38 * 1024 * 1024) throw new Error('Video terlalu besar (' + Math.round(file.size / 1048576) + ' MB). Rekam ulang lebih singkat atau resolusi lebih rendah.');
  return { blob: file, url: URL.createObjectURL(file), kb: Math.round(file.size / 1024), base64: await blobKeBase64(file), mime: file.type || 'video/mp4', durasi: c.durasi };
}
export async function berkasKeBase64(file) { return blobKeBase64(file); }
/** Simpan berkas base64 ke perangkat (PDF laporan, dll.). */
export function unduhBerkas(nama, mime, b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---------------------------------------------------------------- UI kecil
export function toast(pesan, gagal = false) {
  const t = document.getElementById('toast'), d = document.createElement('div');
  d.textContent = pesan; if (gagal) d.className = 'gagal';
  t.appendChild(d); setTimeout(() => d.remove(), gagal ? 6000 : 3500);
}
export function modal(isi, setelah) {
  const m = document.getElementById('modal');
  m.innerHTML = '<div class="panel" role="dialog" aria-modal="true">' + keStr(isi) + '</div>';
  m.hidden = false;
  const tutup = () => { m.hidden = true; m.innerHTML = ''; };
  m.onclick = (e) => { if (e.target === m || e.target.closest('[data-tutup]')) tutup(); };
  if (setelah) setelah(m.querySelector('.panel'), tutup);
  const f = m.querySelector('input,select,textarea,button'); if (f) f.focus();
  return tutup;
}
export function konfirmasi(judul, pesan, label = 'Ya, lanjutkan') {
  return new Promise((ok) => {
    modal(html`<h3 class="judul-seksi">${judul}</h3><p>${pesan}</p><div class="btn-baris"><button class="btn garis" data-tutup>Batal</button><button class="btn" data-ya>${label}</button></div>`,
      (p, tutup) => { p.querySelector('[data-ya]').onclick = () => { tutup(); ok(true); }; p.querySelectorAll('[data-tutup]').forEach((b) => b.addEventListener('click', () => ok(false))); });
  });
}
export const memuat = (t = 'Memuat data…') => html`<div class="memuat"><div class="spin"></div><span>${t}</span></div>`;
export const kosong = (t) => html`<div class="kosong">${t}</div>`;
export function pill(teks, kelas) { return html`<span class="pill ${kelas}">${teks}</span>`; }
export function bar(nilai, penanda) {
  const w = Math.max(0, Math.min(100, Number(nilai) || 0));
  return html`<div class="bar" role="img" aria-label="${pct(nilai)}"><i style="width:${w.toFixed(2)}%"></i>${penanda !== null && penanda !== undefined ? html`<b style="left:${Math.max(0, Math.min(100, penanda)).toFixed(2)}%"></b>` : ''}</div>`;
}
export function dataForm(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { if (k in o) { o[k] = [].concat(o[k], v); } else o[k] = v; });
  form.querySelectorAll('input[type=checkbox][name]').forEach((c) => { if (!c.closest('.chips')) o[c.name] = c.checked; });
  return o;
}

// Ikon garis (inline SVG)
const IK = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  proyek: '<path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cek: '<path d="M20 6L9 17l-5-5"/>',
  akun: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  rab: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
  laporan: '<path d="M4 4h16v16H4z"/><path d="M4 8l8 5 8-5"/>',
  pengguna: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2 .6 3.5 2.3 3.5 5.3"/>',
  keluar: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  kembali: '<path d="M15 18l-6-6 6-6"/>',
  kanan: '<path d="M9 18l6-6-6-6"/>',
  beranda: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  grafik: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  material: '<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/>',
  masuk: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  pakai: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M4 3h16"/>',
  nota: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h3"/>',
  kamera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  peringatan: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
  offline: '<path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M12 20h.01"/><path d="M3 3l18 18"/>',
  segar: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  unduh: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
};
export function ikon(n, u = 22) { return raw(`<svg width="${u}" height="${u}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IK[n] || ''}</svg>`); }

/** Kurva S (SVG). titik: [{tanggal, rencana, realisasi}] */
export function kurvaS(titik, mulai) {
  if (!titik || titik.length < 2) return kosong('Kurva S muncul setelah tanggal mulai & data progres tersedia.');
  const W = 340, H = 170, L = 32, R = 12, T = 12, B = 26, n = titik.length;
  const x = (i) => L + (i / (n - 1)) * (W - L - R), y = (v) => T + (1 - v / 100) * (H - T - B);
  const jalur = (k) => { let p = '', ada = false; titik.forEach((t, i) => { if (t[k] === null || t[k] === undefined) return; p += (ada ? ' L' : 'M') + x(i).toFixed(1) + ' ' + y(t[k]).toFixed(1); ada = true; }); return p; };
  const adaRencana = titik.some((t) => t.rencana !== null);
  let akhirReal = -1; titik.forEach((t, i) => { if (t.realisasi !== null) akhirReal = i; });
  const mg = (t) => 'mg ' + (Math.floor(selisihHari(mulai, t.tanggal) / 7) + 1);
  const label = akhirReal >= 0 ? `<circle cx="${x(akhirReal)}" cy="${y(titik[akhirReal].realisasi)}" r="4" fill="#1F4E8C"/><text x="${Math.min(x(akhirReal) + 6, W - 60)}" y="${y(titik[akhirReal].realisasi) - 6}" font-size="11" font-weight="700" fill="#1F4E8C">${esc(pct(titik[akhirReal].realisasi))}</text>` : '';
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Kurva S: realisasi ${akhirReal >= 0 ? esc(pct(titik[akhirReal].realisasi)) : '-'}${adaRencana ? '' : ', tanpa jadwal rencana'}">
    ${[0, 50, 100].map((v) => `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="${v ? '#EEF1F6' : '#CBD3E1'}"/><text x="${L - 6}" y="${y(v) + 3}" font-size="10" fill="#5A6782" text-anchor="end">${v}</text>`).join('')}
    ${adaRencana ? `<path d="${jalur('rencana')}" fill="none" stroke="#C98A12" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
    <path d="${jalur('realisasi')}" fill="none" stroke="#1F4E8C" stroke-width="2.5"/>${label}
    <text x="${L}" y="${H - 6}" font-size="10" fill="#5A6782">${esc(mg(titik[0]))}</text><text x="${W - R}" y="${H - 6}" font-size="10" fill="#5A6782" text-anchor="end">${esc(mg(titik[n - 1]))}</text>
  </svg>`);
}

// ---------------------------------------------------------------- router & kerangka
const rute = [];
let layarAktif = null;
export function daftarRute(pola, peran, fn) { rute.push({ pola, peran, fn }); }
export function pergi(h) { if (location.hash === h) render(); else location.hash = h; }
export function beranda(u) { return u ? { PENGELOLA: '#/p', ADMIN: '#/a', CLIENT: '#/c' }[u.peran] || '#/login' : '#/login'; }

const NAV = {
  PENGELOLA: [['#/p', 'Dashboard', 'dashboard'], ['#/p/proyek', 'Proyek', 'proyek'], ['#/p/approval', 'Approval', 'cek', 'menunggu'], ['#/p/rab', 'RAB & CCO', 'rab', null, true], ['#/p/laporan', 'Laporan bulanan', 'laporan', null, true], ['#/p/pengguna', 'Pengguna', 'pengguna', null, true], ['#/akun', 'Akun', 'akun']],
  ADMIN: [['#/a', 'Beranda', 'beranda'], ['#/a/progres', 'Progres', 'grafik'], ['#/a/material', 'Material', 'material'], ['#/a/biaya', 'Biaya', 'nota', null, true], ['#/akun', 'Akun', 'akun']],
  CLIENT: [['#/c', 'Progres', 'grafik'], ['#/akun', 'Akun', 'akun']],
};
export const lencana = { menunggu: 0 };

function navAktif(h, href) { return href === h || (href.length > 3 && h.startsWith(href + '/')) || (href === '#/p' && /^#\/p\/proyek\//.test(h) && false); }

/**
 * Tampilkan layar: {judul, sub, kembali, kanan, tabs, isi, nav, pita}
 * Event: elemen [data-aksi] memanggil aksi[nama](el, ev); form[data-kirim] memanggil aksi[nama](form, ev).
 */
export function tampil(l) {
  layarAktif = l;
  const u = sesi.user(), h = location.hash || '#/';
  const nav = (NAV[u && u.peran] || []);
  const kunciNav = l.nav || h;
  const app = document.getElementById('app');
  app.innerHTML = html`<div class="app">
    <aside class="sidebar" aria-label="Menu utama">
      <div class="merek"><img src="icons/icon-192.png" alt=""><div class="kolom"><b class="h" style="font-size:14px">${CFG.APP_SHORT_NAME || 'MITRAKONIN'}</b><span class="redup" style="color:#C9D4E8">Monitor proyek</span></div></div>
      ${nav.filter((n) => n[0] !== '#/akun').map((n) => html`<a href="${n[0]}" class="${kunciNav === n[0] ? 'on' : ''}">${ikon(n[2], 20)}${n[1]}${n[3] && lencana[n[3]] ? html`<span class="lencana">${lencana[n[3]]}</span>` : ''}</a>`)}
      <div class="bawah"><a href="#/akun" class="${kunciNav === '#/akun' ? 'on' : ''}">${ikon('akun', 20)}${u ? u.nama : ''}</a><div style="padding:0 12px">${u ? u.peran : ''}</div></div>
    </aside>
    <div class="utama">
      ${!navigator.onLine ? html`<div class="pita">Offline — menampilkan data terakhir. Input tersimpan di HP dan terkirim otomatis saat sinyal kembali.</div>` : status.dariCache ? html`<div class="pita">Menampilkan data tersimpan (${new Date(status.waktuCache).toLocaleString('id-ID')}). Tarik ulang saat online.</div>` : ''}
      <header class="kepala ${l.tabs ? 'bertab' : ''}">
        <div class="kepala-baris">
          ${l.kembali ? html`<a class="ikon-btn" href="${l.kembali}" aria-label="Kembali" style="margin-left:-10px">${ikon('kembali')}</a>` : html`<img class="logo" src="icons/icon-192.png" alt="">`}
          <div class="kepala-judul"><b>${l.judul}</b>${l.sub ? html`<span>${l.sub}</span>` : ''}</div>
          ${l.kanan || ''}
          <button type="button" class="ikon-btn" data-segar aria-label="Segarkan data" title="Segarkan data">${ikon('segar', 20)}</button>
        </div>
        ${l.tabs ? html`<nav class="tabs" aria-label="Tab">${l.tabs.map((t) => html`<a class="tab ${t.on ? 'on' : ''}" href="${t.href}" aria-current="${t.on ? 'page' : 'false'}">${t.label}</a>`)}</nav>` : ''}
      </header>
      <main class="isi" id="isi">${l.isi}</main>
      <nav class="nav-bawah" aria-label="Navigasi">
        ${nav.filter((n) => !n[4]).map((n) => html`<a href="${n[0]}" class="${kunciNav === n[0] ? 'on' : ''}">${ikon(n[2])}${n[1].replace(' bulanan', '')}${n[3] && lencana[n[3]] ? html`<span class="lencana">${lencana[n[3]]}</span>` : ''}</a>`)}
      </nav>
    </div></div>`.s;
  if (l.setelah) l.setelah(app);
  muatGambar();
}
/** Ganti isi utama saja (tanpa menggambar ulang kerangka). */
export function isiUlang(konten) { const el = document.getElementById('isi'); if (el) el.innerHTML = keStr(konten); muatGambar(); }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-aksi]');
  if (!el || !layarAktif || !layarAktif.aksi) return;
  const fn = layarAktif.aksi[el.dataset.aksi];
  if (fn) { e.preventDefault(); fn.call(layarAktif.aksi, el, e); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-kirim]');
  if (!f || !layarAktif || !layarAktif.aksi) return;
  const fn = layarAktif.aksi[f.dataset.kirim];
  if (fn) { e.preventDefault(); fn.call(layarAktif.aksi, f, e); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-ubah]');
  if (!el || !layarAktif || !layarAktif.aksi) return;
  const fn = layarAktif.aksi[el.dataset.ubah];
  if (fn) fn.call(layarAktif.aksi, el, e);
});

let renderSeq = 0;
/**
 * Layar dipanggil sebagai fn(params, query, tampilkan). Pakai `tampilkan` (bukan `tampil`) agar
 * hasil muat yang terlambat tidak menimpa layar lain bila pengguna sudah pindah halaman.
 */
export async function render() {
  const seq = ++renderSeq;
  const tampilkan = (l) => { if (seq === renderSeq) tampil(l); };
  const h = location.hash || '#/';
  const u = sesi.user();
  if (!u && h !== '#/login') { location.hash = '#/login'; return; }
  if (u && (h === '#/' || h === '#/login' || h === '')) { location.hash = beranda(u); return; }
  for (const r of rute) {
    const [path, qs] = h.split('?');
    const m = path.match(r.pola);
    if (!m) continue;
    if (r.peran && (!u || r.peran.indexOf(u.peran) < 0)) { location.hash = beranda(u); return; }
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    try { await r.fn(m.slice(1).map(decodeURIComponent), q, tampilkan); }
    catch (e) { console.error(e); tampilkan({ judul: 'Terjadi kendala', kembali: beranda(u), isi: html`<div class="kartu merah"><b>${e.message}</b><button class="btn garis" data-aksi="ulang">Coba lagi</button></div>`, aksi: { ulang: () => render() } }); }
    window.scrollTo(0, 0);
    return;
  }
  location.hash = beranda(u);
}
window.addEventListener('hashchange', render);

// ---------------------------------------------------------------- foto lewat API
/**
 * <img data-media="MED-..."> diisi otomatis: thumbnail diambil lewat API (cek peran di server),
 * dikirim 12 sekaligus, dan disimpan di IndexedDB agar tampil cepat & offline.
 * Mengetuk gambar membuka ukuran penuh.
 */
const thumbMemori = new Map();
let muatJalan = false;
export async function muatGambar() {
  if (muatJalan) return; muatJalan = true;
  try {
    const els = [...document.querySelectorAll('img[data-media]:not([data-dimuat])')];
    const perlu = [];
    for (const el of els) {
      const id = el.dataset.media;
      const c = thumbMemori.get(id) || (await kv.get('th:' + id));
      if (c) { el.src = c; el.dataset.dimuat = 1; thumbMemori.set(id, c); } else if (!perlu.includes(id)) perlu.push(id);
    }
    for (let i = 0; i < perlu.length; i += 12) {
      let r = [];
      try { r = await api('mediaThumbs', { ids: perlu.slice(i, i + 12) }); } catch (e) { break; }
      r.forEach((x) => {
        if (!x.ok) { document.querySelectorAll(`img[data-media="${x.media_id}"]`).forEach((el) => { el.alt = x.tipe === 'VIDEO' ? 'Video' : 'Foto belum tersedia'; el.dataset.dimuat = 1; }); return; }
        const url = 'data:' + x.mime + ';base64,' + x.data_base64;
        thumbMemori.set(x.media_id, url); kv.set('th:' + x.media_id, url);
        document.querySelectorAll(`img[data-media="${x.media_id}"]`).forEach((el) => { el.src = url; el.dataset.dimuat = 1; });
      });
    }
  } finally { muatJalan = false; if (document.querySelector('img[data-media]:not([data-dimuat])')) setTimeout(muatGambar, 500); }
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-segar]')) return;
  memoriApi.clear(); status.dariCache = false; toast('Memuat data terbaru…'); render();
});
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-lihat]');
  if (!el) return;
  e.preventDefault();
  const tutup = modal(memuat('Membuka foto…'));
  try {
    const r = await api('mediaData', { media_id: el.dataset.lihat });
    tutup();
    if (r.terlalu_besar) return modal(html`<p>Berkas terlalu besar untuk ditampilkan di aplikasi.</p>${r.url ? html`<a class="btn" href="${r.url}" target="_blank" rel="noopener">Buka di Drive</a>` : ''}<button class="btn garis" data-tutup>Tutup</button>`);
    const src = 'data:' + r.mime + ';base64,' + r.data_base64;
    modal(/^image\//.test(r.mime) ? html`<img src="${src}" alt="Foto bukti" style="width:100%;border-radius:10px"><button class="btn garis" data-tutup>Tutup</button>`
      : /^video\//.test(r.mime) ? html`<video src="${src}" controls playsinline style="width:100%;border-radius:10px"></video><button class="btn garis" data-tutup>Tutup</button>`
        : html`<a class="btn" download="bukti" href="${src}">Unduh berkas</a><button class="btn garis" data-tutup>Tutup</button>`);
  } catch (er) { tutup(); toast(er.message, true); }
});
/** Kotak foto: <button data-lihat><img data-media></button> */
export function foto(m, cls = '') {
  return html`<button type="button" class="foto ${cls}" data-lihat="${m.media_id}" aria-label="Lihat ${m.tipe === 'VIDEO' ? 'video' : 'foto'} ${tgl(m.waktu_ambil)}"><img data-media="${m.media_id}" alt="" loading="lazy">${m.tipe === 'VIDEO' ? raw('<span class="lencana-video">▶</span>') : ''}<small>${tgl(m.waktu_ambil, false)}</small></button>`;
}
