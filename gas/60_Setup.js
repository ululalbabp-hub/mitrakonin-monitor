/**
 * Fungsi yang dijalankan MANUAL dari editor Apps Script (menu Jalankan).
 * Semua aman diulang (idempoten).
 *
 *   setup()            — buat folder Drive induk, isi Script Properties yang kosong, tambah kolom tambahan, isi email_pengirim
 *   installTriggers()  — hapus & buat ulang trigger harian (indikator/risiko/stok/pengingat) dan laporan bulanan
 *   cekSkema()         — periksa nama tab & urutan kolom
 *   resetPasswordMassal() — dipakai setelah pindah akun bila PEPPER lama tidak disalin (lihat SERAH-TERIMA.md)
 */
function setup() {
  var log = [];
  var props = PropertiesService.getScriptProperties();

  // 1. Folder induk Drive
  var rootId = props.getProperty('ROOT_FOLDER_ID'), ok = false;
  if (rootId) { try { DriveApp.getFolderById(rootId).getName(); ok = true; } catch (e) { log.push('ROOT_FOLDER_ID lama tidak bisa dibuka, membuat folder baru.'); } }
  if (!ok) {
    var it = DriveApp.getFoldersByName(APP.FOLDER_INDUK_NAMA);
    var f = it.hasNext() ? it.next() : DriveApp.createFolder(APP.FOLDER_INDUK_NAMA);
    props.setProperty('ROOT_FOLDER_ID', f.getId());
    log.push('Folder induk: ' + f.getName() + ' (' + f.getUrl() + ')');
  } else log.push('Folder induk sudah ada.');

  // 2. PEPPER untuk hash password (JANGAN diganti bila sudah ada pengguna)
  if (!props.getProperty('PEPPER')) {
    props.setProperty('PEPPER', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
    log.push('PEPPER dibuat. Catat nilainya bila nanti memindahkan akun (lihat SERAH-TERIMA.md).');
  } else log.push('PEPPER sudah ada (tidak diubah).');

  // 3. Kolom tambahan
  var kol = pastikanKolomTambahan_();
  log.push(kol.length ? 'Kolom ditambahkan: ' + kol.join(', ') : 'Kolom tambahan sudah ada.');

  // 4. SETTING email_pengirim
  var email = Session.getEffectiveUser().getEmail();
  var r = rows_('SETTING').filter(function (x) { return x.kunci === 'email_pengirim'; })[0];
  if (r && !r.nilai && email) { ubah_('SETTING', r, { nilai: email }); log.push('email_pengirim diisi: ' + email); }

  // 5. Folder proyek yang belum punya folder
  rows_('PROYEK').forEach(function (p) {
    if (!p.folder_drive_id) { var fp = folderProyek_(p); ubah_('PROYEK', p, { folder_drive_id: fp.getId() }); log.push('Folder proyek dibuat: ' + p.kode); }
  });

  log = log.concat(cekSkema());
  catatLog_(null, 'SETUP', '', '', null, { log: log });
  log.forEach(function (x) { Logger.log(x); });
  return log;
}

function cekSkema() {
  var hasil = [];
  Object.keys(SKEMA).forEach(function (tab) {
    var sh = ss_().getSheetByName(tab);
    if (!sh) { hasil.push('⚠ Tab ' + tab + ' tidak ada!'); return; }
    var hdr = header_(tab);
    SKEMA[tab].forEach(function (k, i) { if (hdr[i] !== k) hasil.push('⚠ ' + tab + ' kolom ' + (i + 1) + ': harap "' + k + '", ada "' + hdr[i] + '"'); });
  });
  if (!hasil.length) hasil.push('Skema 17 tab sesuai.');
  return hasil;
}

/** Trigger dibuat lewat kode agar bisa dibuat ulang satu klik dari akun baru. */
function installTriggers() {
  var nama = ['triggerHarian', 'triggerLaporan'];
  ScriptApp.getProjectTriggers().forEach(function (t) { if (nama.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('triggerHarian').timeBased().everyDays(1).atHour(6).inTimezone(APP.TZ).create();
  ScriptApp.newTrigger('triggerLaporan').timeBased().everyDays(1).atHour(7).inTimezone(APP.TZ).create();
  var info = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  catatLog_(null, 'INSTALL_TRIGGER', '', '', null, { trigger: info });
  Logger.log('Trigger aktif: ' + info.join(', '));
  return info;
}

/** Tiap pagi: hitung ulang stok, cek indikator & buat risiko otomatis, kirim pengingat ke admin. */
function triggerHarian() {
  hitungStokSemua_();
  var s = setting_(), ringkas = [];
  rows_('PROYEK').forEach(function (p) {
    if (p.status !== 'Berjalan') return;
    try {
      var h = hitungProyek_(p.proyek_id);
      var baru = cekRisikoOtomatis_(p.proyek_id, h);
      ringkas.push(p.kode + ': realisasi ' + h.ringkas.realisasi_pct + '%, risiko baru ' + baru.length);
      if (h.indikator.laporan.warna !== 'Hijau' && h.indikator.laporan.nilai !== null) pengingatAdmin_(p, h, s);
    } catch (e) { console.error('triggerHarian ' + p.proyek_id + ': ' + e); }
  });
  bersihCache_();
  Logger.log(ringkas.join('\n'));
}

function pengingatAdmin_(p, h, s) {
  var admin = rows_('USERS').filter(function (u) { return u.peran === 'ADMIN' && aktif_(u) && bolehProyek_(u, p.proyek_id); });
  admin.forEach(function (u) {
    MailApp.sendEmail({
      to: u.email, name: s.nama_perusahaan || 'MITRAKONIN',
      subject: 'Pengingat laporan progres: ' + p.nama,
      body: 'Halo ' + u.nama + ',\n\nLaporan progres terakhir untuk proyek ' + p.nama + ' tercatat ' + h.ringkas.hari_sejak_laporan +
        ' hari lalu. Mohon kirim laporan progres hari ini beserta foto.\n\n' + (s.nama_perusahaan || 'MITRAKONIN'),
    });
  });
}

/** Tiap pagi: kirim laporan bulanan untuk proyek yang periodenya berakhir kemarin. Isi laporan dibuat di Tahap 5. */
function triggerLaporan() {
  if (typeof kirimLaporanJatuhTempo_ === 'function') return kirimLaporanJatuhTempo_();
  Logger.log('Modul laporan bulanan belum dipasang (Tahap 5).');
}

/**
 * Setelah pindah akun TANPA menyalin PEPPER lama: semua hash lama tidak bisa dipakai.
 * Fungsi ini membuat password sementara baru untuk semua pengguna aktif dan mengirimnya lewat email.
 */
function resetPasswordMassal() {
  var hasil = [];
  denganKunci_(function () {
    rows_('USERS').forEach(function (u) {
      if (!aktif_(u)) return;
      var pw = passwordSementara_();
      ubah_('USERS', cari_('USERS', u.user_id), { password_hash: buatHash_(pw) });
      try { kirimPassword_(u, pw, 'Password baru MITRAKONIN Monitor'); hasil.push(u.email + ': terkirim'); }
      catch (e) { hasil.push(u.email + ': GAGAL kirim (' + e.message + ') — reset manual lewat menu Pengguna'); }
    });
    catatLog_(null, 'RESET_PASSWORD_MASSAL', 'USERS', '', null, { jumlah: hasil.length });
  });
  hasil.forEach(function (x) { Logger.log(x); });
  return hasil;
}

/**
 * Hapus proyek UJI (kode berawalan "UJI-") beserta semua barisnya di setiap tab dan folder Drive-nya (ke Sampah).
 * Hanya untuk data uji; proyek sungguhan tidak bisa dihapus lewat fungsi ini. LOG tetap disimpan.
 */
function hapusProyekUji_(u) {
  return denganKunci_(function () {
    var uji = rows_('PROYEK').filter(function (p) { return /^UJI-/i.test(String(p.kode)); });
    var ids = {}; uji.forEach(function (p) { ids[p.proyek_id] = true; });
    var ringkas = { proyek: uji.map(function (p) { return p.kode; }), baris: {}, folder: 0 };
    if (!uji.length) return ringkas;
    ['RAB_ITEM', 'CCO', 'JADWAL', 'PROGRES', 'MEDIA', 'MATERIAL_TRX', 'BIAYA', 'TERMIN', 'RISIKO', 'LAPORAN', 'PROYEK'].forEach(function (tab) {
      var hapus = rows_(tab).filter(function (r) { return ids[r.proyek_id] || (tab === 'MATERIAL_TRX' && ids[r.proyek_tujuan]); });
      hapus.sort(function (a, b) { return b._baris - a._baris; }).forEach(function (r) { sheet_(tab).deleteRow(r._baris); });
      bersihCache_(tab);
      ringkas.baris[tab] = hapus.length;
    });
    uji.forEach(function (p) { if (p.folder_drive_id) { try { DriveApp.getFolderById(p.folder_drive_id).setTrashed(true); ringkas.folder++; } catch (e) { /* sudah tidak ada */ } } });
    rows_('USERS').forEach(function (us) {
      var a = String(us.proyek_akses || '').split(',').filter(String);
      var b = a.filter(function (x) { return !ids[x]; });
      if (b.length !== a.length) ubah_('USERS', us, { proyek_akses: b.join(',') });
    });
    hitungStokSemua_();
    catatLog_(u, 'HAPUS_PROYEK_UJI', 'PROYEK', '', null, ringkas);
    return ringkas;
  });
}

/** Uji cepat dari editor: menampilkan daftar tab. */
function ping() {
  var tabs = ss_().getSheets().map(function (s) { return s.getName(); });
  Logger.log('Terhubung ke: ' + ss_().getName() + ' | ' + tabs.length + ' tab: ' + tabs.join(', '));
  return tabs;
}
