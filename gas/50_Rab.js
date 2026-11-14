/**
 * Import RAB & CCO.
 * - File dibaca & divalidasi di browser (app/js/rab-import.js), lalu dikirim ke sini.
 * - Server memeriksa ulang: hak akses, RAB belum terkunci, temuan MERAH sudah dikonfirmasi, angka konsisten.
 * - Setelah import, kolom kontrak terkunci. Perubahan hanya lewat CCO (tidak menimpa kontrak), tercatat di LOG.
 */
function importRab_(u, d) {
  wajibProyek_(u, d.proyek_id);
  var items = d.items || [], cco = d.cco || [];
  if (!items.length) throw galat_('VALIDASI', 'Tidak ada item RAB.');
  if (items.length > 3000) throw galat_('VALIDASI', 'Item terlalu banyak (maks 3000).');
  var merah = (d.temuan || []).filter(function (t) { return t.level === 'MERAH'; });
  var konfirmasi = {};
  (d.konfirmasi || []).forEach(function (id) { konfirmasi[id] = true; });
  var belum = merah.filter(function (t) { return !konfirmasi[t.id]; });
  if (belum.length) throw galat_('VALIDASI', belum.length + ' temuan MERAH belum dikonfirmasi.');

  return denganKunci_(function () {
    if (rows_('RAB_ITEM').some(function (r) { return r.proyek_id === d.proyek_id; }))
      throw galat_('TERKUNCI', 'RAB proyek ini sudah diimport dan terkunci. Perubahan lewat CCO.');
    pastikanKolomTambahan_();

    // Normalisasi + cek angka
    var peta = {}, baris = [];
    var totalFinal = 0;
    items.forEach(function (it, i) {
      var n = function (k) { var v = angka_(it[k]); if (v === null) v = 0; if (v < 0) throw galat_('VALIDASI', 'Item ' + (i + 1) + ': ' + k + ' negatif.'); return v; };
      if (!it.uraian || !it.bab_kode) throw galat_('VALIDASI', 'Item ' + (i + 1) + ': uraian dan bab_kode wajib.');
      var row = {
        item_id: idBaru_('RAB_ITEM'), proyek_id: d.proyek_id,
        kategori: PILIHAN.kategori_rab.indexOf(it.kategori) >= 0 ? it.kategori : 'Lain-lain',
        bab_kode: String(it.bab_kode), bab_nama: String(it.bab_nama || ''), no_item: String(it.no_item || ''), uraian: String(it.uraian),
        spesifikasi: String(it.spesifikasi || ''), satuan: String(it.satuan || ''),
        vol_kontrak: n('vol_kontrak'), harga_kontrak: n('harga_kontrak'), jumlah_kontrak: n('jumlah_kontrak'),
        vol_final: n('vol_final'), harga_final: n('harga_final'), jumlah_final: n('jumlah_final'),
        status_cco: PILIHAN.status_cco.indexOf(it.status_cco) >= 0 ? it.status_cco : 'Tetap',
        bobot_pct: 0, cara_ukur: it.cara_ukur === 'persen' ? 'persen' : 'volume', urutan: i + 1,
        sub_grup: String(it.sub_grup || ''), supply_owner: it.supply_owner === true,
      };
      if (!row.supply_owner) totalFinal += row.jumlah_final;
      peta[it.item_id] = row.item_id;
      baris.push(row);
    });
    baris.forEach(function (r) { r.bobot_pct = r.supply_owner || !totalFinal ? 0 : r.jumlah_final / totalFinal * 100; });

    // Arsip file asli
    var arsip = null;
    if (d.file && d.file.data_base64) {
      var f = simpanBerkas_(folderJenis_(d.proyek_id, 'RAB'), Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd-HHmm') + '_' + String(d.file.nama || 'RAB.xlsx').replace(/[^\w.\- ]+/g, '_'),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', d.file.data_base64);
      arsip = { file_id: f.getId(), url: f.getUrl() };
    }

    sisip_('RAB_ITEM', baris);

    // CCO awal dari kolom Kerja Tambah/Kurang file
    var ccoRows = cco.filter(function (c) { return peta[c.item_id]; }).map(function (c, i) {
      return {
        cco_id: idBaru_('CCO'), proyek_id: d.proyek_id, no_cco: 'CCO-00 (file RAB)', tanggal: hariIni_(), item_id: peta[c.item_id],
        jenis: PILIHAN.jenis_cco.indexOf(c.jenis) >= 0 ? c.jenis : 'Tambah', vol_lama: angka_(c.vol_lama) || 0, vol_baru: angka_(c.vol_baru) || 0,
        harga: angka_(c.harga) || 0, selisih_nilai: angka_(c.selisih_nilai) || 0, alasan: String(c.alasan || '').slice(0, 500),
        disetujui_client: false, dokumen_url: arsip ? arsip.url : '',
      };
    });
    if (ccoRows.length) sisip_('CCO', ccoRows);

    // Isi nilai kontrak & overhead proyek bila masih kosong
    var p = cari_('PROYEK', d.proyek_id), r = d.ringkasan || {}, ubahan = {};
    if (!p.nilai_kontrak && r.grandKontrak) ubahan.nilai_kontrak = Math.round(r.grandKontrak);
    if ((p.overhead_pct === '' || p.overhead_pct === null) && r.overheadPct !== undefined) ubahan.overhead_pct = r.overheadPct;
    if (Object.keys(ubahan).length) ubah_('PROYEK', p, ubahan);

    catatLog_(u, 'IMPORT_RAB', 'RAB_ITEM', d.proyek_id, null, {
      file: d.file && d.file.nama, arsip: arsip, jumlah_item: baris.length, jumlah_cco: ccoRows.length,
      total_final: Math.round(totalFinal), temuan_merah_dikonfirmasi: merah.map(function (t) { return t.id + ' ' + t.kode + ': ' + String(t.pesan).slice(0, 200); }),
    });
    return { jumlah_item: baris.length, jumlah_cco: ccoRows.length, arsip: arsip, total_final: Math.round(totalFinal), proyek: ubahan };
  });
}

