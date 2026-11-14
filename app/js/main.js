import { daftarRute, render, antrian, sesi, api } from './inti.js';
import { layarLogin, layarAkun, konfigurasi } from './layar/umum.js';
import * as P from './layar/pengelola.js';
import * as A from './layar/admin.js';
import * as C from './layar/client.js';

const PG = ['PENGELOLA'], AD = ['ADMIN'], CL = ['CLIENT'], SEMUA = ['PENGELOLA', 'ADMIN', 'CLIENT'];

daftarRute(/^#\/login$/, null, layarLogin);
daftarRute(/^#\/akun$/, SEMUA, layarAkun);
// Pengelola
daftarRute(/^#\/p$/, PG, P.dashboard);
daftarRute(/^#\/p\/proyek$/, PG, P.daftarProyek);
daftarRute(/^#\/p\/proyek-baru$/, PG, P.proyekBaru);
daftarRute(/^#\/p\/proyek\/([^/]+)$/, PG, P.detailProyek);
daftarRute(/^#\/p\/proyek\/([^/]+)\/ubah$/, PG, P.proyekBaru);
daftarRute(/^#\/p\/import\/([^/]+)$/, PG, P.importRab);
daftarRute(/^#\/p\/termin\/([^/]+)$/, PG, P.terminJadwal);
daftarRute(/^#\/p\/approval$/, PG, P.approval);
daftarRute(/^#\/p\/rab$/, PG, P.rabPilih);
daftarRute(/^#\/p\/rab\/([^/]+)$/, PG, P.rab);
daftarRute(/^#\/p\/pengguna$/, PG, P.pengguna);
daftarRute(/^#\/p\/laporan$/, PG, P.laporan);
// Admin lapangan
daftarRute(/^#\/a$/, AD, A.beranda);
daftarRute(/^#\/a\/progres$/, AD, A.lapor);
daftarRute(/^#\/a\/material$/, AD, A.material);
daftarRute(/^#\/a\/biaya$/, AD, A.biaya);
// Client
daftarRute(/^#\/c$/, CL, C.progres);
daftarRute(/^#\/c\/([^/]+)$/, CL, C.progres);

if (sesi.get()) {
  konfigurasi().catch(() => {});
  // Segarkan profil (peran & daftar proyek) dari server tanpa menunggu.
  api('me').then((u) => { const s = sesi.get(); if (s) sesi.set(Object.assign(s, { user: u })); }).catch(() => {});
}
render();
antrian.proses();
setInterval(() => antrian.proses(), 60000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
}
