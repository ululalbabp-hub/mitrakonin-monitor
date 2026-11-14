/**
 * File di Google Drive: satu folder induk (Script Properties ROOT_FOLDER_ID),
 * subfolder per proyek, lalu subfolder per jenis (Progres, Material, Biaya, Termin, RAB, Laporan, CCO).
 * Sheet hanya menyimpan ID & link file.
 *
 * Berbagi: semua berkas PRIVAT. Foto ditampilkan lewat aksi mediaThumbs/mediaData yang memeriksa peran.
 * Hanya VIDEO progres/termin dibagikan "siapa saja yang punya link" agar video besar (> 8 MB) tetap bisa diputar.
 */
function folderInduk_() {
  var id = prop_('ROOT_FOLDER_ID');
  if (!id) throw galat_('KONFIG', 'ROOT_FOLDER_ID belum diatur. Jalankan setup().');
  return DriveApp.getFolderById(id);
}

function folderProyek_(proyek) {
  if (proyek.folder_drive_id) {
    try { return DriveApp.getFolderById(proyek.folder_drive_id); } catch (e) { /* folder hilang -> buat ulang */ }
  }
  var nama = [proyek.kode, proyek.nama].filter(String).join(' - ') || proyek.proyek_id;
  return folderInduk_().createFolder(nama);
}

function subFolder_(induk, nama) {
  var it = induk.getFoldersByName(nama);
  return it.hasNext() ? it.next() : induk.createFolder(nama);
}

function folderJenis_(proyekId, jenis) {
  var p = cari_('PROYEK', proyekId);
  if (!p) throw galat_('TIDAK_ADA', 'Proyek tidak ditemukan.');
  var f = folderProyek_(p);
  if (f.getId() !== p.folder_drive_id) ubah_('PROYEK', p, { folder_drive_id: f.getId() });
  return subFolder_(f, APP.SUBFOLDER[jenis] || jenis);
}

/** Simpan base64 ke Drive -> File */
function simpanBerkas_(folder, nama, mime, base64) {
  var bytes = Utilities.base64Decode(String(base64).replace(/^data:[^,]+,/, ''));
  return folder.createFile(Utilities.newBlob(bytes, mime || 'application/octet-stream', nama));
}

function urlTampil_(file, tipe) {
  if (tipe === 'FOTO') return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600';
  return file.getUrl();
}

/** Aksi upload: {proyek_id, ref_tipe, ref_id, tipe, nama_file, mime, data_base64, lat, lng, waktu_ambil} */
function unggah_(u, d) {
  wajibProyek_(u, d.proyek_id);
  if (PILIHAN.ref_tipe.indexOf(d.ref_tipe) < 0) throw galat_('VALIDASI', 'ref_tipe tidak valid.');
  if (PILIHAN.tipe_media.indexOf(d.tipe) < 0) throw galat_('VALIDASI', 'tipe media tidak valid.');
  if (!d.data_base64) throw galat_('VALIDASI', 'Berkas kosong.');
  var tabRef = { PROGRES: 'PROGRES', MATERIAL: 'MATERIAL_TRX', BIAYA: 'BIAYA', TERMIN: 'TERMIN' }[d.ref_tipe];
  var ref = cari_(tabRef, d.ref_id);
  if (!ref || String(ref.proyek_id) !== String(d.proyek_id)) throw galat_('VALIDASI', 'Data rujukan (' + d.ref_tipe + ' ' + d.ref_id + ') tidak ditemukan di proyek ini.');
  if (u.peran === 'ADMIN') {
    if (d.ref_tipe === 'TERMIN') throw galat_('AKSES', 'Admin tidak boleh mengunggah dokumen termin.');
    if (ref.input_oleh !== u.user_id) throw galat_('AKSES', 'Hanya bisa melampirkan bukti pada input milik sendiri.');
    if (ref.status !== 'Menunggu') throw galat_('TERKUNCI', 'Input sudah ' + ref.status + '.');
  }
  var kb = Math.round(String(d.data_base64).length * 3 / 4 / 1024);
  if (kb > APP.BATAS_UNGGAH_KB[d.tipe]) throw galat_('VALIDASI', 'Ukuran ' + d.tipe + ' ' + kb + ' KB melebihi batas ' + APP.BATAS_UNGGAH_KB[d.tipe] + ' KB.');

  var jenisFolder = d.ref_tipe;
  var folder = folderJenis_(d.proyek_id, jenisFolder);
  var nama = (d.ref_id + '_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd-HHmmss') + '_' + String(d.nama_file || d.tipe).replace(/[^\w.\-]+/g, '_')).slice(0, 120);
  var file = simpanBerkas_(folder, nama, d.mime, d.data_base64);
  var bagikan = d.tipe === 'VIDEO' && (d.ref_tipe === 'PROGRES' || d.ref_tipe === 'TERMIN');
  if (bagikan) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var row = denganKunci_(function () {
    var r = {
      media_id: idBaru_('MEDIA'), proyek_id: d.proyek_id, ref_tipe: d.ref_tipe, ref_id: d.ref_id, tipe: d.tipe,
      drive_file_id: file.getId(), url: bagikan ? file.getUrl() : '',
      lat: d.lat === undefined ? '' : d.lat, lng: d.lng === undefined ? '' : d.lng, waktu_ambil: d.waktu_ambil || sekarang_(), ukuran_kb: kb,
    };
    sisip_('MEDIA', [r]);
    catatLog_(u, 'UPLOAD', 'MEDIA', r.media_id, null, { ref_tipe: r.ref_tipe, ref_id: r.ref_id, tipe: r.tipe, ukuran_kb: kb });
    return r;
  });
  return row;
}

