#!/usr/bin/env node
/*
 * Uji aturan validasi importer RAB dengan merusak salinan workbook contoh DI MEMORI.
 * File asli tidak diubah.   node tools/test-rab-aturan.js
 */
'use strict';
const path = require('path');
let XLSX;
try { XLSX = require('xlsx'); } catch (e) { XLSX = require(path.join(process.env.LOCALAPPDATA || '', 'mitrakonin-tools', 'node_modules', 'xlsx')); }
const R = require(path.join(__dirname, '..', 'app', 'js', 'rab-import.js'));
const folder = process.env.MITRAKONIN_SAMPLES || 'C:\\Users\\HP\\Downloads\\MITRAKONIN';
const fs = require('fs');
const file = process.argv[2] || fs.readdirSync(folder).filter((n) => /.xlsx$/i.test(n)).map((n) => path.join(folder, n))[0];

function baru() { return XLSX.readFile(file, { cellFormula: true }); }
function ada(h, kode, level) { return h.temuan.some(t => t.kode === kode && (!level || t.level === level)); }
const kasus = [];
function uji(nama, fn) { try { const ok = fn(); kasus.push([nama, !!ok]); } catch (e) { kasus.push([nama + ' (error: ' + e.message + ')', false]); } }

uji('File .xls ditolak', () => R.cekFile({ nama: 'rab.xls', ukuranByte: 1000 }).some(t => t.kode === 'FORMAT'));
uji('File > 10 MB ditolak', () => R.cekFile({ nama: 'rab.xlsx', ukuranByte: 11 * 1048576 }).some(t => t.kode === 'UKURAN'));
uji('Tanpa sheet REKAPITULASI → MERAH SHEET', () => {
  const wb = baru(); delete wb.Sheets['REKAPITULASI']; wb.SheetNames = wb.SheetNames.filter(n => n !== 'REKAPITULASI');
  return ada(R.parse(XLSX, wb), 'SHEET', 'MERAH');
});
uji('Tanpa sheet RAB → fatal, tidak bisa disimpan', () => {
  const wb = baru(); delete wb.Sheets['RAB']; wb.SheetNames = wb.SheetNames.filter(n => n !== 'RAB');
  const h = R.parse(XLSX, wb); return h.fatal && !R.bolehSimpan(h, h.perluKonfirmasi);
});
uji('Rumus tanpa hasil tersimpan → fatal', () => {
  const wb = baru(); const c = wb.Sheets['RAB']['H7']; wb.Sheets['RAB']['H7'] = { t: 'n', f: 'E7*G7' }; void c;
  const h = R.parse(XLSX, wb); return ada(h, 'RUMUS', 'MERAH') && h.fatal;
});
uji('Sel gabung di area item → MERAH MERGE', () => {
  const wb = baru(); wb.Sheets['RAB']['!merges'].push(XLSX.utils.decode_range('C8:C9'));
  return ada(R.parse(XLSX, wb), 'MERGE', 'MERAH');
});
uji('Angka disimpan sebagai teks → KUNING, tetap terbaca', () => {
  const wb = baru(); wb.Sheets['RAB']['G7'] = { t: 's', v: '2.500.000' };
  const h = R.parse(XLSX, wb); return ada(h, 'ANGKA_TEKS', 'KUNING') && h.data.item[0].harga_kontrak === 2500000;
});
uji('Volume × harga ≠ jumlah → KUNING', () => {
  const wb = baru(); wb.Sheets['RAB']['H8'] = { t: 'n', v: 9000000 };
  return ada(R.parse(XLSX, wb), 'HITUNG_ITEM', 'KUNING');
});
uji('Nilai negatif → MERAH', () => {
  const wb = baru(); wb.Sheets['RAB']['E9'] = { t: 'n', v: -1 };
  return ada(R.parse(XLSX, wb), 'NEGATIF', 'MERAH');
});
uji('Total bab berubah → MERAH REKAP_BAB untuk bab I', () => {
  const wb = baru(); wb.Sheets['REKAPITULASI']['D7'] = { t: 'n', v: 100000000 };
  return R.parse(XLSX, wb).temuan.some(t => t.kode === 'REKAP_BAB' && t.bab === 'I');
});
uji('Selisih < Rp 1.000 masih cocok (toleransi)', () => {
  const wb = baru(); wb.Sheets['REKAPITULASI']['D7'] = { t: 'n', v: wb.Sheets['REKAPITULASI']['D7'].v + 900 };
  return !R.parse(XLSX, wb).temuan.some(t => t.kode === 'REKAP_BAB' && t.bab === 'I');
});
uji('Konfirmasi sebagian MERAH belum boleh simpan', () => {
  const h = R.parse(XLSX, baru()); return h.perluKonfirmasi.length >= 2 && !R.bolehSimpan(h, h.perluKonfirmasi.slice(1));
});

kasus.forEach(k => console.log((k[1] ? 'LULUS ' : 'GAGAL ') + k[0]));
const gagal = kasus.filter(k => !k[1]).length;
console.log('\n' + (kasus.length - gagal) + '/' + kasus.length + ' lulus');
process.exitCode = gagal ? 1 : 0;
