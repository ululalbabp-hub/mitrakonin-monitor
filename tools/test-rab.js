#!/usr/bin/env node
/*
 * Uji importer RAB dengan file contoh (di luar repo).
 *   node tools/test-rab.js [path.xlsx]
 * Default: file .xlsx pertama di %MITRAKONIN_SAMPLES% (default C:UsersHPDownloadsMITRAKONIN).
 * Nilai harapan (opsional) dibaca dari ../../uji-harapan-RAHASIA.json — DI LUAR repo, karena berisi angka kontrak client.
 * SheetJS dibaca dari node_modules biasa, atau dari %LOCALAPPDATA%\mitrakonin-tools
 * (repo ada di Google Drive yang merusak node_modules — lihat tools/README.md).
 */
'use strict';
const fs = require('fs');
const path = require('path');

function muatXlsx() {
  try { return require('xlsx'); } catch (e) { /* lanjut */ }
  const alt = path.join(process.env.LOCALAPPDATA || '', 'mitrakonin-tools', 'node_modules', 'xlsx');
  try { return require(alt); } catch (e) {
    console.error('SheetJS tidak ditemukan. Jalankan tools/pasang-deps.ps1 dulu.');
    process.exit(2);
  }
}
const XLSX = muatXlsx();
const RabImport = require(path.join(__dirname, '..', 'app', 'js', 'rab-import.js'));

const folder = process.env.MITRAKONIN_SAMPLES || 'C:\\Users\\HP\\Downloads\\MITRAKONIN';
const file = process.argv[2] || (fs.existsSync(folder) ? fs.readdirSync(folder).filter((n) => /.xlsx$/i.test(n)).map((n) => path.join(folder, n))[0] : null);
if (!file) { console.error('Tidak ada file .xlsx. Beri path: node tools/test-rab.js <file.xlsx>'); process.exit(2); }
const fileHarapan = process.env.MITRAKONIN_HARAPAN || path.join(__dirname, '..', '..', 'uji-harapan-RAHASIA.json');
let harapan = null;
try { const semua = JSON.parse(fs.readFileSync(fileHarapan, 'utf8')); harapan = semua[path.basename(file)] || null; } catch (e) { /* tanpa harapan */ }
if (!fs.existsSync(file)) { console.error('File tidak ada: ' + file); process.exit(2); }

const rp = RabImport.rp;
const stat = fs.statSync(file);
const temuanFile = RabImport.cekFile({ nama: path.basename(file), ukuranByte: stat.size });
const wb = XLSX.readFile(file, { cellFormula: true });
const hasil = RabImport.parse(XLSX, wb);
const d = hasil.data;

function pad(s, n, kanan) { s = String(s); if (s.length > n) s = s.slice(0, n - 1) + '…'; return kanan ? s.padStart(n) : s.padEnd(n); }
function angkaRp(x) { return x === null || x === undefined ? '-' : rp(x).replace('Rp ', ''); }
const garis = '─'.repeat(150);

console.log('\nFILE   : ' + path.basename(file) + ' (' + (stat.size / 1024).toFixed(0) + ' KB)');
if (d) {
  console.log('PROYEK : ' + d.proyek.pekerjaan + ' | ' + d.proyek.owner + ' | ' + d.proyek.lokasi);
  console.log('ITEM   : ' + d.item.length + ' item (' + d.item.filter(i => !i.supply_owner).length + ' kontrak + ' + d.item.filter(i => i.supply_owner).length + ' supply-by-owner), ' + d.bab.length + ' bab');
  console.log('BARIS  : ' + d.hitungBaris.judul + ' judul sub-grup, ' + d.hitungBaris.spesifikasi + ' baris spesifikasi, ' + d.hitungBaris.tanpaHarga + ' item tanpa harga');

  console.log('\nREKAP PER BAB vs REKAPITULASI (toleransi Rp ' + RabImport.DEFAULT.toleransi + ')');
  console.log(garis);
  console.log(pad('Bab', 5) + pad('Nama', 38) + pad('Kategori', 11) + pad('Item', 5, true) + pad('Σ item kontrak', 18, true) + pad('REKAP kontrak', 18, true) + pad('Σ item final', 18, true) + pad('REKAP final', 18, true) + '  Status');
  console.log(garis);
  d.ringkasan.bab.forEach(b => {
    console.log(pad(b.kode, 5) + pad(b.nama, 38) + pad(b.supply ? 'Supply' : b.kategori, 11) + pad(b.jumlahItem, 5, true) +
      pad(angkaRp(b.itemKontrak), 18, true) + pad(angkaRp(b.rekapKontrak), 18, true) +
      pad(b.supply ? '(tidak dihitung)' : angkaRp(b.itemFinal), 18, true) + pad(b.supply ? '-' : angkaRp(b.rekapFinal), 18, true) +
      '  ' + (b.status === 'COCOK' ? '✓ cocok' : '✗ ' + b.status));
  });
  console.log(garis);
  console.log('\nPER KATEGORI');
  d.ringkasan.kategori.forEach(k => console.log('  ' + pad(k.kategori, 11) + ' kontrak ' + pad(angkaRp(k.itemKontrak), 16, true) + ' (REKAP ' + pad(angkaRp(k.rekapKontrak), 16, true) + ')   final ' + pad(angkaRp(k.itemFinal), 16, true) + ' (REKAP ' + pad(angkaRp(k.rekapFinal), 16, true) + ')'));
  const T = d.ringkasan.total;
  console.log('\nTOTAL');
  console.log('  Total sebelum overhead : kontrak ' + rp(T.kontrak) + '   final ' + rp(T.final));
  console.log('  Overhead ' + T.overheadPct + '%           : kontrak ' + rp(T.overheadKontrak) + '   final ' + rp(T.overheadFinal));
  console.log('  GRAND TOTAL            : kontrak ' + rp(T.grandKontrak) + '   final ' + rp(T.grandFinal));
  const bobot = d.item.reduce((s, i) => s + i.bobot_pct, 0);
  console.log('  Σ bobot (tanpa supply) : ' + bobot.toFixed(6) + ' %  (dasar ' + rp(d.dasarBobot) + ')');
  const st = {};
  d.item.forEach(i => { if (!i.supply_owner) st[i.status_cco] = (st[i.status_cco] || 0) + 1; });
  console.log('  Status CCO             : ' + Object.keys(st).map(k => k + ' ' + st[k]).join(', ') + '  → ' + d.cco.length + ' baris CCO awal');
  console.log('  Cara ukur              : volume ' + d.item.filter(i => i.cara_ukur === 'volume').length + ', persen (lumpsum) ' + d.item.filter(i => i.cara_ukur === 'persen').length);
}

