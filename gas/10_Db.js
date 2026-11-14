/**
 * Lapisan data: baca/tulis tab berdasarkan NAMA header (bukan posisi kolom).
 * Baris dengan kolom pertama kosong dianggap kosong (ada checkbox bawaan di beberapa tab).
 */
var DB_ = { cache: {} };

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(nama) {
  var sh = ss_().getSheetByName(nama);
  if (!sh) throw galat_('TAB_TIDAK_ADA', 'Tab ' + nama + ' tidak ditemukan di Sheet.');
  return sh;
}

function header_(nama) {
  var sh = sheet_(nama);
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
}

/** Baca seluruh tab -> array objek {kolom: nilai, _baris: n}. Di-cache per permintaan. */
function baca_(nama) {
  if (DB_.cache[nama]) return DB_.cache[nama];
  var sh = sheet_(nama);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var hdr = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  var rows = [];
  if (lastRow > 1) {
    var v = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var i = 0; i < v.length; i++) {
      if (v[i][0] === '' || v[i][0] === null) continue;
      var o = { _baris: i + 2 };
      for (var j = 0; j < hdr.length; j++) if (hdr[j]) o[hdr[j]] = keluar_(hdr[j], v[i][j]);
      rows.push(o);
    }
  }
  DB_.cache[nama] = { header: hdr, rows: rows, lastRow: lastRow };
  return DB_.cache[nama];
}
function rows_(nama) { return baca_(nama).rows; }
function bersihCache_(nama) { if (nama) delete DB_.cache[nama]; else DB_.cache = {}; }

function cari_(nama, id) {
  var k = KUNCI[nama][0];
  var r = rows_(nama);
  for (var i = 0; i < r.length; i++) if (String(r[i][k]) === String(id)) return r[i];
  return null;
}

/** Nilai dari Sheet -> nilai JSON. */
function keluar_(kolom, v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    var jam = Utilities.formatDate(v, APP.TZ, 'HH:mm:ss');
    return Utilities.formatDate(v, APP.TZ, jam === '00:00:00' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss");
  }
  return v;
}

/** Nilai JSON -> nilai untuk Sheet. */
function masuk_(kolom, v) {
  if (v === undefined || v === null) return '';
  if (KOLOM_ANGKA[kolom]) {
    if (v === '') return '';
    var n = angka_(v);
    if (n === null) throw galat_('VALIDASI', 'Kolom ' + kolom + ' harus angka (didapat: ' + v + ').');
    return n;
  }
  if (RE_KOLOM_TANGGAL.test(kolom) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return keTanggal_(v);
  if (typeof v === 'string') {
    v = v.trim();
    // cegah formula injection dari input pengguna
    if (/^[=+\-@]/.test(v) && !/^-?\d/.test(v)) v = "'" + v;
  }
  return v;
}

function angka_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v === '' || v === null || v === undefined) return null;
  var s = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^-?[\d.]*\d,\d+$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.')); // 1.234,5 / 0,9
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return null;
}

function keTanggal_(s) {
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return s;
  // Buat Date pada zona Asia/Jakarta (UTC+7, tanpa DST)
  var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0) - 7, +(m[5] || 0), +(m[6] || 0));
  return new Date(utc);
}

