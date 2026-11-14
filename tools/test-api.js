#!/usr/bin/env node
/*
 * Uji API Web App end-to-end dengan 3 peran.  node tools/test-api.js
 * - URL dibaca dari app/config.js
 * - Akun uji & password disimpan di ..\akun-uji-RAHASIA.json (folder induk repo, DI LUAR repo publik)
 * - Tiap putaran membuat proyek uji "UJI-API-xxxx" dengan RAB mini. Hapus lewat Sheet bila tidak diperlukan.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cfg = fs.readFileSync(path.join(__dirname, '..', 'app', 'config.js'), 'utf8');
const API = (cfg.match(/API_URL:\s*'([^']+)'/) || [])[1];
if (!API || !/^https:/.test(API)) { console.error('API_URL di app/config.js belum diisi.'); process.exit(2); }
const fileAkun = process.env.MITRAKONIN_AKUN || path.join(__dirname, '..', '..', 'akun-uji-RAHASIA.json'); // di luar repo

async function panggil(action, data, token) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token, data }), redirect: 'follow' });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return { ok: false, error: { kode: 'BUKAN_JSON', pesan: t.slice(0, 200) } }; }
}
const hasil = [];
function cek(nama, ok, info) { hasil.push([nama, !!ok]); console.log((ok ? 'LULUS ' : 'GAGAL ') + nama + (ok || !info ? '' : '  → ' + JSON.stringify(info).slice(0, 300))); }
function pw() { return 'Uji' + crypto.randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, 'x') + '7'; }

(async () => {
  let akun = {};
  try { akun = JSON.parse(fs.readFileSync(fileAkun, 'utf8')); } catch (e) { /* belum ada */ }
  const P = akun.pengelola || { nama: 'Pengelola Uji (contoh)', email: 'pengelola.uji@mitrakonin.test', password: pw() };
  const A = akun.admin || { nama: 'Admin Lapangan Uji (contoh)', email: 'admin.uji@mitrakonin.test', password: pw() };
  const C = akun.client || { nama: 'Client Uji (contoh)', email: 'client.uji@mitrakonin.test', password: pw() };
  const simpan = () => { fs.mkdirSync(path.dirname(fileAkun), { recursive: true }); fs.writeFileSync(fileAkun, JSON.stringify({ catatan: 'Akun uji MITRAKONIN Monitor (demo). Jangan di-commit.', pengelola: P, admin: A, client: C }, null, 2)); };

  let r = await panggil('ping');
  cek('ping', r.ok, r);

  r = await panggil('bootstrap', { nama: P.nama, email: P.email, password: P.password });
  if (r.ok) { simpan(); cek('bootstrap pengelola uji', true); }
  else cek('bootstrap sudah ditutup (pengelola sudah ada)', r.error.kode === 'AKSES', r);

  r = await panggil('login', { email: P.email, password: 'salah-password-1' });
  cek('login password salah ditolak', !r.ok && r.error.kode === 'AUTH', r);
  r = await panggil('login', { email: P.email, password: P.password });
  cek('login pengelola', r.ok, r);
  if (!r.ok) return selesai();
  const tP = r.data.token;

  r = await panggil('list', { tab: 'PROYEK' }, 'token-palsu');
  cek('token palsu ditolak', !r.ok && r.error.kode === 'AUTH', r);

  // Proyek uji
  // Proyek baru tiap putaran agar angka uji bersih (kode UJI-API-xxxx; hapus lewat Sheet bila tidak perlu)
  const kodeUji = process.env.UJI_KODE || 'UJI-API-' + Date.now().toString(36).toUpperCase();
  r = await panggil('list', { tab: 'PROYEK', where: { kode: kodeUji } }, tP);
  let pid = r.ok && r.data[0] && r.data[0].proyek_id;
  if (!pid) {
    r = await panggil('create', { tab: 'PROYEK', row: { kode: kodeUji, nama: 'Proyek Uji API (contoh, hapus nanti)', jenis: 'Komersial', lokasi: '-', client_nama: 'Client Uji', tgl_mulai: hariLalu(20), durasi_hari: 60, status: 'Berjalan', project_manager: 'PM Uji' } }, tP);
    cek('pengelola buat proyek', r.ok && r.data.row.folder_drive_id, r);
    pid = r.data && r.data.id;
  } else {
    cek('proyek uji sudah ada: ' + pid, true);
    if (!r.data[0].tgl_mulai) {
      r = await panggil('update', { tab: 'PROYEK', id: pid, row: { jenis: 'komersial', lokasi: '-', client_nama: 'Client Uji', tgl_mulai: hariLalu(20), durasi_hari: 60, status: 'Berjalan', project_manager: 'PM Uji' } }, tP);
      cek('lengkapi data proyek uji (tgl_mulai otomatis → tgl_selesai)', r.ok, r);
    }
  }

  // Import RAB mini
  const items = [
    { item_id: 'I-1', kategori: 'Struktur', bab_kode: 'I', bab_nama: 'PEKERJAAN PERSIAPAN', no_item: '1', uraian: 'Mobilisasi (contoh)', satuan: 'ls', vol_kontrak: 1, harga_kontrak: 10000000, jumlah_kontrak: 10000000, vol_final: 1, harga_final: 10000000, jumlah_final: 10000000, status_cco: 'Tetap', cara_ukur: 'persen' },
    { item_id: 'II-1', kategori: 'Struktur', bab_kode: 'II', bab_nama: 'PEKERJAAN BETON', no_item: '1', uraian: 'Beton kolom (contoh)', satuan: 'm3', vol_kontrak: 10, harga_kontrak: 6000000, jumlah_kontrak: 60000000, vol_final: 10, harga_final: 6000000, jumlah_final: 60000000, status_cco: 'Tetap', cara_ukur: 'volume' },
    { item_id: 'II-2', kategori: 'Struktur', bab_kode: 'II', bab_nama: 'PEKERJAAN BETON', no_item: '2', uraian: 'Bekisting (contoh)', satuan: 'm2', vol_kontrak: 100, harga_kontrak: 300000, jumlah_kontrak: 30000000, vol_final: 100, harga_final: 300000, jumlah_final: 30000000, status_cco: 'Tetap', cara_ukur: 'volume' },
    { item_id: 'XIII-1', kategori: 'Lain-lain', bab_kode: 'XIII', bab_nama: 'SUPPLY BY OWNER', no_item: '1', uraian: 'Lift (contoh)', satuan: 'unit', vol_kontrak: 1, harga_kontrak: 50000000, jumlah_kontrak: 50000000, vol_final: 0, harga_final: 0, jumlah_final: 0, status_cco: 'Tetap', cara_ukur: 'volume', supply_owner: true },
  ];
  const temuan = [{ id: 'T001', level: 'MERAH', kode: 'REKAP_BAB', pesan: 'contoh temuan merah' }];
  r = await panggil('importRab', { proyek_id: pid, items, cco: [], temuan, konfirmasi: [], ringkasan: { grandKontrak: 105000000, overheadPct: 5 } }, tP);
  const sudahAdaRab = !r.ok && r.error.kode === 'TERKUNCI';
  if (!sudahAdaRab) cek('import ditolak bila temuan MERAH belum dikonfirmasi', !r.ok && r.error.kode === 'VALIDASI', r);
  if (!sudahAdaRab) {
    r = await panggil('importRab', { proyek_id: pid, items, cco: [], temuan, konfirmasi: ['T001'], ringkasan: { grandKontrak: 105000000, overheadPct: 5 }, file: { nama: 'rab-uji.xlsx', data_base64: Buffer.from('uji').toString('base64') } }, tP);
    cek('import RAB setelah konfirmasi', r.ok && r.data.jumlah_item === 4, r);
  }
  r = await panggil('importRab', { proyek_id: pid, items, cco: [], temuan: [], konfirmasi: [] }, tP);
  cek('import ulang ditolak (RAB terkunci)', !r.ok && r.error.kode === 'TERKUNCI', r);

  r = await panggil('list', { tab: 'RAB_ITEM', proyek_id: pid }, tP);
  const rab = r.data || [];
  const iMob = rab.find(x => /Mobilisasi/.test(x.uraian)), iBeton = rab.find(x => /Beton kolom/.test(x.uraian));
  cek('bobot tanpa supply-by-owner = 100%', Math.abs(rab.reduce((s, x) => s + Number(x.bobot_pct || 0), 0) - 100) < 1e-6, rab.map(x => x.bobot_pct));

  r = await panggil('update', { tab: 'RAB_ITEM', id: iBeton.item_id, row: { vol_kontrak: 99 } }, tP);
  cek('kolom kontrak RAB terkunci (pengelola pun ditolak)', !r.ok && r.error.kode === 'TERKUNCI', r);

  // Pengguna admin & client
  for (const [u, peran] of [[A, 'ADMIN'], [C, 'CLIENT']]) {
    r = await panggil('userCreate', { nama: u.nama, email: u.email, peran, proyek_akses: pid, password: u.password }, tP);
    if (!r.ok && /sudah terdaftar/.test(r.error.pesan)) {
      const l = await panggil('userList', {}, tP);
      const ada = l.data.find(x => x.email === u.email);
      await panggil('userUpdate', { user_id: ada.user_id, proyek_akses: [...new Set(String(ada.proyek_akses).split(',').filter(Boolean).concat(pid))].join(',') }, tP);
      cek('akun ' + peran + ' uji sudah ada, akses proyek diperbarui', true);
    } else cek('pengelola buat akun ' + peran, r.ok, r);
  }
  simpan();
  r = await panggil('userList', {}, tP);
  cek('userList tidak mengirim password_hash', r.ok && r.data.every(x => !('password_hash' in x)), r.data && r.data[0]);

  r = await panggil('login', { email: A.email, password: A.password }); const tA = r.data && r.data.token; cek('login admin', r.ok, r);
  r = await panggil('login', { email: C.email, password: C.password }); const tC = r.data && r.data.token; cek('login client', r.ok, r);

  // Admin input
  r = await panggil('create', { tab: 'PROGRES', row: { proyek_id: pid, tanggal: hariLalu(0), item_id: iBeton.item_id, volume_hari_ini: 4, uraian_kegiatan: 'Pengecoran kolom lt.1 (contoh)', cuaca: 'Cerah', jumlah_pekerja: 8, status: 'Disetujui' } }, tA);
  cek('admin input progres → status Menunggu (status kiriman diabaikan)', r.ok && r.data.row.status === 'Menunggu', r);
  const prg = r.data && r.data.id;
  r = await panggil('create', { tab: 'PROGRES', row: { proyek_id: pid, tanggal: hariLalu(0), item_id: iMob.item_id, persen_kumulatif: 50, uraian_kegiatan: 'Mobilisasi alat (contoh)' } }, tA);
  const prg2 = r.data && r.data.id; cek('admin input progres lumpsum (persen)', r.ok, r);
  r = await panggil('update', { tab: 'PROGRES', id: prg, row: { volume_hari_ini: 5 } }, tA);
  cek('admin edit progres sendiri saat Menunggu', r.ok, r);
  r = await panggil('create', { tab: 'MATERIAL_TRX', row: { proyek_id: pid, kode_material: 'STR-03', jenis: 'MASUK', qty: 100, harga_satuan: 65000, pemasok: 'Toko contoh', item_id: iBeton.item_id } }, tA);
  const mtx = r.data && r.data.id; cek('admin input material MASUK', r.ok, r);
  r = await panggil('create', { tab: 'MATERIAL_TRX', row: { proyek_id: pid, kode_material: 'STR-03', jenis: 'PAKAI', qty: 30, item_id: iBeton.item_id } }, tA);
  const mtx2 = r.data && r.data.id; cek('admin input material PAKAI (peringatan saldo)', r.ok && r.data.peringatan.length > 0, r);
  r = await panggil('create', { tab: 'BIAYA', row: { proyek_id: pid, kategori: 'Upah', bab_kode: 'II', uraian: 'Upah tukang minggu 1 (contoh)', nominal: 4000000, dibayar_ke: 'Mandor contoh' } }, tA);
  const bya = r.data && r.data.id; cek('admin input biaya', r.ok, r);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  r = await panggil('upload', { proyek_id: pid, ref_tipe: 'PROGRES', ref_id: prg, tipe: 'FOTO', nama_file: 'uji.png', mime: 'image/png', data_base64: png, lat: -6.2, lng: 106.8, waktu_ambil: new Date().toISOString().slice(0, 19) }, tA);
  cek('admin unggah foto progres ke Drive', r.ok && r.data.drive_file_id, r);
  r = await panggil('upload', { proyek_id: pid, ref_tipe: 'BIAYA', ref_id: bya, tipe: 'FOTO', nama_file: 'nota.png', mime: 'image/png', data_base64: png }, tA);
  cek('admin unggah foto nota (privat, tanpa url publik)', r.ok && !r.data.url, r);
  const mediaNota = r.data && r.data.media_id;

  // Admin dilarang
  r = await panggil('approve', { tab: 'PROGRES', id: prg, keputusan: 'Disetujui' }, tA);
  cek('admin tidak bisa approve', !r.ok && r.error.kode === 'AKSES', r);
  r = await panggil('create', { tab: 'TERMIN', row: { proyek_id: pid, termin_ke: 9 } }, tA);
  cek('admin tidak bisa input termin', !r.ok && r.error.kode === 'AKSES', r);
  r = await panggil('list', { tab: 'RAB_ITEM', proyek_id: pid }, tA);
  cek('admin tidak menerima harga RAB', r.ok && r.data.every(x => !('harga_final' in x) && !('jumlah_kontrak' in x)), r.data && r.data[0]);

  // Client sebelum approve
  r = await panggil('dashboardProyek', { proyek_id: pid }, tC);
  cek('client: input Menunggu belum dihitung (realisasi 0)', r.ok && r.data.ringkas.realisasi_pct === 0, r.data && r.data.ringkas);
  r = await panggil('list', { tab: 'PROGRES', proyek_id: pid }, tC);
  cek('client: tidak melihat progres Menunggu', r.ok && r.data.length === 0, r);

  // Pengelola approve
  r = await panggil('antrianApproval', { proyek_id: pid }, tP);
  cek('antrian approval berisi input admin (≥5)', r.ok && r.data.length >= 5, r.data && r.data.length);
  r = await panggil('approve', { tab: 'PROGRES', ids: [prg, prg2], keputusan: 'Disetujui', catatan: 'OK' }, tP);
  cek('approve progres (massal)', r.ok && r.data.every(x => x.ok), r);
  r = await panggil('approve', { tab: 'MATERIAL_TRX', ids: [mtx, mtx2], keputusan: 'Disetujui' }, tP);
  cek('approve material', r.ok && r.data.every(x => x.ok), r);
  r = await panggil('approve', { tab: 'BIAYA', id: bya, keputusan: 'Ditolak' }, tP);
  cek('tolak tanpa alasan ditolak', !r.ok && r.error.kode === 'VALIDASI', r);
  r = await panggil('approve', { tab: 'BIAYA', id: bya, keputusan: 'Disetujui' }, tP);
  cek('approve biaya', r.ok, r);
  r = await panggil('update', { tab: 'PROGRES', id: prg, row: { volume_hari_ini: 9 } }, tA);
  cek('admin tidak bisa edit progres yang sudah Disetujui', !r.ok && r.error.kode === 'TERKUNCI', r);

  // Jadwal & termin
  r = await panggil('list', { tab: 'JADWAL', proyek_id: pid }, tP);
  if (!r.data.length) for (const it of rab.filter(x => !x.supply_owner && String(x.supply_owner).toUpperCase() !== 'TRUE')) {
    await panggil('create', { tab: 'JADWAL', row: { proyek_id: pid, item_id: it.item_id, tgl_mulai: hariLalu(20), tgl_selesai: hariLalu(-20) } }, tP);
  }
  r = await panggil('list', { tab: 'TERMIN', proyek_id: pid }, tP);
  if (!r.data.length) {
    await panggil('create', { tab: 'TERMIN', row: { proyek_id: pid, termin_ke: 1, syarat_progres_pct: 0, persen_nilai: 30, status: 'Ditagih', tgl_tagih: hariLalu(20) } }, tP);
    await panggil('create', { tab: 'TERMIN', row: { proyek_id: pid, termin_ke: 2, syarat_progres_pct: 50, persen_nilai: 40 } }, tP);
  }

  // Dashboard pengelola
  r = await panggil('dashboardProyek', { proyek_id: pid }, tP);
  const d = r.data || { ringkas: {} };
  console.log('   ringkas:', JSON.stringify({ realisasi: d.ringkas.realisasi_pct, rencana: d.ringkas.rencana_pct, deviasi: d.ringkas.deviasi, terpasang: d.ringkas.nilai_terpasang, biaya: d.ringkas.biaya_aktual, indeks: d.ringkas.indeks_biaya }));
  console.log('   indikator:', JSON.stringify(Object.fromEntries(Object.entries(d.indikator || {}).map(([k, v]) => [k, v.warna + (v.nilai === null ? '' : ' ' + v.nilai)]))));
  cek('pengelola: realisasi dihitung dari input disetujui', r.ok && d.ringkas.realisasi_pct > 0, d.ringkas);
  cek('pengelola: rencana & deviasi (ada jadwal)', d.ringkas.rencana_pct !== null && d.ringkas.deviasi !== null, d.ringkas);
  // beton 5/10 × bobot 60% = 30%; mobilisasi 50% × 10% = 5% → 35%
  cek('rumus: realisasi = Σ bobot × progres (35%)', Math.abs(d.ringkas.realisasi_pct - 35) < 0.01, d.ringkas.realisasi_pct);
  cek('rumus: biaya aktual = MASUK×harga + BIAYA (10.500.000)', d.ringkas.biaya_aktual === 100 * 65000 + 4000000, d.ringkas.biaya_aktual);
  cek('rumus: nilai terpasang (35.000.000) & indeks biaya', d.ringkas.nilai_terpasang === 35000000 && Math.abs(d.ringkas.indeks_biaya - 35000000 / 10500000) < 0.01, d.ringkas);
  cek('Kurva S tersedia', Array.isArray(d.kurva_s) && d.kurva_s.length > 2, d.kurva_s && d.kurva_s.length);
  cek('stok STR-03 saldo 70', (d.stok || []).some(s => s.kode_material === 'STR-03' && s.saldo === 70), d.stok);
  cek('termin 1 lewat jatuh tempo → indikator Merah & risiko otomatis', d.indikator.termin.warna === 'Merah' && (d.risiko || []).some(x => x.sumber === 'otomatis'), { termin: d.indikator.termin, risiko: d.risiko });

  // Client setelah approve: tidak bocor
  r = await panggil('dashboardProyek', { proyek_id: pid }, tC);
  const c = r.data || {};
  const teks = JSON.stringify(c);
  cek('client: realisasi tampil setelah approve', r.ok && c.ringkas.realisasi_pct > 0, c.ringkas);
  cek('client: dashboard tanpa biaya/indeks/stok/risiko/harga', !/biaya|indeks|harga|stok|risiko|nilai_terpasang|serapan/i.test(Object.keys(c).join(',') + Object.keys(c.ringkas || {}).join(',')) && !/"harga|"biaya|"nilai_stok/.test(teks), Object.keys(c.ringkas || {}));
  for (const tab of ['BIAYA', 'MATERIAL_TRX', 'STOK', 'RISIKO', 'LOG', 'USERS', 'SETTING', 'MASTER_MATERIAL']) {
    r = await panggil('list', { tab, proyek_id: tab === 'USERS' || tab === 'LOG' || tab === 'SETTING' || tab === 'MASTER_MATERIAL' ? undefined : pid }, tC);
    cek('client: list ' + tab + ' ditolak server', !r.ok && r.error.kode === 'AKSES', r);
  }
  r = await panggil('list', { tab: 'RAB_ITEM', proyek_id: pid }, tC);
  cek('client: RAB tanpa harga & tanpa item supply-by-owner', r.ok && r.data.length === 3 && r.data.every(x => !('harga_final' in x) && !('jumlah_final' in x) && !('harga_kontrak' in x)), r.data && r.data[0]);
  r = await panggil('list', { tab: 'MEDIA', proyek_id: pid }, tC);
  cek('client: media hanya foto progres disetujui (bukan nota)', r.ok && r.data.length >= 1 && r.data.every(x => x.ref_tipe === 'PROGRES'), r.data);
  r = await panggil('mediaData', { media_id: mediaNota }, tC);
  cek('client: tidak bisa mengambil file nota lewat mediaData', !r.ok && r.error.kode === 'AKSES', r);
  r = await panggil('get', { tab: 'BIAYA', id: bya }, tC);
  cek('client: get BIAYA by id ditolak', !r.ok && r.error.kode === 'AKSES', r);
  r = await panggil('create', { tab: 'PROGRES', row: { proyek_id: pid, item_id: iBeton.item_id, volume_hari_ini: 1 } }, tC);
  cek('client: tidak bisa input', !r.ok && r.error.kode === 'AKSES', r);
  r = await panggil('dashboardProyek', { proyek_id: 'PRY-TIDAK-ADA' }, tC);
  cek('client: proyek lain ditolak', !r.ok, r);

  // CCO
  r = await panggil('buatCco', { proyek_id: pid, jenis: 'Tambah', item_id: iBeton.item_id, vol_baru: 12, alasan: 'Uji CCO tambah volume (contoh)' }, tP);
  cek('CCO tambah volume', r.ok, r);
  r = await panggil('get', { tab: 'RAB_ITEM', id: iBeton.item_id }, tP);
  cek('CCO: kontrak tetap, final berubah, status Tambah', r.ok && r.data.vol_kontrak === 10 && r.data.vol_final === 12 && r.data.status_cco === 'Tambah', r.data);

  r = await panggil('list', { tab: 'LOG', limit: 200 }, tP);
  cek('LOG mencatat create/approve/CCO', r.ok && ['CREATE', 'APPROVE', 'CCO', 'IMPORT_RAB'].every(a => r.data.some(x => x.aksi === a)), r.data && r.data.slice(-3));

  r = await panggil('dashboard', {}, tP);
  cek('dashboard semua proyek (pengelola)', r.ok && r.data.proyek.length >= 1, r);
  const aksesClient = ((await panggil('userList', {}, tP)).data.find(x => x.email === C.email).proyek_akses || '').split(',');
  r = await panggil('dashboard', {}, tC);
  cek('dashboard client hanya proyek yang diberi akses', r.ok && r.data.proyek.some(x => x.proyek.proyek_id === pid) && r.data.proyek.every(x => aksesClient.includes(x.proyek.proyek_id)), r.data && r.data.proyek.map(x => x.proyek.proyek_id));

  await panggil('logout', {}, tA);
  r = await panggil('me', {}, tA);
  cek('logout mematikan token', !r.ok && r.error.kode === 'AUTH', r);
  selesai();
})().catch(e => { console.error(e); process.exit(1); });

function hariLalu(n) { const d = new Date(Date.now() + 7 * 3600e3 - n * 86400e3); return d.toISOString().slice(0, 10); }
function selesai() {
  const gagal = hasil.filter(x => !x[1]).length;
  console.log('\n' + (hasil.length - gagal) + '/' + hasil.length + ' lulus');
  console.log('Akun uji tersimpan di: ' + fileAkun);
  process.exitCode = gagal ? 1 : 0;
}