const semua = temuanFile.concat(hasil.temuan);
console.log('\nTEMUAN: ' + hasil.jumlah.MERAH + ' merah, ' + hasil.jumlah.KUNING + ' kuning, ' + hasil.jumlah.INFO + ' info' + (hasil.fatal ? '  (FATAL — perbaiki file)' : ''));
console.log(garis);
semua.forEach(t => console.log((t.level === 'MERAH' ? '🔴' : t.level === 'KUNING' ? '🟡' : 'ℹ️ ') + ' ' + (t.id || '') + ' [' + t.kode + '] ' + t.pesan));
console.log(garis);
console.log('Boleh simpan tanpa konfirmasi : ' + RabImport.bolehSimpan(hasil, []));
console.log('Boleh simpan setelah konfirmasi semua MERAH : ' + RabImport.bolehSimpan(hasil, hasil.perluKonfirmasi));

// ---- Assertion terhadap nilai harapan (file lokal di luar repo) ----
if (harapan && d) {
  const cek = [];
  const harap = (nama, ok) => cek.push([nama, ok]);
  const H = harapan, T = d.ringkasan.total;
  if (H.bab) harap(H.bab + ' bab', d.bab.length === H.bab);
  if (H.grandKontrak) harap('Grand total kontrak ≈ ' + rp(H.grandKontrak), Math.abs(T.grandKontrak - H.grandKontrak) < 1);
  if (H.grandFinal) harap('Grand total final ≈ ' + rp(H.grandFinal), Math.abs(T.grandFinal - H.grandFinal) < 1);
  if (H.supply) harap('Bab ' + H.supply.bab + ' supply-by-owner = ' + rp(H.supply.nilai), Math.abs(d.ringkasan.bab.find(b => b.kode === H.supply.bab).itemKontrak - H.supply.nilai) < 1);
  harap('Σ bobot = 100%', Math.abs(d.item.reduce((s, i) => s + i.bobot_pct, 0) - 100) < 1e-6);
  (H.temuanBab || []).forEach((x) => harap('Temuan bab ' + x.bab + ' vs REKAP (selisih ' + rp(x.selisih) + ')', hasil.temuan.some(t => t.kode === 'REKAP_BAB' && t.bab === x.bab && Math.abs(Math.abs(t.selisihFinal) - x.selisih) < 1)));
  if (H.adaTanpaHarga) harap('Ada temuan item tanpa harga', hasil.temuan.some(t => t.kode === 'TANPA_HARGA'));
  harap('Bisa disimpan setelah konfirmasi', RabImport.bolehSimpan(hasil, hasil.perluKonfirmasi));
  console.log('\nASSERTION (' + path.basename(fileHarapan) + ')');
  cek.forEach(c => console.log('  ' + (c[1] ? 'LULUS' : 'GAGAL') + '  ' + c[0]));
  if (cek.some(c => !c[1])) process.exitCode = 1;
} else console.log('\n(Tidak ada nilai harapan untuk file ini — assertion dilewati.)');

// Simpan hasil lengkap untuk diperiksa (folder out/ tidak di-commit)
const out = path.join(__dirname, 'out');
try { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'rab-hasil.json'), JSON.stringify(hasil, null, 1)); console.log('\nHasil lengkap: tools/out/rab-hasil.json'); } catch (e) { /* abaikan */ }