/**
 * CCO baru: {proyek_id, jenis: Tambah|Kurang|Baru, item_id?, vol_baru, harga?, alasan, no_cco?, tanggal?, disetujui_client?, dokumen_url?,
 *            item_baru?: {bab_kode, bab_nama, uraian, satuan, spesifikasi, cara_ukur, sub_grup}}
 * Kontrak tidak berubah; yang berubah kolom final + status_cco, lalu bobot dihitung ulang.
 */
function buatCco_(u, d) {
  wajibProyek_(u, d.proyek_id);
  if (PILIHAN.jenis_cco.indexOf(d.jenis) < 0) throw galat_('VALIDASI', 'Jenis CCO harus Tambah, Kurang, atau Baru.');
  if (!d.alasan) throw galat_('VALIDASI', 'Alasan CCO wajib diisi.');
  var volBaru = angka_(d.vol_baru);
  if (volBaru === null || volBaru < 0) throw galat_('VALIDASI', 'vol_baru harus angka ≥ 0.');
  return denganKunci_(function () {
    pastikanKolomTambahan_();
    var item, lama;
    if (d.jenis === 'Baru') {
      var ib = d.item_baru || {};
      if (!ib.uraian || !ib.satuan) throw galat_('VALIDASI', 'Item baru butuh uraian dan satuan.');
      var harga = angka_(d.harga);
      if (harga === null || harga <= 0) throw galat_('VALIDASI', 'Harga item baru wajib diisi.');
      var maxUrut = rows_('RAB_ITEM').filter(function (r) { return r.proyek_id === d.proyek_id; }).reduce(function (m, r) { return Math.max(m, Number(r.urutan) || 0); }, 0);
      item = {
        item_id: idBaru_('RAB_ITEM'), proyek_id: d.proyek_id, kategori: 'Item Baru', bab_kode: ib.bab_kode || 'CCO', bab_nama: ib.bab_nama || 'PEKERJAAN TAMBAH (CCO)',
        no_item: ib.no_item || '', uraian: ib.uraian, spesifikasi: ib.spesifikasi || '', satuan: ib.satuan,
        vol_kontrak: 0, harga_kontrak: 0, jumlah_kontrak: 0, vol_final: volBaru, harga_final: harga, jumlah_final: Math.round(volBaru * harga * 100) / 100,
        status_cco: 'Baru', bobot_pct: 0, cara_ukur: ib.cara_ukur === 'persen' ? 'persen' : 'volume', urutan: maxUrut + 1, sub_grup: ib.sub_grup || '', supply_owner: false,
      };
      sisip_('RAB_ITEM', [item]);
      lama = { vol_final: 0, jumlah_final: 0 };
    } else {
      item = cari_('RAB_ITEM', d.item_id);
      if (!item || item.proyek_id !== d.proyek_id) throw galat_('TIDAK_ADA', 'Item RAB tidak ditemukan di proyek ini.');
      lama = { vol_final: item.vol_final, harga_final: item.harga_final, jumlah_final: item.jumlah_final, status_cco: item.status_cco };
      var h = angka_(d.harga); if (h === null) h = Number(item.harga_final) || Number(item.harga_kontrak) || 0;
      var jumlah = Math.round(volBaru * h * 100) / 100;
      if (d.jenis === 'Tambah' && jumlah < Number(item.jumlah_final)) throw galat_('VALIDASI', 'CCO Tambah tetapi nilai baru lebih kecil dari nilai final sekarang.');
      if (d.jenis === 'Kurang' && jumlah > Number(item.jumlah_final)) throw galat_('VALIDASI', 'CCO Kurang tetapi nilai baru lebih besar dari nilai final sekarang.');
      var K = Number(item.jumlah_kontrak) || 0;
      var status = !K ? 'Baru' : Math.abs(jumlah - K) < 1 ? 'Tetap' : jumlah > K ? 'Tambah' : 'Kurang';
      ubah_('RAB_ITEM', item, { vol_final: volBaru, harga_final: h, jumlah_final: jumlah, status_cco: status });
      item = cari_('RAB_ITEM', d.item_id);
    }
    var row = {
      cco_id: idBaru_('CCO'), proyek_id: d.proyek_id, no_cco: d.no_cco || nomorCcoBerikut_(d.proyek_id), tanggal: d.tanggal || hariIni_(), item_id: item.item_id,
      jenis: d.jenis, vol_lama: Number(lama.vol_final) || 0, vol_baru: volBaru, harga: Number(item.harga_final) || 0,
      selisih_nilai: Math.round(((Number(item.jumlah_final) || 0) - (Number(lama.jumlah_final) || 0)) * 100) / 100,
      alasan: d.alasan, disetujui_client: d.disetujui_client || '', dokumen_url: d.dokumen_url || '',
    };
    sisip_('CCO', [row]);
    simpanBobot_(d.proyek_id);
    catatLog_(u, 'CCO', 'RAB_ITEM', item.item_id, lama, { vol_final: item.vol_final, harga_final: item.harga_final, jumlah_final: item.jumlah_final, status_cco: item.status_cco, cco_id: row.cco_id });
    return { cco: row, item_id: item.item_id };
  });
}

