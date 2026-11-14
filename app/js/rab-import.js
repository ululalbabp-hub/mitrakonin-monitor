/*
 * RAB IMPORT — parser + validasi file RAB format MITRAKONIN.
 * Dipakai di browser (window.RabImport) dan di Node (tools/test-rab.js).
 * Tidak bergantung pada versi SheetJS tertentu: objek XLSX diberikan oleh pemanggil.
 *
 * Hasil parse TIDAK menyimpan apa pun. Penyimpanan dilakukan Apps Script (Tahap 2)
 * setelah pengelola melihat pratinjau dan mengonfirmasi temuan MERAH.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RabImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT = {
    toleransi: 1000,        // Rp, selisih total yang masih dianggap cocok
    maksMB: 10,
    sheetRab: 'RAB',
    sheetRekap: 'REKAPITULASI',
    satuanLumpsum: ['ls', 'lumpsum', 'lump sum', 'lot', 'paket', 'pkt'],
  };

  // Syarat & ketentuan yang ditampilkan (wajib dicentang) sebelum upload.
  var SYARAT = [
    'File berformat .xlsx, maksimal 10 MB.',
    'Ada sheet bernama RAB dan REKAPITULASI.',
    'File disimpan dari Microsoft Excel agar hasil rumus ikut tersimpan.',
    'Tidak ada sel gabung (merged) di area item.',
    'Bab memakai angka Romawi (I, II, ... XIV); item memakai angka (1, 2, 3) atau tanda "-" untuk rincian.',
    'Baris Sub Total / Total / Grand Total dilewati (tidak dihitung sebagai item).',
    'Bab supply-by-owner dikeluarkan dari bobot.',
    'Total per bab dicocokkan dengan REKAPITULASI, toleransi Rp 1.000.',
    'Temuan MERAH wajib dikonfirmasi sebelum simpan.',
    'File asli diarsipkan ke folder Drive proyek.',
    'Baris judul kolom memuat NO., URAIAN, VOLUME, SAT., HARGA SATUAN, JUMLAH untuk blok RAB KONTRAK dan FINALISASI (blok KERJA TAMBAH/KURANG opsional).',
    'Angka diketik sebagai angka, bukan teks (mis. 1500000, bukan "1.500.000").',
    'Item bervolume wajib punya satuan dan harga satuan; volume dan harga tidak boleh negatif.',
    'Satu file untuk satu proyek. Setelah disimpan, RAB kontrak terkunci; perubahan berikutnya lewat CCO.',
    'Kolom PROGRESS di file diabaikan; progres dicatat lewat aplikasi.',
  ];

  // ---------- util ----------
  function teks(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function up(v) { return teks(v).toUpperCase(); }
  function bulat(x) { return Math.round((x || 0) * 100) / 100; }

  var RE_ROMAWI = /^(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
  function romawi(s) {
    s = up(s).replace(/\.$/, '');
    if (!s || !RE_ROMAWI.test(s)) return 0;
    var nilai = { I: 1, V: 5, X: 10, L: 50, C: 100 }, total = 0;
    for (var i = 0; i < s.length; i++) {
      var a = nilai[s[i]], b = nilai[s[i + 1]] || 0;
      total += a < b ? -a : a;
    }
    return total;
  }

  // Angka dari sel. {n: number|null, teks: true jika angka disimpan sebagai teks}
  function angka(v) {
    if (v === null || v === undefined || v === '') return { n: null };
    if (typeof v === 'number') return { n: isFinite(v) ? v : null };
    var s = teks(v);
    if (s === '-' || s === '') return { n: null };
    var t = s.replace(/^rp\.?\s*/i, '');
    if (/^-?[\d.]+(,\d+)?$/.test(t) && /\d/.test(t)) {
      // format Indonesia: titik ribuan, koma desimal
      var x = Number(t.replace(/\./g, '').replace(',', '.'));
      if (isFinite(x)) return { n: x, teks: true };
    }
    if (/^-?\d+(\.\d+)?$/.test(t)) return { n: Number(t), teks: true };
    return { n: null };
  }

  function kategoriDari(s) {
    s = up(s);
    if (!s) return null;
    if (/BARU/.test(s)) return 'Item Baru';
    if (/STRUKTUR/.test(s)) return 'Struktur';
    if (/ARSITEK/.test(s)) return 'Arsitektur';
    if (/\bMEP\b|M\s*&\s*E|MEKANIKAL|ELEKTRIKAL/.test(s)) return 'MEP';
    if (/LAIN/.test(s)) return 'Lain-lain';
    return null;
  }
  function supplyOwner(nama) { return /SUPPLY\s*BY|SUPLAI\s*OLEH|BY\s*OWNER|OLEH\s*OWNER|DISEDIAKAN\s*OWNER/.test(up(nama)); }

  function kolomHuruf(XLSX, c) { return XLSX.utils.encode_col(c); }

  function Temuan() { this.daftar = []; }
  Temuan.prototype.tambah = function (level, kode, pesan, extra) {
    var t = { level: level, kode: kode, pesan: pesan };
    if (extra) for (var k in extra) t[k] = extra[k];
    this.daftar.push(t);
    return t;
  };

  // ---------- cek file (sebelum dibaca) ----------
  function cekFile(info, opsi) {
    opsi = gabung(opsi);
    var t = new Temuan();
    var nama = (info && info.nama) || '';
    if (!/\.xlsx$/i.test(nama)) t.tambah('MERAH', 'FORMAT', 'File harus .xlsx (didapat: ' + (nama || '?') + ').');
    if (info && info.ukuranByte > opsi.maksMB * 1024 * 1024)
      t.tambah('MERAH', 'UKURAN', 'Ukuran file ' + (info.ukuranByte / 1048576).toFixed(1) + ' MB melebihi batas ' + opsi.maksMB + ' MB.');
    return t.daftar;
  }

  function gabung(opsi) {
    var o = {};
    for (var k in DEFAULT) o[k] = DEFAULT[k];
    if (opsi) for (var j in opsi) if (opsi[j] !== undefined) o[j] = opsi[j];
    return o;
  }

  // Cari sheet tanpa peduli huruf besar/kecil dan spasi.
  function cariSheet(wb, nama) {
    var target = up(nama).replace(/\s/g, '');
    for (var i = 0; i < wb.SheetNames.length; i++)
      if (up(wb.SheetNames[i]).replace(/\s/g, '') === target) return wb.SheetNames[i];
    return null;
  }

  function bacaGrid(XLSX, ws) {
    var range = XLSX.utils.decode_range(ws['!ref']);
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    return { rows: rows, r0: range.s.r, c0: range.s.c };
  }

  // Cari baris judul kolom (berisi NO. dan URAIAN) dan blok kolom di atasnya.
  function petaKolom(XLSX, grid, t, namaSheet) {
    var rows = grid.rows, h = -1;
    for (var i = 0; i < Math.min(rows.length, 30); i++) {
      var r = rows[i] || [], adaNo = false, adaUraian = false;
      for (var c = 0; c < r.length; c++) {
        var s = up(r[c]);
        if (s === 'NO' || s === 'NO.') adaNo = true;
        if (/URAIAN/.test(s)) adaUraian = true;
      }
      if (adaNo && adaUraian) { h = i; break; }
    }
    if (h < 0) { t.tambah('MERAH', 'HEADER', 'Sheet ' + namaSheet + ': baris judul kolom (NO. / URAIAN) tidak ditemukan.'); return null; }
    var hdr = rows[h] || [];
    var peta = { barisHeader: h, no: -1, uraian: -1, spesifikasi: -1, keterangan: -1, blok: {} };
    for (var c2 = 0; c2 < hdr.length; c2++) {
      var s2 = up(hdr[c2]);
      if ((s2 === 'NO' || s2 === 'NO.') && peta.no < 0) peta.no = c2;
      else if (/URAIAN/.test(s2) && peta.uraian < 0) peta.uraian = c2;
      else if (/SPESIFIKASI|MERK|MEREK/.test(s2) && peta.spesifikasi < 0) peta.spesifikasi = c2;
    }
    // Label blok di 1-4 baris di atas header
    var label = { kontrak: /RAB\s*KONTRAK|^KONTRAK$/, kt: /KERJA\s*TAMBAH|TAMBAH\s*\/?\s*KURANG/, final: /FINALISASI|^FINAL$/, keterangan: /^KETERANGAN$/, progres: /^PROGRES/ };
    for (var a = Math.max(0, h - 4); a < h; a++) {
      var ra = rows[a] || [];
      for (var c3 = 0; c3 < ra.length; c3++) {
        var s3 = up(ra[c3]);
        for (var key in label) if (label[key].test(s3) && peta.blok[key] === undefined) peta.blok[key] = c3;
      }
    }
    // Kolom keterangan bisa juga ada di baris header
    if (peta.blok.keterangan !== undefined) peta.keterangan = peta.blok.keterangan;
    else for (var c4 = 0; c4 < hdr.length; c4++) if (/KETERANGAN/.test(up(hdr[c4]))) peta.keterangan = c4;

    function blokKolom(start, akhir) {
      var b = { vol: -1, sat: -1, harga: -1, jumlah: -1 };
      for (var c = start; c < Math.min(hdr.length, akhir); c++) {
        var s = up(hdr[c]);
        if (b.vol < 0 && /VOLUME|^VOL\.?$/.test(s)) b.vol = c;
        else if (b.sat < 0 && /^SAT|SATUAN$/.test(s) && !/HARGA/.test(s)) b.sat = c;
        else if (b.harga < 0 && /HARGA/.test(s)) b.harga = c;
        else if (b.jumlah < 0 && /JUMLAH|TOTAL/.test(s)) b.jumlah = c;
        if (b.jumlah >= 0) break;
      }
      return b;
    }
    var mulai = [];
    ['kontrak', 'kt', 'final', 'progres', 'keterangan'].forEach(function (k) { if (peta.blok[k] !== undefined) mulai.push(peta.blok[k]); });
    mulai.sort(function (x, y) { return x - y; });
    function batas(start) { for (var i = 0; i < mulai.length; i++) if (mulai[i] > start) return mulai[i]; return hdr.length; }

    // Tanpa label blok: anggap blok pertama setelah URAIAN adalah kontrak
    if (peta.blok.kontrak === undefined) peta.blok.kontrak = peta.uraian + 1;
    peta.kontrak = blokKolom(peta.blok.kontrak, batas(peta.blok.kontrak));
    if (peta.blok.kt !== undefined) peta.kt = blokKolom(peta.blok.kt, batas(peta.blok.kt));
    if (peta.blok.final !== undefined) peta.final = blokKolom(peta.blok.final, batas(peta.blok.final));

    var kurang = [];
    if (peta.no < 0) kurang.push('NO.');
    if (peta.uraian < 0) kurang.push('URAIAN');
    ['vol', 'sat', 'harga', 'jumlah'].forEach(function (k) { if (peta.kontrak[k] < 0) kurang.push('RAB KONTRAK/' + k.toUpperCase()); });
    if (!peta.final) kurang.push('blok FINALISASI');
    else ['vol', 'sat', 'harga', 'jumlah'].forEach(function (k) { if (peta.final[k] < 0) kurang.push('FINALISASI/' + k.toUpperCase()); });
    if (kurang.length) t.tambah('MERAH', 'HEADER', 'Sheet ' + namaSheet + ': kolom tidak ditemukan: ' + kurang.join(', ') + '.');
    if (!peta.kt) t.tambah('INFO', 'TANPA_KT', 'Blok KERJA TAMBAH/KURANG tidak ada; perubahan dihitung dari selisih FINALISASI − KONTRAK.');
    if (peta.blok.progres !== undefined) t.tambah('INFO', 'PROGRES_DIABAIKAN', 'Kolom PROGRESS di file diabaikan; progres dicatat lewat aplikasi.');
    return kurang.length ? null : peta;
  }

  // ---------- REKAPITULASI ----------
  function parseRekap(XLSX, wb, namaSheet, t) {
    var ws = wb.Sheets[namaSheet], grid = bacaGrid(XLSX, ws), rows = grid.rows;
    var h = -1;
    for (var i = 0; i < Math.min(rows.length, 30); i++) {
      var s = (rows[i] || []).map(up).join('|');
      if (/\bNO\.?\|/.test(s + '|') && /URAIAN/.test(s)) { h = i; break; }
    }
    if (h < 0) { t.tambah('MERAH', 'REKAP_HEADER', 'Sheet REKAPITULASI: baris judul (NO. / URAIAN) tidak ditemukan.'); return null; }
    var hdr = rows[h], cNo = -1, cUr = -1, cK = -1, cF = -1;
    for (var c = 0; c < hdr.length; c++) {
      var x = up(hdr[c]);
      if ((x === 'NO' || x === 'NO.') && cNo < 0) cNo = c;
      if (/URAIAN/.test(x) && cUr < 0) cUr = c;
    }
    for (var a = Math.max(0, h - 3); a <= h; a++) {
      var ra = rows[a] || [];
      for (var c2 = 0; c2 < ra.length; c2++) {
        var y = up(ra[c2]);
        if (/KONTRAK/.test(y) && cK < 0) cK = c2;
        if (/FINAL/.test(y) && cF < 0) cF = c2;
      }
    }
    if (cK < 0 || cF < 0) { t.tambah('MERAH', 'REKAP_HEADER', 'Sheet REKAPITULASI: kolom RAB KONTRAK / FINALISASI tidak ditemukan.'); return null; }

    var hasil = { bab: {}, urutanBab: [], seksi: [], total: null, overhead: null, jumlahTotal: null, supply: { kontrak: 0, final: 0 } };
    var seksi = null, sesudahTotal = false, babSupply = null;
    for (var r = h + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var no = teks(row[cNo]), ur = teks(row[cUr]);
      var semua = row.map(up).join(' ');
      var k = angka(row[cK]).n, f = angka(row[cF]).n;
      var baris = r + grid.r0 + 1;
      if (/OVER\s*HEAD/.test(semua)) { hasil.overhead = { kontrak: k, final: f, baris: baris }; continue; }
      if (/JUMLAH\s*TOTAL|SETELAH\s*OVER/.test(semua)) { hasil.jumlahTotal = { kontrak: k, final: f, baris: baris }; sesudahTotal = true; continue; }
      if (/GRAND\s*TOTAL/.test(semua)) { if (seksi) { seksi.grand = { kontrak: k || 0, final: f || 0, baris: baris }; } continue; }
      if (/(^|\s)TOTAL(\s|$)/.test(semua) && !romawi(no)) {
        if (!sesudahTotal && !hasil.total) hasil.total = { kontrak: k, final: f, baris: baris };
        else if (babSupply) babSupply.totalBaris = { kontrak: k, final: f, baris: baris };
        continue;
      }
      var nb = romawi(no);
      if (nb) {
        var sup = supplyOwner(ur) || sesudahTotal;
        var b = { kode: up(no), nama: ur, kontrak: k || 0, final: f || 0, seksi: sup ? null : (seksi && seksi.kategori), supply: sup, baris: baris, rincian: [] };
        hasil.bab[b.kode] = b; hasil.urutanBab.push(b.kode);
        if (seksi && !sup) seksi.bab.push(b.kode);
        if (sup) babSupply = b;
        continue;
      }
      if (babSupply && no && (k !== null || f !== null)) { babSupply.rincian.push({ no: no, nama: ur, kontrak: k || 0, final: f || 0 }); continue; }
      var teksSeksi = ur || no;
      if (teksSeksi && k === null && f === null && !sesudahTotal) {
        var kat = kategoriDari(teksSeksi);
        if (kat) { seksi = { nama: teksSeksi, kategori: kat, bab: [], grand: null }; hasil.seksi.push(seksi); }
      }
    }
    // Bab supply: nilai ada di rincian, bukan di baris bab
    if (babSupply && !babSupply.kontrak && babSupply.rincian.length)
      babSupply.kontrak = bulat(babSupply.rincian.reduce(function (s, x) { return s + x.kontrak; }, 0));
    return hasil;
  }

  // ---------- RAB ----------
  function parse(XLSX, wb, opsi) {
    opsi = gabung(opsi);
    var t = new Temuan();
    var namaRab = cariSheet(wb, opsi.sheetRab), namaRekap = cariSheet(wb, opsi.sheetRekap);
    if (!namaRab) t.tambah('MERAH', 'SHEET', 'Sheet "RAB" tidak ada. Sheet yang ada: ' + wb.SheetNames.join(', ') + '.');
    if (!namaRekap) t.tambah('MERAH', 'SHEET', 'Sheet "REKAPITULASI" tidak ada.');
    if (!namaRab) return selesai(t, null);

    var ws = wb.Sheets[namaRab];
    cekRumus(XLSX, wb, [namaRab, namaRekap], t);

    var grid = bacaGrid(XLSX, ws), rows = grid.rows;
    var peta = petaKolom(XLSX, grid, t, namaRab);
    if (!peta) return selesai(t, null);

    var proyek = infoProyek(rows);
    function sel(row, c) { return c >= 0 ? row[c] : null; }
    function nilaiBlok(row, b, barisExcel, labelBlok) {
      if (!b) return { vol: null, sat: '', harga: null, jumlah: null };
      var o = {};
      ['vol', 'harga', 'jumlah'].forEach(function (k) {
        var a = angka(sel(row, b[k]));
        if (a.teks) t.tambah('KUNING', 'ANGKA_TEKS', 'Angka disimpan sebagai teks: ' + kolomHuruf(XLSX, b[k] + grid.c0) + barisExcel + ' (' + labelBlok + ').', { baris: barisExcel });
        o[k] = a.n;
      });
      o.sat = teks(sel(row, b.sat));
      if (typeof sel(row, b.sat) === 'number') o.sat = ''; // angka di kolom satuan = bukan satuan
      return o;
    }

    // Tahap 1: klasifikasi tiap baris
    var baris = [], bab = null, babList = [], setelahGrandOverhead = false;
    for (var i = peta.barisHeader + 1; i < rows.length; i++) {
      var row = rows[i] || [], bx = i + grid.r0 + 1;
      var no = teks(sel(row, peta.no)), ur = teks(sel(row, peta.uraian));
      var semua = row.map(up).join(' ').trim();
      if (!semua) continue;
      // Baris "Total Pekerjaan X | Sub Total" = total kelompok (sudah tercakup sub total di atasnya)
      var totalLain = row.some(function (v) { var s = up(v); return /TOTAL/.test(s) && !/^SUB\s*-?\s*TOTAL$/.test(s); });
      if (/SUB\s*-?\s*TOTAL/.test(semua) && !totalLain) {
        baris.push({ tipe: 'SUBTOTAL', baris: bx, bab: bab,
          kontrak: angka(sel(row, peta.kontrak.jumlah)).n, final: peta.final ? angka(sel(row, peta.final.jumlah)).n : null });
        continue;
      }
      if (/OVER\s*HEAD/.test(semua) && !/SETELAH/.test(semua)) {
        var m = semua.match(/(\d+(?:[.,]\d+)?)\s*%/);
        baris.push({ tipe: 'OVERHEAD', baris: bx, pct: m ? Number(m[1].replace(',', '.')) : null,
          kontrak: angka(sel(row, peta.kontrak.jumlah)).n, final: peta.final ? angka(sel(row, peta.final.jumlah)).n : null });
        continue;
      }
      if (/GRAND\s*TOTAL/.test(semua)) {
        var setelahOH = /SETELAH|OVER\s*HEAD/.test(semua);
        baris.push({ tipe: setelahOH ? 'GRAND_OH' : 'GRAND', baris: bx, bab: bab, label: semua,
          kontrak: angka(sel(row, peta.kontrak.jumlah)).n, final: peta.final ? angka(sel(row, peta.final.jumlah)).n : null });
        if (setelahOH) setelahGrandOverhead = true;
        continue;
      }
      if (/(^|\s)TOTAL(\s|$)/.test(semua) && !romawi(no)) {
        var exact = row.some(function (v) { return up(v) === 'TOTAL'; });
        baris.push({ tipe: exact ? 'TOTAL' : 'TOTAL_KELOMPOK', baris: bx, bab: bab,
          kontrak: angka(sel(row, peta.kontrak.jumlah)).n, final: peta.final ? angka(sel(row, peta.final.jumlah)).n : null });
        continue;
      }
      if (romawi(no) && ur) {
        bab = { kode: up(no), nama: ur, baris: bx, supply: supplyOwner(ur) || setelahGrandOverhead, item: [], subtotal: { kontrak: 0, final: 0, ada: false } };
        babList.push(bab);
        baris.push({ tipe: 'BAB', baris: bx, bab: bab });
        continue;
      }
      if (!ur) {
        // ada angka tanpa uraian (mis. sel bantu di luar tabel)
        continue;
      }
      if (!bab) { t.tambah('KUNING', 'DI_LUAR_BAB', 'Baris ' + bx + ' ("' + ur.slice(0, 40) + '") berada sebelum bab pertama, dilewati.', { baris: bx }); continue; }
      var k = nilaiBlok(row, peta.kontrak, bx, 'kontrak'), kt = nilaiBlok(row, peta.kt, bx, 'kerja tambah/kurang'), f = nilaiBlok(row, peta.final, bx, 'finalisasi');
      var adaAngka = [k.vol, k.harga, k.jumlah, f.vol, f.harga, f.jumlah, kt.vol, kt.harga, kt.jumlah].some(function (v) { return v !== null && v !== 0; });
      var jenisNo = /^\d+([.,]\d+)*\.?$/.test(no) ? 'angka' : (/^[-–—•]$/.test(no) ? 'strip' : (no ? 'lain' : 'kosong'));
      baris.push({ tipe: adaAngka ? 'ITEM' : 'KANDIDAT', baris: bx, bab: bab, no: no, jenisNo: jenisNo, uraian: ur,
        spesifikasi: teks(sel(row, peta.spesifikasi)), keterangan: teks(sel(row, peta.keterangan)), k: k, kt: kt, f: f });
    }

    // Tahap 2: tentukan KANDIDAT = judul sub-grup / baris spesifikasi / item tanpa harga
    var hitung = { judul: 0, spesifikasi: 0, tanpaHarga: 0 };
    for (var j = 0; j < baris.length; j++) {
      var b = baris[j];
      if (b.tipe !== 'KANDIDAT') continue;
      var sesudah = baris[j + 1];
      var sesudahItem = sesudah && sesudah.bab === b.bab && (sesudah.tipe === 'ITEM' || sesudah.tipe === 'KANDIDAT');
      if (b.jenisNo === 'kosong' || b.jenisNo === 'lain') { b.tipe = 'JUDUL'; hitung.judul++; }
      else if (b.jenisNo === 'strip') {
        var induk = cariIndukSpek(baris, j);
        if (induk) { b.tipe = 'SPEK'; b.induk = induk; hitung.spesifikasi++; }
        else if (sesudahItem) { b.tipe = 'JUDUL'; hitung.judul++; }
        else { b.tipe = 'TANPA_HARGA'; hitung.tanpaHarga++; }
      } else { // bernomor angka
        if (sesudahItem) { b.tipe = 'JUDUL'; hitung.judul++; }
        else { b.tipe = 'TANPA_HARGA'; hitung.tanpaHarga++; }
      }
    }
    function cariIndukSpek(arr, idx) {
      for (var q = idx - 1; q >= 0; q--) {
        var p = arr[q];
        if (p.bab !== arr[idx].bab) return null;
        if (p.tipe === 'SPEK') continue;
        if (p.tipe === 'ITEM' || p.tipe === 'TANPA_HARGA') return p;
        return null;
      }
      return null;
    }

    // Tahap 3: bentuk item
    var items = [], urutan = 0, judul1 = null, judul2 = null, babAktif = null, nomorAnak = {};
    for (var z = 0; z < baris.length; z++) {
      var x = baris[z];
      if (x.bab !== babAktif) { babAktif = x.bab; judul1 = null; judul2 = null; nomorAnak = {}; }
      if (x.tipe === 'SUBTOTAL' && x.bab) {
        x.bab.subtotal.ada = true;
        x.bab.subtotal.kontrak += x.kontrak || 0;
        x.bab.subtotal.final += x.final || 0;
        continue;
      }
      if (x.tipe === 'JUDUL') {
        if (x.jenisNo === 'angka' || x.jenisNo === 'strip') { judul1 = x; judul2 = null; }
        else if (judul1 && judul1.jenisNo !== 'kosong') judul2 = x;
        else { judul1 = x; judul2 = null; }
        continue;
      }
      if (x.tipe === 'SPEK') {
        var it = x.induk.item;
        if (it) it.spesifikasi = [it.spesifikasi, x.uraian].filter(Boolean).join('; ');
        continue;
      }
      if (x.tipe !== 'ITEM' && x.tipe !== 'TANPA_HARGA') continue;

      var sub = [judul1 && judul1.uraian, judul2 && judul2.uraian].filter(Boolean).join(' › ');
      var noItem = x.no;
      if (x.jenisNo === 'strip') {
        var dasar = judul1 && judul1.jenisNo === 'angka' ? judul1.no : (cariNoSebelum(items, x.bab) || '0');
        nomorAnak[dasar] = (nomorAnak[dasar] || 0) + 1;
        noItem = dasar + '.' + nomorAnak[dasar];
      }
      var jk = x.k.jumlah !== null ? x.k.jumlah : (x.k.vol !== null && x.k.harga !== null ? x.k.vol * x.k.harga : 0);
      var jf = x.f.jumlah !== null ? x.f.jumlah : (x.f.vol !== null && x.f.harga !== null ? x.f.vol * x.f.harga : 0);
      var finalKosong = x.f.vol === null && x.f.harga === null && x.f.jumlah === null;
      var item = {
        item_id: x.bab.kode + '-' + String(urutan + 1).padStart(3, '0'),
        proyek_id: '',
        kategori: '',
        bab_kode: x.bab.kode,
        bab_nama: x.bab.nama,
        no_item: noItem,
        uraian: x.uraian,
        spesifikasi: x.spesifikasi,
        satuan: x.f.sat || x.k.sat || x.kt.sat || '',
        vol_kontrak: x.k.vol || 0,
        harga_kontrak: x.k.harga || 0,
        jumlah_kontrak: bulat(jk),
        vol_final: finalKosong ? 0 : (x.f.vol || 0),
        harga_final: finalKosong ? 0 : (x.f.harga || 0),
        jumlah_final: finalKosong ? 0 : bulat(jf),
        status_cco: '',
        bobot_pct: 0,
        cara_ukur: '',
        urutan: ++urutan,
        // tambahan (tidak semua masuk kolom Sheet)
        sub_grup: sub,
        supply_owner: x.bab.supply,
        baris_excel: x.baris,
        keterangan_file: x.keterangan,
        kt_vol: x.kt.vol, kt_harga: x.kt.harga, kt_jumlah: x.kt.jumlah,
        tanpa_harga: x.tipe === 'TANPA_HARGA',
      };
      // supply-by-owner: tidak ada kolom final di file -> nilai final = 0, tetap dicatat
      item.status_cco = statusCco(item);
      item.cara_ukur = opsi.satuanLumpsum.indexOf(item.satuan.toLowerCase().replace(/\.$/, '')) >= 0 ? 'persen' : 'volume';
      x.item = item;
      x.bab.item.push(item);
      items.push(item);
      cekItem(item, x, t, opsi);
    }
    function cariNoSebelum(arr, babX) {
      for (var q = arr.length - 1; q >= 0; q--) if (arr[q].bab_kode === babX.kode && /^\d+$/.test(arr[q].no_item)) return arr[q].no_item;
      return null;
    }

    if (hitung.spesifikasi) t.tambah('INFO', 'SPEK_DIGABUNG', hitung.spesifikasi + ' baris rincian spesifikasi ("- ..." tanpa angka) digabung ke kolom spesifikasi item di atasnya.');
    if (hitung.judul) t.tambah('INFO', 'JUDUL_SUBGRUP', hitung.judul + ' baris judul sub-grup (mis. "PEKERJAAN LANTAI 1") dicatat sebagai sub_grup item, bukan item.');

    // Kategori & supply
    var rekap = namaRekap ? parseRekap(XLSX, wb, namaRekap, t) : null;
    tentukanKategori(babList, baris, rekap);
    items.forEach(function (it) { var bb = babList.filter(function (q) { return q.kode === it.bab_kode; })[0]; it.kategori = bb.kategori; });

    // Bobot (tanpa supply-by-owner)
    var dasarBobot = items.reduce(function (s, it) { return s + (it.supply_owner ? 0 : it.jumlah_final); }, 0);
    items.forEach(function (it) { it.bobot_pct = it.supply_owner || !dasarBobot ? 0 : it.jumlah_final / dasarBobot * 100; });

    var ringkasan = cekTotal(babList, baris, rekap, items, t, opsi);
    cekNomorGanda(items, t);
    cekUrutanBab(babList, t);
    cekMerge(XLSX, ws, baris, peta, grid, t);

    var cco = items.filter(function (it) { return it.status_cco !== 'Tetap' && !it.supply_owner; }).map(function (it) {
      return {
        item_id: it.item_id, jenis: it.status_cco, vol_lama: it.vol_kontrak, vol_baru: it.vol_final,
        harga: it.harga_final || it.harga_kontrak, selisih_nilai: bulat(it.jumlah_final - it.jumlah_kontrak),
        alasan: it.keterangan_file || 'Dari file RAB (kolom Kerja Tambah/Kurang)',
      };
    });

    if (rekap && proyek) proyek.overhead_pct = ringkasan.overheadPct;
    return selesai(t, { proyek: proyek, bab: babList.map(ringkasBab), item: items, cco: cco, rekap: rekap, ringkasan: ringkasan, hitungBaris: hitung, dasarBobot: bulat(dasarBobot) });
  }

  function statusCco(it) {
    var K = it.jumlah_kontrak, F = it.jumlah_final;
    if (it.supply_owner) return 'Tetap';
    if (!K && F) return 'Baru';
    if (Math.abs(F - K) < 1 && Math.abs(it.vol_final - it.vol_kontrak) < 1e-9) return 'Tetap';
    if (F > K) return 'Tambah';
    if (F < K) return 'Kurang';
    return 'Tetap';
  }

  function cekItem(it, x, t, opsi) {
    var tol = opsi.toleransi, bx = x.baris, lbl = 'Baris ' + bx + ' [' + it.bab_kode + ' ' + it.no_item + '] ' + it.uraian.slice(0, 45);
    if (it.tanpa_harga) {
      t.tambah('MERAH', 'TANPA_HARGA', lbl + ': item tanpa volume dan harga.', { baris: bx, bab: it.bab_kode });
      return;
    }
    [['kontrak', x.k], ['finalisasi', x.f], ['kerja tambah/kurang', x.kt]].forEach(function (p) {
      var b = p[1];
      if ([b.vol, b.harga, b.jumlah].some(function (v) { return v !== null && v < 0; }))
        t.tambah('MERAH', 'NEGATIF', lbl + ': nilai negatif di blok ' + p[0] + '.', { baris: bx, bab: it.bab_kode });
      if (b.vol && b.harga === null && !it.supply_owner) t.tambah('MERAH', 'TANPA_HARGA', lbl + ': volume ' + p[0] + ' ada tetapi harga satuan kosong.', { baris: bx, bab: it.bab_kode });
      if (b.vol !== null && b.harga !== null && b.jumlah !== null && Math.abs(b.vol * b.harga - b.jumlah) > tol)
        t.tambah('KUNING', 'HITUNG_ITEM', lbl + ': volume × harga (' + rp(b.vol * b.harga) + ') ≠ jumlah (' + rp(b.jumlah) + ') di blok ' + p[0] + '.', { baris: bx, bab: it.bab_kode });
    });
    if ((it.vol_kontrak || it.vol_final) && !it.satuan) t.tambah('KUNING', 'TANPA_SATUAN', lbl + ': satuan kosong.', { baris: bx, bab: it.bab_kode });
    // konsistensi keterangan (+)/(−) dengan arah perubahan
    var ket = it.keterangan_file, d = it.jumlah_final - it.jumlah_kontrak;
    if (/\(\s*\+\s*\)/.test(ket) && d < -tol) t.tambah('KUNING', 'ARAH_CCO', lbl + ': keterangan "' + ket + '" tetapi nilai final turun ' + rp(d) + '.', { baris: bx, bab: it.bab_kode });
    if (/\(\s*[-–]\s*\)/.test(ket) && d > tol) t.tambah('KUNING', 'ARAH_CCO', lbl + ': keterangan "' + ket + '" tetapi nilai final naik ' + rp(d) + '.', { baris: bx, bab: it.bab_kode });
    if (x.kt.jumlah && Math.abs(Math.abs(d) - Math.abs(x.kt.jumlah)) > tol)
      t.tambah('KUNING', 'KT_SELISIH', lbl + ': nilai kolom Kerja Tambah/Kurang ' + rp(x.kt.jumlah) + ' ≠ selisih final−kontrak ' + rp(d) + '. Yang dipakai: selisih final−kontrak.', { baris: bx, bab: it.bab_kode });
  }

  function tentukanKategori(babList, baris, rekap) {
    // 1) dari seksi REKAPITULASI, 2) dari baris GRAND TOTAL <kategori> di RAB, 3) nama bab
    var dariGrand = {}, tunggu = [];
    baris.forEach(function (b) {
      if (b.tipe === 'BAB') tunggu.push(b.bab);
      if (b.tipe === 'GRAND') { var k = kategoriDari(b.label); tunggu.forEach(function (q) { if (k && !dariGrand[q.kode]) dariGrand[q.kode] = k; }); tunggu = []; }
    });
    babList.forEach(function (b) {
      var r = rekap && rekap.bab[b.kode];
      if (r && r.supply) b.supply = true;
      b.kategori = kategoriDari(b.nama) === 'Item Baru' ? 'Item Baru' : ((r && r.seksi) || dariGrand[b.kode] || kategoriDari(b.nama) || 'Lain-lain');
      if (b.supply) b.kategori = 'Lain-lain';
    });
  }

  function cekTotal(babList, baris, rekap, items, t, opsi) {
    var tol = opsi.toleransi;
    var rk = { bab: [], kategori: [], total: {} };
    babList.forEach(function (b) {
      var sk = bulat(b.item.reduce(function (s, it) { return s + it.jumlah_kontrak; }, 0));
      var sf = bulat(b.item.reduce(function (s, it) { return s + it.jumlah_final; }, 0));
      var r = rekap && rekap.bab[b.kode];
      var baru = { kode: b.kode, nama: b.nama, kategori: b.kategori, supply: b.supply, jumlahItem: b.item.length,
        itemKontrak: sk, itemFinal: sf, subtotalKontrak: b.subtotal.ada ? bulat(b.subtotal.kontrak) : null, subtotalFinal: b.subtotal.ada ? bulat(b.subtotal.final) : null,
        rekapKontrak: r ? r.kontrak : null, rekapFinal: r ? (b.supply ? null : r.final) : null, status: 'COCOK' };
      if (b.subtotal.ada) {
        if (Math.abs(sk - b.subtotal.kontrak) > tol) t.tambah('KUNING', 'SUBTOTAL', 'Bab ' + b.kode + ': Σ item kontrak ' + rp(sk) + ' ≠ Σ Sub Total di sheet RAB ' + rp(b.subtotal.kontrak) + '.', { bab: b.kode });
        if (!b.supply && Math.abs(sf - b.subtotal.final) > tol) t.tambah('KUNING', 'SUBTOTAL', 'Bab ' + b.kode + ': Σ item final ' + rp(sf) + ' ≠ Σ Sub Total di sheet RAB ' + rp(b.subtotal.final) + '.', { bab: b.kode });
      }
      if (rekap) {
        if (!r) { baru.status = 'TIDAK ADA DI REKAP'; t.tambah('MERAH', 'REKAP_BAB', 'Bab ' + b.kode + ' (' + b.nama + ') ada di RAB tetapi tidak ada di REKAPITULASI.', { bab: b.kode }); }
        else {
          var dk = sk - r.kontrak, df = b.supply ? 0 : sf - r.final;
          if (Math.abs(dk) > tol || Math.abs(df) > tol) {
            baru.status = 'BEDA';
            var seksi = rekap.seksi.filter(function (s) { return s.bab.indexOf(b.kode) >= 0; })[0];
            var tambahan = '';
            if (seksi && seksi.grand && seksi.bab.length === 1 && Math.abs(seksi.grand.final - sf) <= tol)
              tambahan = ' Catatan: GRAND TOTAL ' + seksi.nama + ' di REKAPITULASI = ' + rp(seksi.grand.final) + ' (sama dengan Σ item), jadi REKAPITULASI tidak konsisten di dalam dirinya sendiri.';
            var bagian = [];
            if (Math.abs(dk) > tol) bagian.push('kontrak: Σ item ' + rp(sk) + ' vs REKAP ' + rp(r.kontrak) + ' (selisih ' + rp(dk) + ')');
            if (Math.abs(df) > tol) bagian.push('final: Σ item ' + rp(sf) + ' vs REKAP ' + rp(r.final) + ' (selisih ' + rp(df) + ')');
            t.tambah('MERAH', 'REKAP_BAB', 'Bab ' + b.kode + ' ' + b.nama + ' — ' + bagian.join('; ') + '.' + tambahan + ' Usulan: pakai Σ item dari sheet RAB.', { bab: b.kode, selisihKontrak: bulat(dk), selisihFinal: bulat(df) });
          }
        }
      }
      rk.bab.push(baru);
    });
    if (rekap) rekap.urutanBab.forEach(function (kode) {
      if (!babList.some(function (b) { return b.kode === kode; }))
        t.tambah('MERAH', 'REKAP_BAB', 'Bab ' + kode + ' ada di REKAPITULASI tetapi tidak ditemukan di sheet RAB.', { bab: kode });
    });
    // per kategori
    var kat = {};
    babList.forEach(function (b) {
      if (b.supply) return;
      var x = kat[b.kategori] || (kat[b.kategori] = { kategori: b.kategori, itemKontrak: 0, itemFinal: 0, rekapKontrak: null, rekapFinal: null });
      x.itemKontrak += b.item.reduce(function (s, it) { return s + it.jumlah_kontrak; }, 0);
      x.itemFinal += b.item.reduce(function (s, it) { return s + it.jumlah_final; }, 0);
    });
    if (rekap) rekap.seksi.forEach(function (s) { if (kat[s.kategori] && s.grand) { kat[s.kategori].rekapKontrak = s.grand.kontrak; kat[s.kategori].rekapFinal = s.grand.final; } });
    for (var key in kat) {
      var v = kat[key]; v.itemKontrak = bulat(v.itemKontrak); v.itemFinal = bulat(v.itemFinal);
      if (v.rekapKontrak !== null && (Math.abs(v.itemKontrak - v.rekapKontrak) > tol || Math.abs(v.itemFinal - v.rekapFinal) > tol))
        t.tambah('MERAH', 'REKAP_KATEGORI', 'Kategori ' + key + ': Σ item (kontrak ' + rp(v.itemKontrak) + ', final ' + rp(v.itemFinal) + ') ≠ GRAND TOTAL di REKAPITULASI (kontrak ' + rp(v.rekapKontrak) + ', final ' + rp(v.rekapFinal) + ').');
      rk.kategori.push(v);
    }
    // total, overhead, grand total
    var bukanSupply = items.filter(function (it) { return !it.supply_owner; });
    var TK = bulat(bukanSupply.reduce(function (s, it) { return s + it.jumlah_kontrak; }, 0));
    var TF = bulat(bukanSupply.reduce(function (s, it) { return s + it.jumlah_final; }, 0));
    var ohRow = baris.filter(function (b) { return b.tipe === 'OVERHEAD'; })[0];
    var pct = ohRow && ohRow.pct !== null ? ohRow.pct : null;
    if (pct === null) { t.tambah('KUNING', 'OVERHEAD', 'Baris OVER HEAD tidak ditemukan; overhead dianggap 0%.'); pct = 0; }
    else t.tambah('INFO', 'OVERHEAD', 'Overhead terbaca ' + pct + '% dari baris OVER HEAD (baris ' + ohRow.baris + ').');
    var GK = bulat(TK * (1 + pct / 100)), GF = bulat(TF * (1 + pct / 100));
    rk.total = { kontrak: TK, final: TF, overheadPct: pct, overheadKontrak: bulat(TK * pct / 100), overheadFinal: bulat(TF * pct / 100), grandKontrak: GK, grandFinal: GF };
    rk.overheadPct = pct;
    var totalRab = baris.filter(function (b) { return b.tipe === 'TOTAL'; })[0];
    var grandRab = baris.filter(function (b) { return b.tipe === 'GRAND_OH'; })[0];
    function banding(nama, hitung, file, sumber) {
      if (file === null || file === undefined) return;
      if (Math.abs(hitung - file) > tol) t.tambah('MERAH', 'TOTAL', nama + ': dihitung ' + rp(hitung) + ' ≠ ' + sumber + ' ' + rp(file) + ' (selisih ' + rp(hitung - file) + ').');
    }
    if (totalRab) { banding('TOTAL kontrak', TK, totalRab.kontrak, 'sheet RAB'); banding('TOTAL final', TF, totalRab.final, 'sheet RAB'); }
    if (grandRab) { banding('GRAND TOTAL setelah overhead (kontrak)', GK, grandRab.kontrak, 'sheet RAB'); banding('GRAND TOTAL setelah overhead (final)', GF, grandRab.final, 'sheet RAB'); }
    if (rekap && rekap.total) { banding('TOTAL kontrak', TK, rekap.total.kontrak, 'REKAPITULASI'); banding('TOTAL final', TF, rekap.total.final, 'REKAPITULASI'); }
    if (rekap && rekap.jumlahTotal) { banding('JUMLAH TOTAL kontrak', GK, rekap.jumlahTotal.kontrak, 'REKAPITULASI'); banding('JUMLAH TOTAL final', GF, rekap.jumlahTotal.final, 'REKAPITULASI'); }
    var sup = babList.filter(function (b) { return b.supply; });
    sup.forEach(function (b) {
      var sk = bulat(b.item.reduce(function (s, it) { return s + it.jumlah_kontrak; }, 0));
      t.tambah('INFO', 'SUPPLY_OWNER', 'Bab ' + b.kode + ' (' + b.nama.slice(0, 60) + ') dikenali sebagai supply-by-owner: ' + b.item.length + ' item, ' + rp(sk) + ', tidak masuk total kontrak dan bobot.', { bab: b.kode });
    });
    return rk;
  }

  function cekNomorGanda(items, t) {
    var grup = {};
    items.forEach(function (it) {
      if (!/^\d+$/.test(it.no_item)) return;
      var key = it.bab_kode + '|' + it.sub_grup;
      (grup[key] = grup[key] || {})[it.no_item] = (grup[key][it.no_item] || []).concat(it.baris_excel);
    });
    for (var key in grup) for (var no in grup[key]) if (grup[key][no].length > 1) {
      var p = key.split('|');
      t.tambah('KUNING', 'NOMOR_GANDA', 'Bab ' + p[0] + (p[1] ? ' / ' + p[1] : '') + ': nomor item ' + no + ' dipakai ' + grup[key][no].length + '× (baris ' + grup[key][no].join(', ') + '). Item tetap disimpan terpisah.', { bab: p[0] });
    }
  }

  function cekUrutanBab(babList, t) {
    var prev = 0, kode = babList.map(function (b) { return b.kode; });
    babList.forEach(function (b) {
      var n = romawi(b.kode);
      if (n < prev && !b.supply) t.tambah('KUNING', 'URUTAN_BAB', 'Urutan bab tidak berurutan: ' + b.kode + ' muncul setelah bab yang lebih besar.', { bab: b.kode });
      if (n !== prev + 1 && n > prev && prev) t.tambah('INFO', 'URUTAN_BAB', 'Bab ' + b.kode + ' muncul setelah ' + romawiDari(prev) + ' (urutan di file: ' + kode.join(', ') + ').', { bab: b.kode });
      prev = Math.max(prev, n);
    });
  }
  function romawiDari(n) { var v = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], s = ''; v.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } }); return s; }

  function cekMerge(XLSX, ws, baris, peta, grid, t) {
    var itemBaris = {};
    baris.forEach(function (b) { if (b.tipe === 'ITEM' || b.tipe === 'TANPA_HARGA') itemBaris[b.baris] = true; });
    var kolomItem = [peta.no, peta.uraian, peta.kontrak.vol, peta.kontrak.harga, peta.kontrak.jumlah];
    if (peta.final) kolomItem.push(peta.final.vol, peta.final.harga, peta.final.jumlah);
    var cMin = Math.min.apply(null, kolomItem) + grid.c0, cMax = Math.max.apply(null, kolomItem) + grid.c0;
    var kena = [];
    (ws['!merges'] || []).forEach(function (m) {
      if (m.e.c < cMin || m.s.c > cMax) return;
      for (var r = m.s.r; r <= m.e.r; r++) if (itemBaris[r + 1]) { kena.push(XLSX.utils.encode_range(m)); return; }
    });
    if (kena.length) t.tambah('MERAH', 'MERGE', kena.length + ' sel gabung (merged) di area item: ' + kena.slice(0, 10).join(', ') + (kena.length > 10 ? ', …' : '') + '. Lepas gabungan agar angka terbaca benar.');
  }

  function cekRumus(XLSX, wb, nama, t) {
    var tanpaNilai = [];
    nama.forEach(function (n) {
      if (!n) return;
      var ws = wb.Sheets[n];
      for (var a in ws) {
        if (a[0] === '!') continue;
        var c = ws[a];
        if (c && c.f && (c.v === undefined || c.v === null)) tanpaNilai.push(n + '!' + a);
      }
    });
    if (tanpaNilai.length) t.tambah('MERAH', 'RUMUS', tanpaNilai.length + ' sel rumus tanpa hasil tersimpan (mis. ' + tanpaNilai.slice(0, 5).join(', ') + '). Buka file di Excel lalu Simpan ulang.');
  }

  function infoProyek(rows) {
    var info = { pekerjaan: '', owner: '', lokasi: '' };
    for (var i = 0; i < Math.min(rows.length, 12); i++) {
      (rows[i] || []).forEach(function (v) {
        var s = teks(v), m = s.match(/^(PEKERJAAN|OWNER|PEMILIK|LOKASI)\s*:\s*(.+)$/i);
        if (!m) return;
        var k = m[1].toUpperCase();
        if (k === 'PEKERJAAN') info.pekerjaan = m[2].trim();
        else if (k === 'LOKASI') info.lokasi = m[2].trim();
        else info.owner = m[2].trim();
      });
    }
    return info;
  }

  function ringkasBab(b) { return { kode: b.kode, nama: b.nama, kategori: b.kategori, supply: b.supply, baris: b.baris, jumlahItem: b.item.length }; }

  function selesai(t, data) {
    var merah = t.daftar.filter(function (x) { return x.level === 'MERAH'; });
    var urut = { MERAH: 0, KUNING: 1, INFO: 2 };
    t.daftar.forEach(function (x, i) { x.id = 'T' + String(i + 1).padStart(3, '0'); });
    var temuan = t.daftar.slice().sort(function (a, b) { return urut[a.level] - urut[b.level]; });
    var fatal = !data || merah.some(function (x) { return /^(SHEET|HEADER|REKAP_HEADER|FORMAT|UKURAN|RUMUS)$/.test(x.kode); });
    return {
      ok: !!data && !fatal,
      data: data,
      temuan: temuan,
      jumlah: { MERAH: merah.length, KUNING: t.daftar.filter(function (x) { return x.level === 'KUNING'; }).length, INFO: t.daftar.filter(function (x) { return x.level === 'INFO'; }).length },
      // Temuan fatal tidak bisa dikonfirmasi; perbaiki file dulu.
      fatal: fatal,
      perluKonfirmasi: fatal ? [] : merah.map(function (x) { return x.id; }),
    };
  }

  // Boleh simpan jika tidak fatal dan semua temuan MERAH sudah dikonfirmasi.
  function bolehSimpan(hasil, idDikonfirmasi) {
    if (!hasil || !hasil.ok) return false;
    var set = {};
    (idDikonfirmasi || []).forEach(function (id) { set[id] = true; });
    return hasil.perluKonfirmasi.every(function (id) { return set[id]; });
  }

  function rp(x) {
    var n = Math.round(x || 0), neg = n < 0;
    return (neg ? '-Rp ' : 'Rp ') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  return { SYARAT: SYARAT, DEFAULT: DEFAULT, cekFile: cekFile, parse: parse, bolehSimpan: bolehSimpan, rp: rp, romawi: romawi };
});