/**
 * Thumbnail beberapa media sekaligus (maks 16), dengan cek peran per media.
 * Dipakai PWA untuk menampilkan foto tanpa bergantung pada link publik Drive.
 * Hasil di-cache 6 jam di CacheService.
 */
function mediaThumbs_(u, d) {
  var ids = (d.ids || []).slice(0, 16), cache = CacheService.getScriptCache(), hasil = [];
  ids.forEach(function (id) {
    var m = cari_('MEDIA', id);
    if (!m || !saringBaca_(u, 'MEDIA', [m]).length) { hasil.push({ media_id: id, ok: false }); return; }
    var k = 'TH:' + id, c = cache.get(k);
    if (c) { hasil.push({ media_id: id, ok: true, mime: 'image/jpeg', data_base64: c }); return; }
    try {
      var f = DriveApp.getFileById(m.drive_file_id), blob = null;
      try { blob = f.getThumbnail(); } catch (e) { blob = null; }
      if ((!blob || blob.getBytes().length < 500) && m.tipe === 'FOTO' && f.getSize() < 700 * 1024) blob = f.getBlob();
      if (!blob) { hasil.push({ media_id: id, ok: false, tipe: m.tipe }); return; }
      var b64 = Utilities.base64Encode(blob.getBytes());
      if (b64.length < 95000) cache.put(k, b64, 21600);
      hasil.push({ media_id: id, ok: true, mime: blob.getContentType() || 'image/jpeg', data_base64: b64 });
    } catch (e) { hasil.push({ media_id: id, ok: false }); }
  });
  return hasil;
}

/** Ambil isi berkas privat (nota, surat jalan) sebagai base64, dengan cek peran. */
function mediaData_(u, d) {
  var m = cari_('MEDIA', d.media_id);
  if (!m) throw galat_('TIDAK_ADA', 'Media tidak ditemukan.');
  var boleh = saringBaca_(u, 'MEDIA', [m]);
  if (!boleh.length) throw galat_('AKSES', 'Anda tidak punya akses ke berkas ini.');
  var f = DriveApp.getFileById(m.drive_file_id);
  var blob = f.getBlob();
  if (blob.getBytes().length > 8 * 1024 * 1024) return { media_id: m.media_id, terlalu_besar: true, url: u.peran === 'PENGELOLA' || m.url ? f.getUrl() : '' };
  return { media_id: m.media_id, mime: blob.getContentType(), data_base64: Utilities.base64Encode(blob.getBytes()) };
}