/**
 * Simpan jadwal rencana sekaligus: {proyek_id, jadwal: [{bab_kode?|item_id?, tgl_mulai, tgl_selesai}], hapus_semua?}
 * Entri per bab berlaku untuk semua item di bab itu. Jadwal item yang sudah ada diganti.
 */
function simpanJadwal_(u, d) {
  wajibProyek_(u, d.proyek_id);
  return denganKunci_(function () {
    var items = rows_('RAB_ITEM').filter(function (r) { return r.proyek_id === d.proyek_id && !benar_(r.supply_owner); });
    var target = {};
    (d.jadwal || []).forEach(function (j) {
      if (!j.tgl_mulai || !j.tgl_selesai) throw galat_('VALIDASI', 'Tanggal mulai & selesai wajib.');
      if (selisihHari_(j.tgl_mulai, j.tgl_selesai) < 0) throw galat_('VALIDASI', 'Tanggal selesai sebelum tanggal mulai (' + (j.bab_kode || j.item_id) + ').');
      items.forEach(function (it) { if ((j.item_id && it.item_id === j.item_id) || (j.bab_kode && it.bab_kode === j.bab_kode)) target[it.item_id] = j; });
    });
    var lama = rows_('JADWAL').filter(function (r) { return r.proyek_id === d.proyek_id && (d.hapus_semua || target[r.item_id]); });
    // hapus dari bawah agar nomor baris tidak bergeser
    lama.sort(function (a, b) { return b._baris - a._baris; }).forEach(function (r) { sheet_('JADWAL').deleteRow(r._baris); });
    bersihCache_('JADWAL');
    var baru = Object.keys(target).map(function (id) {
      return { jadwal_id: idBaru_('JADWAL'), proyek_id: d.proyek_id, item_id: id, tgl_mulai: target[id].tgl_mulai, tgl_selesai: target[id].tgl_selesai, pola: 'rata' };
    });
    sisip_('JADWAL', baru);
    catatLog_(u, 'SIMPAN_JADWAL', 'JADWAL', d.proyek_id, { dihapus: lama.length }, { item: baru.length });
    return { disimpan: baru.length, dihapus: lama.length };
  });
}

