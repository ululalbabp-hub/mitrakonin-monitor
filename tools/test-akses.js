#!/usr/bin/env node
/*
 * Audit hak akses lewat API (bukan lewat layar): memastikan CLIENT & ADMIN tidak bisa
 * membaca biaya aktual, harga beli, analisis internal, atau data proyek lain — dan tidak bisa menulis
 * di luar haknya. HANYA MEMBACA data; semua percobaan tulis yang diharapkan DITOLAK.
 *   node tools/test-akses.js
 * Akun dari ../../akun-uji-RAHASIA.json (di luar repo).
 */
'use strict';
const fs = require('fs'), path = require('path');
const cfg = fs.readFileSync(path.join(__dirname, '..', 'app', 'config.js'), 'utf8');
const API = cfg.match(/API_URL:\s*'([^']+)'/)[1];
const AKUN = JSON.parse(fs.readFileSync(process.env.MITRAKONIN_AKUN || path.join(__dirname, '..', '..', 'akun-uji-RAHASIA.json'), 'utf8'));

async function panggil(action, data, token) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, data, token }) });
  return r.json();
}
const hasil = [];
const cek = (nama, ok, info) => { hasil.push(ok); console.log((ok ? 'LULUS ' : 'GAGAL ') + nama + (ok || info === undefined ? '' : '  → ' + JSON.stringify(info).slice(0, 300))); };
const ditolak = (r) => !r.ok && ['AKSES', 'AUTH', 'TERKUNCI', 'VALIDASI', 'TIDAK_ADA'].includes(r.error.kode);

// Kata kunci yang TIDAK boleh muncul di data yang diterima client (nama kolom/kunci JSON).
const TERLARANG_CLIENT = /"(harga_kontrak|harga_final|jumlah_kontrak|jumlah_final|harga_satuan|harga_acuan|nominal_biaya|biaya_aktual|biaya_material|biaya_lain|biaya_per_kategori|indeks_biaya|serapan_pct|selisih_serapan|nilai_terpasang|nilai_stok|rab_final|rab_kontrak|risiko|stok|password_hash|input_oleh|approve_oleh|catatan_approve|folder_drive_id|overhead_pct|client_email|drive_file_id|pemasok|dibayar_ke)"\s*:/;
const TERLARANG_ADMIN = /"(harga_kontrak|harga_final|jumlah_kontrak|jumlah_final|biaya_aktual|biaya_per_kategori|indeks_biaya|serapan_pct|nilai_terpasang|nilai_stok|rab_final|rab_kontrak|risiko|password_hash|nilai_kontrak|overhead_pct|client_email|folder_drive_id)"\s*:/;