function hariIni_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'); }
function sekarang_() { return Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function selisihHari_(a, b) { // b - a dalam hari (string yyyy-MM-dd)
  if (!a || !b) return null;
  var da = keTanggal_(String(a).slice(0, 10)), db = keTanggal_(String(b).slice(0, 10));
  return Math.round((db - da) / 86400000);
}
function tambahHari_(s, n) {
  var d = keTanggal_(String(s).slice(0, 10));
  return Utilities.formatDate(new Date(d.getTime() + n * 86400000), APP.TZ, 'yyyy-MM-dd');
}

function idBaru_(nama) {
  var p = KUNCI[nama] && KUNCI[nama][1];
  if (!p) throw galat_('VALIDASI', 'Tab ' + nama + ' butuh kunci manual.');
  return p + '-' + Utilities.formatDate(new Date(), APP.TZ, 'yyMMdd') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase();
}

function denganKunci_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw galat_('SIBUK', 'Server sedang sibuk, coba lagi sebentar.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/**
 * Aturan dropdown/checkbox dibaca dari baris 2 Sheet (sumber kebenaran = Sheet).
 * -> {kolom: {tipe:'LIST', nilai:[...]} | {tipe:'BOOLEAN'}}
 */
function aturanSheet_(nama) {
  DB_.aturan = DB_.aturan || {};
  if (DB_.aturan[nama]) return DB_.aturan[nama];
  var cache = CacheService.getScriptCache(), k = 'ATURAN:' + nama, c = cache.get(k);
  if (c) return (DB_.aturan[nama] = JSON.parse(c));
  var sh = sheet_(nama), hdr = header_(nama), hasil = {};
  if (sh.getMaxRows() >= 2) {
    var dv = sh.getRange(2, 1, 1, hdr.length).getDataValidations()[0];
    for (var j = 0; j < hdr.length; j++) {
      var v = dv[j];
      if (!v || !hdr[j]) continue;
      var t = v.getCriteriaType();
      if (t === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) hasil[hdr[j]] = { tipe: 'LIST', nilai: v.getCriteriaValues()[0].map(String) };
      else if (t === SpreadsheetApp.DataValidationCriteria.CHECKBOX) hasil[hdr[j]] = { tipe: 'BOOLEAN' };
    }
  }
  cache.put(k, JSON.stringify(hasil), 600);
  return (DB_.aturan[nama] = hasil);
}

/** Cocokkan isi dengan dropdown Sheet: normalkan huruf besar/kecil, tolak nilai di luar daftar. */
function cocokkanAturan_(nama, o) {
  var a = aturanSheet_(nama);
  for (var k in a) {
    if (!(k in o)) continue;
    var v = o[k];
    if (a[k].tipe === 'BOOLEAN') { o[k] = v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || String(v).toLowerCase() === 'ya'; continue; }
    if (v === '' || v === null || v === undefined) continue;
    var cocok = a[k].nilai.filter(function (x) { return x.toLowerCase() === String(v).trim().toLowerCase(); })[0];
    if (cocok === undefined) throw galat_('VALIDASI', 'Kolom ' + k + ' harus salah satu dari: ' + a[k].nilai.join(', ') + ' (didapat: ' + v + ').');
    o[k] = /^\d+$/.test(cocok) && typeof v === 'number' ? v : cocok;
  }
  return o;
}

/** Daftar pilihan dropdown untuk frontend: {TAB: {kolom: [...]}} */
function pilihanSheet_() {
  var hasil = {};
  Object.keys(SKEMA).forEach(function (t) {
    var a = aturanSheet_(t), x = {};
    for (var k in a) if (a[k].tipe === 'LIST') x[k] = a[k].nilai;
    if (Object.keys(x).length) hasil[t] = x;
  });
  return hasil;
}

/** Sisipkan banyak baris sekaligus setelah baris data terakhir. Mengembalikan objek yang ditulis. */
function sisip_(nama, objs) {
  if (!objs.length) return [];
  objs.forEach(function (o) { cocokkanAturan_(nama, o); });
  var sh = sheet_(nama);
  bersihCache_(nama);
  var t = baca_(nama), hdr = t.header;
  var terakhir = 1;
  t.rows.forEach(function (r) { if (r._baris > terakhir) terakhir = r._baris; });
  var mulai = terakhir + 1;
  var butuh = mulai + objs.length - 1;
  if (sh.getMaxRows() < butuh) sh.insertRowsAfter(sh.getMaxRows(), butuh - sh.getMaxRows());
  var nilai = objs.map(function (o) { return hdr.map(function (h) { return h ? masuk_(h, o[h]) : ''; }); });
  sh.getRange(mulai, 1, nilai.length, hdr.length).setValues(nilai);
  bersihCache_(nama);
  return objs;
}

/** Ubah satu baris (objek hasil baca_) dengan perubahan {kolom: nilai}. */
function ubah_(nama, row, perubahan) {
  cocokkanAturan_(nama, perubahan);
  var sh = sheet_(nama), hdr = baca_(nama).header;
  var baris = sh.getRange(row._baris, 1, 1, hdr.length);
  var v = baris.getValues()[0];
  for (var j = 0; j < hdr.length; j++) if (hdr[j] && Object.prototype.hasOwnProperty.call(perubahan, hdr[j])) v[j] = masuk_(hdr[j], perubahan[hdr[j]]);
  baris.setValues([v]);
  bersihCache_(nama);
}

function hapusBaris_(nama, row) {
  sheet_(nama).deleteRow(row._baris);
  bersihCache_(nama);
}

/** Ganti seluruh isi data tab (untuk tab hasil hitung seperti STOK). */
function gantiIsi_(nama, objs) {
  var sh = sheet_(nama), hdr = header_(nama);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, hdr.length).clearContent();
  if (objs.length) {
    if (sh.getMaxRows() < objs.length + 1) sh.insertRowsAfter(sh.getMaxRows(), objs.length + 1 - sh.getMaxRows());
    sh.getRange(2, 1, objs.length, hdr.length).setValues(objs.map(function (o) { return hdr.map(function (h) { return masuk_(h, o[h]); }); }));
  }
  bersihCache_(nama);
}

function bersihObjek_(o) {
  var r = {};
  for (var k in o) if (k !== '_baris') r[k] = o[k];
  return r;
}

/** Catat ke LOG. nilai disimpan sebagai JSON (dipotong agar muat di sel). */
function catatLog_(user, aksi, tab, id, lama, baru) {
  var j = function (x) { if (x === undefined || x === null || x === '') return ''; var s = typeof x === 'string' ? x : JSON.stringify(x); return s.length > 45000 ? s.slice(0, 45000) + '…' : s; };
  sisip_('LOG', [{ waktu: sekarang_(), user_id: user ? user.user_id : 'SISTEM', aksi: aksi, tab: tab || '', record_id: id || '', nilai_lama: j(lama), nilai_baru: j(baru) }]);
}

/** Baca tab SETTING -> {kunci: nilai}. Angka berformat koma dikonversi. */
function setting_() {
  var s = {};
  rows_('SETTING').forEach(function (r) {
    var n = angka_(r.nilai);
    s[r.kunci] = n !== null ? n : r.nilai;
  });
  return s;
}

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, v); }

function galat_(kode, pesan) { var e = new Error(pesan); e.kode = kode; return e; }