/**
 * Progres awal (proyek yang sudah berjalan sebelum memakai aplikasi):
 * {proyek_id, tanggal, keterangan, items: [{item_id, volume?|persen?}]} -> baris PROGRES langsung Disetujui oleh pengelola.
 * volume = volume kumulatif terpasang (item volume); persen = persen kumulatif (item lumpsum).
 */
function progresAwal_(u, d) {
  wajibProyek_(u, d.proyek_id);
  if (!d.tanggal) throw galat_('VALIDASI', 'Tanggal progres awal wajib diisi.');
  return denganKunci_(function () {
    var peta = {};
    rows_('RAB_ITEM').forEach(function (r) { if (r.proyek_id === d.proyek_id) peta[r.item_id] = r; });
    var baris = [];
    (d.items || []).forEach(function (x) {
      var it = peta[x.item_id];
      if (!it) throw galat_('VALIDASI', 'Item ' + x.item_id + ' tidak ada di proyek ini.');
      var row = { progres_id: idBaru_('PROGRES'), proyek_id: d.proyek_id, tanggal: d.tanggal, item_id: x.item_id, uraian_kegiatan: d.keterangan || 'Progres awal',
        input_oleh: u.user_id, status: 'Disetujui', approve_oleh: u.user_id, tgl_approve: sekarang_(), catatan_approve: 'Progres awal (import)' };
      if (it.cara_ukur === 'persen') { var p = angka_(x.persen); if (p === null || p < 0 || p > 100) throw galat_('VALIDASI', 'Persen item ' + it.uraian + ' harus 0–100.'); row.persen_kumulatif = p; }
      else { var v = angka_(x.volume); if (v === null || v < 0) throw galat_('VALIDASI', 'Volume item ' + it.uraian + ' tidak valid.'); row.volume_hari_ini = v; }
      baris.push(row);
    });
    sisip_('PROGRES', baris);
    catatLog_(u, 'PROGRES_AWAL', 'PROGRES', d.proyek_id, null, { tanggal: d.tanggal, jumlah: baris.length, keterangan: d.keterangan });
    return { disimpan: baris.length };
  });
}

function nomorCcoBerikut_(pid) {
  var n = 0;
  rows_('CCO').forEach(function (c) { if (c.proyek_id === pid) { var m = String(c.no_cco).match(/CCO-(\d+)/); if (m) n = Math.max(n, Number(m[1])); } });
  return 'CCO-' + ('0' + (n + 1)).slice(-2);
}

/** Tambah kolom tambahan di ujung kanan bila belum ada (tidak mengubah urutan kolom lama). */
function pastikanKolomTambahan_() {
  var ditambah = [];
  Object.keys(KOLOM_TAMBAHAN).forEach(function (tab) {
    var sh = sheet_(tab), hdr = header_(tab);
    KOLOM_TAMBAHAN[tab].forEach(function (k) {
      if (hdr.indexOf(k) >= 0) return;
      var c = sh.getLastColumn() + 1;
      if (sh.getMaxColumns() < c) sh.insertColumnsAfter(sh.getMaxColumns(), 1);
      sh.getRange(1, c).setValue(k).setFontWeight('bold');
      hdr.push(k);
      ditambah.push(tab + '.' + k);
    });
    bersihCache_(tab);
  });
  if (ditambah.length) catatLog_(null, 'TAMBAH_KOLOM', '', '', null, { kolom: ditambah, alasan: 'Disetujui Tahap 1: sub_grup & supply_owner' });
  return ditambah;
}