(async () => {
  const tok = {};
  for (const k of ['pengelola', 'admin', 'client']) { const r = await panggil('login', { email: AKUN[k].email, password: AKUN[k].password }); if (!r.ok) throw new Error('login ' + k + ': ' + r.error.pesan); tok[k] = r.data.token; tok[k + '_user'] = r.data.user; }
  const P = tok.pengelola, A = tok.admin, C = tok.client;
  const proyekSemua = (await panggil('list', { tab: 'PROYEK' }, P)).data;
  const milikC = tok.client_user.proyek, lainC = proyekSemua.map((p) => p.proyek_id).filter((id) => !milikC.includes(id));
  const milikA = tok.admin_user.proyek, lainA = proyekSemua.map((p) => p.proyek_id).filter((id) => !milikA.includes(id));
  console.log('Proyek client:', milikC.length, '· proyek lain:', lainC.length, '| admin:', milikA.length, '· lain:', lainA.length);
  const pidC = milikC[0];

  // ---------------- CLIENT: tab terlarang (dengan & tanpa proyek_id)
  for (const tab of ['BIAYA', 'MATERIAL_TRX', 'STOK', 'RISIKO', 'LOG', 'USERS', 'SETTING', 'MASTER_MATERIAL', 'MASTER_TENAGA']) {
    const r1 = await panggil('list', { tab }, C), r2 = await panggil('list', { tab, proyek_id: pidC }, C);
    cek('CLIENT list ' + tab + ' ditolak', ditolak(r1) && ditolak(r2), [r1.error, r2.error]);
  }
  for (const act of ['userList', 'antrianApproval']) cek('CLIENT ' + act + ' ditolak', ditolak(await panggil(act, {}, C)));
  // get by id untuk record sensitif
  const biaya1 = (await panggil('list', { tab: 'BIAYA', proyek_id: pidC, limit: 1 }, P)).data[0];
  const mtx1 = (await panggil('list', { tab: 'MATERIAL_TRX', proyek_id: pidC, limit: 1 }, P)).data[0];
  if (biaya1) cek('CLIENT get BIAYA by id ditolak', ditolak(await panggil('get', { tab: 'BIAYA', id: biaya1.biaya_id }, C)));
  if (mtx1) cek('CLIENT get MATERIAL_TRX by id ditolak', ditolak(await panggil('get', { tab: 'MATERIAL_TRX', id: mtx1.trx_id }, C)));

  // ---------------- CLIENT: tab yang boleh — tidak ada kolom terlarang & hanya data Disetujui
  for (const tab of ['PROYEK', 'RAB_ITEM', 'JADWAL', 'PROGRES', 'MEDIA', 'TERMIN', 'CCO', 'LAPORAN']) {
    const r = await panggil('list', { tab }, C);
    const teks = JSON.stringify(r.data || []);
    cek('CLIENT list ' + tab + ': tanpa kolom terlarang', r.ok && !TERLARANG_CLIENT.test(teks), (teks.match(TERLARANG_CLIENT) || [])[0]);
    cek('CLIENT list ' + tab + ': hanya proyek sendiri', r.ok && (r.data || []).every((x) => !x.proyek_id || milikC.includes(x.proyek_id)));
    if (tab === 'PROGRES') cek('CLIENT PROGRES: hanya Disetujui', r.ok && r.data.every((x) => x.status === 'Disetujui'));
    if (tab === 'MEDIA') cek('CLIENT MEDIA: hanya bukti progres/termin (tanpa nota & surat jalan)', r.ok && r.data.every((x) => x.ref_tipe === 'PROGRES' || x.ref_tipe === 'TERMIN'));
    if (tab === 'RAB_ITEM') cek('CLIENT RAB: tanpa item supply-by-owner', r.ok && r.data.every((x) => !x.supply_owner));
  }
  // dashboard
  const dC = await panggil('dashboardProyek', { proyek_id: pidC }, C);
  cek('CLIENT dashboardProyek: tanpa biaya/harga/stok/risiko', dC.ok && !TERLARANG_CLIENT.test(JSON.stringify(dC.data)), (JSON.stringify(dC.data).match(TERLARANG_CLIENT) || [])[0]);
  const dCa = await panggil('dashboard', {}, C);
  cek('CLIENT dashboard: tanpa biaya/harga & hanya proyek sendiri', dCa.ok && !TERLARANG_CLIENT.test(JSON.stringify(dCa.data)) && dCa.data.proyek.every((x) => milikC.includes(x.proyek.proyek_id)));
  // proyek lain
  for (const pid of lainC) {
    cek('CLIENT dashboardProyek proyek lain ditolak', ditolak(await panggil('dashboardProyek', { proyek_id: pid }, C)));
    cek('CLIENT list PROGRES proyek lain ditolak', ditolak(await panggil('list', { tab: 'PROGRES', proyek_id: pid }, C)));
    const it = (await panggil('list', { tab: 'RAB_ITEM', proyek_id: pid, limit: 1 }, P)).data[0];
    if (it) cek('CLIENT get RAB_ITEM proyek lain ditolak', ditolak(await panggil('get', { tab: 'RAB_ITEM', id: it.item_id }, C)));
    const lap = (await panggil('list', { tab: 'LAPORAN', proyek_id: pid }, P)).data[0];
    if (lap) cek('CLIENT unduh laporan proyek lain ditolak', ditolak(await panggil('unduhLaporan', { laporan_id: lap.laporan_id }, C)));
  }
  // media privat (nota/surat jalan) & media progres belum disetujui
  const mediaP = (await panggil('list', { tab: 'MEDIA' }, P)).data;
  const progP = (await panggil('list', { tab: 'PROGRES' }, P)).data;
  const statusProg = {}; progP.forEach((x) => { statusProg[x.progres_id] = x.status; });
  const privat = mediaP.filter((m) => m.ref_tipe === 'MATERIAL' || m.ref_tipe === 'BIAYA' || (m.ref_tipe === 'PROGRES' && statusProg[m.ref_id] !== 'Disetujui'));
  for (const m of privat.slice(0, 4)) {
    cek('CLIENT mediaData ' + m.ref_tipe + ' privat ditolak', ditolak(await panggil('mediaData', { media_id: m.media_id }, C)));
    const t = await panggil('mediaThumbs', { ids: [m.media_id] }, C);
    cek('CLIENT mediaThumbs ' + m.ref_tipe + ' privat kosong', t.ok && t.data.every((x) => !x.ok));
  }
  // percobaan tulis oleh client
  const it0 = (await panggil('list', { tab: 'RAB_ITEM', proyek_id: pidC, limit: 1 }, C)).data[0];
  const tulis = [
    ['create PROGRES', 'create', { tab: 'PROGRES', row: { proyek_id: pidC, item_id: it0 && it0.item_id, persen_kumulatif: 99 } }],
    ['create TERMIN', 'create', { tab: 'TERMIN', row: { proyek_id: pidC, termin_ke: 99 } }],
    ['update PROYEK', 'update', { tab: 'PROYEK', id: pidC, row: { nama: 'x' } }],
    ['update TERMIN', 'update', { tab: 'TERMIN', id: 'x', row: { status: 'Lunas' } }],
    ['remove PROGRES', 'remove', { tab: 'PROGRES', id: 'x' }],
    ['approve', 'approve', { tab: 'PROGRES', id: 'x', keputusan: 'Disetujui' }],
    ['upload', 'upload', { proyek_id: pidC, ref_tipe: 'PROGRES', ref_id: 'x', tipe: 'FOTO', data_base64: 'AA==' }],
    ['importRab', 'importRab', { proyek_id: pidC, items: [{}] }], ['buatCco', 'buatCco', { proyek_id: pidC }], ['simpanJadwal', 'simpanJadwal', { proyek_id: pidC }],
    ['progresAwal', 'progresAwal', { proyek_id: pidC }], ['buatLaporan', 'buatLaporan', { proyek_id: pidC }], ['userCreate', 'userCreate', { nama: 'x', email: 'x@x.co', peran: 'PENGELOLA' }],
    ['userUpdate (naik peran)', 'userUpdate', { user_id: tok.client_user.user_id, peran: 'PENGELOLA' }], ['settingSet', 'settingSet', { kunci: 'nama_perusahaan', nilai: 'x' }],
    ['hapusProyekUji', 'hapusProyekUji', {}], ['unggahLogo', 'unggahLogo', { mime: 'image/png', data_base64: 'AA==' }], ['bootstrap', 'bootstrap', { nama: 'x', email: 'y@y.co', password: 'abcdefg12' }],
  ];
  for (const [nama, act, d] of tulis) cek('CLIENT ' + nama + ' ditolak', ditolak(await panggil(act, d, C)));

  // ---------------- ADMIN
  for (const tab of ['RISIKO', 'LOG', 'USERS', 'SETTING', 'TERMIN', 'CCO', 'LAPORAN']) cek('ADMIN list ' + tab + ' ditolak', ditolak(await panggil('list', { tab }, A)));
  for (const tab of ['PROYEK', 'RAB_ITEM', 'STOK']) {
    const r = await panggil('list', { tab }, A), teks = JSON.stringify(r.data || []);
    cek('ADMIN list ' + tab + ': tanpa nilai kontrak/harga RAB', r.ok && !TERLARANG_ADMIN.test(teks), (teks.match(TERLARANG_ADMIN) || [])[0]);
  }
  const dA = await panggil('dashboardProyek', { proyek_id: milikA[0] }, A);
  cek('ADMIN dashboard: tanpa keuangan/risiko/nilai kontrak', dA.ok && !TERLARANG_ADMIN.test(JSON.stringify(dA.data)), (JSON.stringify(dA.data).match(TERLARANG_ADMIN) || [])[0]);
  for (const pid of lainA) cek('ADMIN proyek lain ditolak', ditolak(await panggil('dashboardProyek', { proyek_id: pid }, A)));
  const progAng = progP.find((x) => x.status === 'Disetujui');
  const tulisA = [
    ['approve', 'approve', { tab: 'PROGRES', id: progAng && progAng.progres_id, keputusan: 'Disetujui' }],
    ['update progres yang sudah Disetujui', 'update', { tab: 'PROGRES', id: progAng && progAng.progres_id, row: { persen_kumulatif: 100 } }],
    ['remove progres yang sudah Disetujui', 'remove', { tab: 'PROGRES', id: progAng && progAng.progres_id }],
    ['update RAB_ITEM', 'update', { tab: 'RAB_ITEM', id: it0 && it0.item_id, row: { cara_ukur: 'volume' } }],
    ['create TERMIN', 'create', { tab: 'TERMIN', row: { proyek_id: milikA[0], termin_ke: 99 } }],
    ['create RISIKO', 'create', { tab: 'RISIKO', row: { proyek_id: milikA[0], deskripsi: 'x' } }],
    ['buatCco', 'buatCco', { proyek_id: milikA[0] }], ['buatLaporan', 'buatLaporan', { proyek_id: milikA[0] }], ['userList', 'userList', {}],
    ['userUpdate (naik peran)', 'userUpdate', { user_id: tok.admin_user.user_id, peran: 'PENGELOLA' }], ['settingSet', 'settingSet', { kunci: 'nama_perusahaan', nilai: 'x' }],
  ];
  for (const [nama, act, d] of tulisA) cek('ADMIN ' + nama + ' ditolak', ditolak(await panggil(act, d, A)));
  // admin menyelipkan status Disetujui saat input -> server memaksa Menunggu (tidak dibuat: hanya cek via validasi proyek lain)
  if (lainA[0]) cek('ADMIN input ke proyek lain ditolak', ditolak(await panggil('create', { tab: 'BIAYA', row: { proyek_id: lainA[0], kategori: 'Upah', uraian: 'x', nominal: 1 } }, A)));

  // ---------------- tanpa token / token palsu
  for (const act of ['list', 'dashboard', 'dashboardProyek', 'mediaData', 'unduhLaporan', 'approve']) {
    cek('Tanpa login: ' + act + ' ditolak', ditolak(await panggil(act, { tab: 'PROYEK' })));
    cek('Token palsu: ' + act + ' ditolak', ditolak(await panggil(act, { tab: 'PROYEK' }, 'x'.repeat(64))));
  }
  cek('Aksi tak dikenal ditolak', !(await panggil('hapusSemua', {}, P)).ok);
  const gagal = hasil.filter((x) => !x).length;
  console.log('\n' + (hasil.length - gagal) + '/' + hasil.length + ' lulus');
  process.exitCode = gagal ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
