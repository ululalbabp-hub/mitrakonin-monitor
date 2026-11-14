/**
 * Pintu tunggal API. PWA memanggil:
 *   fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({action, token, data})})
 * Content-Type text/plain = "simple request", tidak memicu preflight CORS.
 */
var AKSI = {
  // publik
  ping: { publik: true, fn: function () { return { app: APP.NAMA, versi: APP.VERSI, waktu: sekarang_() }; } },
  login: { publik: true, fn: function (u, d) { return login_(d); } },
  bootstrap: { publik: true, fn: function (u, d) { return bootstrap_(d); } },
  // sesi
  logout: { fn: function (u, d, token) { return logout_(token); } },
  me: { fn: function (u) { return profil_(u); } },
  config: { fn: function (u) { return configPublik_(u); } },
  gantiPassword: { fn: function (u, d) { return gantiPassword_(u, d); } },
  // data umum
  list: { fn: function (u, d) { return aksiList_(u, d); } },
  get: { fn: function (u, d) { return aksiGet_(u, d); } },
  create: { fn: function (u, d) { return aksiCreate_(u, d); } },
  update: { fn: function (u, d) { return aksiUpdate_(u, d); } },
  remove: { fn: function (u, d) { return aksiRemove_(u, d); } },
  // approval
  approve: { peran: ['PENGELOLA'], fn: function (u, d) { return aksiApprove_(u, d); } },
  antrianApproval: { peran: ['PENGELOLA'], fn: function (u, d) { return antrianApproval_(u, d); } },
  // berkas
  upload: { peran: ['PENGELOLA', 'ADMIN'], fn: function (u, d) { return unggah_(u, d); } },
  mediaData: { fn: function (u, d) { return mediaData_(u, d); } },
  mediaThumbs: { fn: function (u, d) { return mediaThumbs_(u, d); } },
  // hitungan
  dashboard: { fn: function (u, d) { return dashboard_(u, d); } },
  dashboardProyek: { fn: function (u, d) { return dashboardProyek_(u, d); } },
  // RAB & CCO
  importRab: { peran: ['PENGELOLA'], fn: function (u, d) { return importRab_(u, d); } },
  buatCco: { peran: ['PENGELOLA'], fn: function (u, d) { return buatCco_(u, d); } },
  simpanJadwal: { peran: ['PENGELOLA'], fn: function (u, d) { return simpanJadwal_(u, d); } },
  progresAwal: { peran: ['PENGELOLA'], fn: function (u, d) { return progresAwal_(u, d); } },
  // pengguna & setting
  userList: { peran: ['PENGELOLA'], fn: function (u) { return saringBaca_(u, 'USERS', rows_('USERS')); } },
  userCreate: { peran: ['PENGELOLA'], fn: function (u, d) { return userCreate_(u, d); } },
  userUpdate: { peran: ['PENGELOLA'], fn: function (u, d) { return userUpdate_(u, d); } },
  userResetPassword: { peran: ['PENGELOLA'], fn: function (u, d) { return userResetPassword_(u, d); } },
  settingSet: { peran: ['PENGELOLA'], fn: function (u, d) { return settingSet_(u, d); } },
  hapusProyekUji: { peran: ['PENGELOLA'], fn: function (u) { return hapusProyekUji_(u); } },
};

function doGet() {
  return json_({ ok: true, data: { app: APP.NAMA, versi: APP.VERSI, pesan: 'Gunakan POST.' } });
}

function doPost(e) {
  var mulai = Date.now(), req = {};
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var aksi = AKSI[req.action];
    if (!aksi) throw galat_('VALIDASI', 'Aksi tidak dikenal: ' + req.action);
    var u = aksi.publik ? null : sesi_(req.token);
    if (aksi.peran) wajibPeran_(u, aksi.peran);
    var data = aksi.fn(u, req.data || {}, req.token);
    return json_({ ok: true, data: data, ms: Date.now() - mulai });
  } catch (err) {
    var kode = err.kode || 'SERVER';
    if (kode === 'SERVER') console.error(req.action + ': ' + (err.stack || err));
    return json_({ ok: false, error: { kode: kode, pesan: kode === 'SERVER' ? 'Terjadi kesalahan server: ' + err.message : err.message } });
  } finally {
    bersihCache_();
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function configPublik_(u) {
  var s = setting_();
  return {
    nama_perusahaan: s.nama_perusahaan || 'MITRAKONIN', logo_url: s.logo_url || '',
    batas_ukuran_video_detik: s.batas_ukuran_video_detik || 60, foto_maks_kb: s.foto_maks_kb || 300,
    pilihan: PILIHAN, pilihan_sheet: pilihanSheet_(), peran: u.peran,
  };
}

// ---------- LIST / GET ----------
function aksiList_(u, d) {
  var tab = tabValid_(d.tab);
  var r = rows_(tab);
  if (d.proyek_id) { wajibProyek_(u, d.proyek_id); r = r.filter(function (x) { return String(x.proyek_id) === String(d.proyek_id) || (tab === 'MATERIAL_TRX' && String(x.proyek_tujuan) === String(d.proyek_id)); }); }
  if (d.where) r = r.filter(function (x) { for (var k in d.where) if (String(x[k]) !== String(d.where[k])) return false; return true; });
  var hasil = saringBaca_(u, tab, r);
  if (d.limit) hasil = hasil.slice(-Number(d.limit));
  return hasil;
}

function aksiGet_(u, d) {
  var tab = tabValid_(d.tab), row = cari_(tab, d.id);
  if (!row) throw galat_('TIDAK_ADA', 'Data tidak ditemukan.');
  var hasil = saringBaca_(u, tab, [row]);
  if (!hasil.length) throw galat_('AKSES', 'Anda tidak punya akses ke data ini.');
  return hasil[0];
}

function tabValid_(tab) {
  if (!SKEMA[tab]) throw galat_('VALIDASI', 'Tab tidak dikenal: ' + tab);
  return tab;
}

// ---------- CREATE ----------
function aksiCreate_(u, d) {
  var tab = tabValid_(d.tab), row = d.row || {};
  if (tab === 'LOG' || tab === 'STOK') throw galat_('AKSES', 'Tab ' + tab + ' diisi otomatis oleh sistem.');
  if (tab === 'USERS') throw galat_('VALIDASI', 'Gunakan aksi userCreate.');
  if (tab === 'RAB_ITEM') throw galat_('TERKUNCI', 'Item RAB hanya dibuat lewat Import RAB atau CCO jenis Baru.');
  if (tab === 'CCO') throw galat_('VALIDASI', 'Gunakan aksi buatCco.');
  if (tab === 'MEDIA') throw galat_('VALIDASI', 'Gunakan aksi upload.');

  if (u.peran === 'ADMIN') {
    if (!TAB_APPROVAL[tab]) throw galat_('AKSES', 'Admin lapangan hanya boleh input progres, material, dan biaya.');
    var bersih = {};
    KOLOM_INPUT_ADMIN[tab].forEach(function (k) { if (k in row) bersih[k] = row[k]; });
    row = bersih;
  } else if (u.peran !== 'PENGELOLA') throw galat_('AKSES', 'Client tidak boleh mengubah data.');

  if (tab !== 'PROYEK' && SKEMA[tab].indexOf('proyek_id') >= 0) wajibProyek_(u, row.proyek_id);
  var kunci = KUNCI[tab][0];
  return denganKunci_(function () {
    if (KUNCI[tab][1]) row[kunci] = idBaru_(tab);
    else if (!row[kunci]) throw galat_('VALIDASI', 'Kolom ' + kunci + ' wajib diisi.');
    else if (cari_(tab, row[kunci])) throw galat_('VALIDASI', kunci + ' ' + row[kunci] + ' sudah ada.');
    if (TAB_APPROVAL[tab]) {
      row.input_oleh = u.user_id;
      if (u.peran === 'PENGELOLA') {
        row.status = 'Disetujui';
        if (tab === 'PROGRES') { row.approve_oleh = u.user_id; row.tgl_approve = sekarang_(); row.catatan_approve = 'Diinput langsung oleh pengelola'; }
      } else {
        row.status = 'Menunggu';
        if (tab === 'PROGRES') { row.approve_oleh = ''; row.tgl_approve = ''; row.catatan_approve = ''; }
      }
    }
    var peringatan = validasi_(tab, row, null);
    cocokkanAturan_(tab, row); // sebelum membuat folder Drive dsb.
    siapkanBaris_(tab, row);
    sisip_(tab, [row]);
    catatLog_(u, 'CREATE', tab, row[kunci], null, row);
    if (tab === 'MATERIAL_TRX' && row.status === 'Disetujui') hitungStokSemua_();
    return { id: row[kunci], row: row, peringatan: peringatan };
  });
}

/** Isi otomatis sebelum simpan. */
function siapkanBaris_(tab, row) {
  if (tab === 'PROYEK') {
    if (row.tgl_mulai && row.durasi_hari && !row.tgl_selesai_rencana) row.tgl_selesai_rencana = tambahHari_(row.tgl_mulai, Number(row.durasi_hari) - 1);
    if (!row.status) row.status = 'Persiapan';
    if (!row.folder_drive_id) row.folder_drive_id = folderProyek_(row).getId();
  }
  if (tab === 'TERMIN') {
    if (!row.status) row.status = 'Belum';
    if ((row.nominal === '' || row.nominal === undefined) && row.persen_nilai) {
      var p = cari_('PROYEK', row.proyek_id);
      if (p && p.nilai_kontrak) row.nominal = Math.round(Number(p.nilai_kontrak) * Number(row.persen_nilai) / 100);
    }
  }
  if (tab === 'RISIKO') {
    if (!row.tanggal) row.tanggal = hariIni_();
    if (row.dampak && row.kemungkinan) row.skor = Number(row.dampak) * Number(row.kemungkinan);
    if (!row.status) row.status = 'Terbuka';
    if (!row.sumber) row.sumber = 'manual';
  }
  if (tab === 'JADWAL' && !row.pola) row.pola = 'rata';
  if ((tab === 'PROGRES' || tab === 'MATERIAL_TRX' || tab === 'BIAYA') && !row.tanggal) row.tanggal = hariIni_();
}

/** Validasi isi. Lempar galat untuk kesalahan; kembalikan daftar peringatan. */
function validasi_(tab, row, lama) {
  var w = [];
  function wajib(k) { if (row[k] === undefined || row[k] === null || String(row[k]).trim() === '') throw galat_('VALIDASI', 'Kolom ' + k + ' wajib diisi.'); }
  function pilihan(k, daftar) { if (row[k] !== undefined && row[k] !== '' && daftar.indexOf(row[k]) < 0) throw galat_('VALIDASI', k + ' harus salah satu dari: ' + daftar.join(', ') + '.'); }
  function positif(k) { var n = angka_(row[k]); if (n === null || n <= 0) throw galat_('VALIDASI', k + ' harus angka lebih dari 0.'); }
  if (tab === 'PROGRES') {
    wajib('item_id');
    var it = cari_('RAB_ITEM', row.item_id);
    if (!it || String(it.proyek_id) !== String(row.proyek_id)) throw galat_('VALIDASI', 'Item RAB tidak ditemukan di proyek ini.');
    if (it.cara_ukur === 'persen') {
      var p = angka_(row.persen_kumulatif);
      if (p === null || p < 0 || p > 100) throw galat_('VALIDASI', 'Item lumpsum: isi persen_kumulatif 0–100.');
    } else {
      positif('volume_hari_ini');
      var total = rows_('PROGRES').filter(function (x) { return x.item_id === row.item_id && x.status !== 'Ditolak' && (!lama || x.progres_id !== lama.progres_id); })
        .reduce(function (s, x) { return s + (Number(x.volume_hari_ini) || 0); }, 0) + Number(row.volume_hari_ini);
      if (it.vol_final && total > Number(it.vol_final) * 1.0001) w.push('Volume kumulatif ' + total + ' ' + it.satuan + ' melebihi volume RAB ' + it.vol_final + '. Progres item dibatasi 100%.');
    }
  }
  if (tab === 'MATERIAL_TRX') {
    wajib('kode_material'); wajib('jenis'); pilihan('jenis', PILIHAN.jenis_material); positif('qty');
    if (!cari_('MASTER_MATERIAL', row.kode_material)) throw galat_('VALIDASI', 'Kode material ' + row.kode_material + ' tidak ada di MASTER_MATERIAL.');
    if (row.jenis === 'MASUK') positif('harga_satuan');
    if (row.jenis === 'TRANSFER') {
      wajib('proyek_tujuan');
      if (String(row.proyek_tujuan) === String(row.proyek_id)) throw galat_('VALIDASI', 'Proyek tujuan transfer harus berbeda.');
      if (!cari_('PROYEK', row.proyek_tujuan)) throw galat_('VALIDASI', 'Proyek tujuan tidak ditemukan.');
    }
    if (row.jenis !== 'MASUK') {
      var saldo = saldoMaterial_(row.proyek_id, row.kode_material, lama && lama.trx_id);
      if (Number(row.qty) > saldo + 1e-9) w.push('Qty ' + row.qty + ' melebihi saldo stok tercatat (' + saldo + ').');
    }
    if (row.item_id && !cari_('RAB_ITEM', row.item_id)) throw galat_('VALIDASI', 'Item RAB ' + row.item_id + ' tidak ditemukan.');
  }
  if (tab === 'BIAYA') {
    wajib('kategori'); pilihan('kategori', PILIHAN.kategori_biaya); positif('nominal'); wajib('uraian');
    if (row.bab_kode && !rows_('RAB_ITEM').some(function (x) { return x.proyek_id === row.proyek_id && x.bab_kode === row.bab_kode; }))
      w.push('Bab ' + row.bab_kode + ' tidak ada di RAB proyek ini.');
  }
  if (tab === 'PROYEK') { wajib('kode'); wajib('nama'); pilihan('status', PILIHAN.status_proyek); }
  if (tab === 'TERMIN') { wajib('termin_ke'); pilihan('status', PILIHAN.status_termin); }
  if (tab === 'RISIKO') { wajib('deskripsi'); pilihan('kategori', PILIHAN.kategori_risiko); pilihan('status', PILIHAN.status_risiko); }
  if (tab === 'JADWAL') {
    wajib('item_id'); wajib('tgl_mulai'); wajib('tgl_selesai'); pilihan('pola', PILIHAN.pola);
    if (selisihHari_(row.tgl_mulai, row.tgl_selesai) < 0) throw galat_('VALIDASI', 'tgl_selesai sebelum tgl_mulai.');
  }
  return w;
}

// ---------- UPDATE ----------
function aksiUpdate_(u, d) {
  var tab = tabValid_(d.tab), ubahan = d.row || {};
  if (tab === 'LOG' || tab === 'STOK') throw galat_('AKSES', 'Tab ' + tab + ' tidak bisa diubah.');
  if (tab === 'USERS') throw galat_('VALIDASI', 'Gunakan aksi userUpdate.');
  if (u.peran === 'CLIENT') throw galat_('AKSES', 'Client tidak boleh mengubah data.');
  return denganKunci_(function () {
    var lama = cari_(tab, d.id);
    if (!lama) throw galat_('TIDAK_ADA', 'Data tidak ditemukan.');
    if ('proyek_id' in lama) wajibProyek_(u, lama.proyek_id);
    var kunci = KUNCI[tab][0];
    delete ubahan[kunci]; delete ubahan._baris;
    if (u.peran === 'ADMIN') {
      if (!TAB_APPROVAL[tab]) throw galat_('AKSES', 'Admin hanya boleh mengubah input progres/material/biaya miliknya.');
      if (lama.input_oleh !== u.user_id) throw galat_('AKSES', 'Hanya bisa mengubah input milik sendiri.');
      if (lama.status !== 'Menunggu') throw galat_('TERKUNCI', 'Input sudah ' + lama.status + ', tidak bisa diubah.');
      var b = {};
      KOLOM_INPUT_ADMIN[tab].forEach(function (k) { if (k in ubahan && k !== 'proyek_id') b[k] = ubahan[k]; });
      ubahan = b;
    } else {
      if (TAB_APPROVAL[tab]) { delete ubahan.status; delete ubahan.input_oleh; delete ubahan.approve_oleh; delete ubahan.tgl_approve; }
      if (tab === 'RAB_ITEM') KOLOM_RAB_TERKUNCI.forEach(function (k) { if (k in ubahan) throw galat_('TERKUNCI', 'Kolom ' + k + ' RAB terkunci. Perubahan volume/harga lewat CCO.'); });
      delete ubahan.proyek_id;
    }
    var baru = {};
    for (var k in lama) baru[k] = lama[k];
    for (var k2 in ubahan) baru[k2] = ubahan[k2];
    var peringatan = validasi_(tab, baru, lama);
    if (tab === 'RISIKO' && (ubahan.dampak || ubahan.kemungkinan)) ubahan.skor = Number(baru.dampak) * Number(baru.kemungkinan);
    if (tab === 'PROYEK' && (ubahan.tgl_mulai || ubahan.durasi_hari) && !ubahan.tgl_selesai_rencana && baru.tgl_mulai && baru.durasi_hari)
      ubahan.tgl_selesai_rencana = tambahHari_(baru.tgl_mulai, Number(baru.durasi_hari) - 1);
    var nilaiLama = {};
    for (var k3 in ubahan) nilaiLama[k3] = lama[k3];
    ubah_(tab, lama, ubahan);
    catatLog_(u, 'UPDATE', tab, d.id, nilaiLama, ubahan);
    if (tab === 'MATERIAL_TRX') hitungStokSemua_();
    return { id: d.id, peringatan: peringatan };
  });
}

// ---------- DELETE ----------
function aksiRemove_(u, d) {
  var tab = tabValid_(d.tab);
  if (u.peran === 'CLIENT') throw galat_('AKSES', 'Client tidak boleh menghapus data.');
  if (['LOG', 'STOK', 'USERS', 'RAB_ITEM', 'SETTING'].indexOf(tab) >= 0) throw galat_('AKSES', 'Data ' + tab + ' tidak bisa dihapus dari aplikasi.');
  return denganKunci_(function () {
    var lama = cari_(tab, d.id);
    if (!lama) throw galat_('TIDAK_ADA', 'Data tidak ditemukan.');
    if ('proyek_id' in lama) wajibProyek_(u, lama.proyek_id);
    if (u.peran === 'ADMIN') {
      if (!TAB_APPROVAL[tab] || lama.input_oleh !== u.user_id) throw galat_('AKSES', 'Hanya bisa menghapus input milik sendiri.');
      if (lama.status !== 'Menunggu') throw galat_('TERKUNCI', 'Input sudah ' + lama.status + ', tidak bisa dihapus.');
    }
    if (tab === 'PROYEK' && rows_('RAB_ITEM').some(function (x) { return x.proyek_id === lama.proyek_id; }))
      throw galat_('TERKUNCI', 'Proyek yang sudah punya RAB tidak bisa dihapus. Ubah status menjadi Selesai/Ditunda.');
    hapusBaris_(tab, lama);
    catatLog_(u, 'DELETE', tab, d.id, bersihObjek_(lama), null);
    if (tab === 'MATERIAL_TRX') hitungStokSemua_();
    return { id: d.id, dihapus: true };
  });
}

// ---------- APPROVAL ----------
function aksiApprove_(u, d) {
  var tab = d.tab;
  if (!TAB_APPROVAL[tab]) throw galat_('VALIDASI', 'Tab ' + tab + ' tidak memakai approval.');
  if (['Disetujui', 'Ditolak'].indexOf(d.keputusan) < 0) throw galat_('VALIDASI', 'keputusan harus Disetujui atau Ditolak.');
  if (d.keputusan === 'Ditolak' && !d.catatan) throw galat_('VALIDASI', 'Alasan penolakan wajib diisi.');
  var ids = d.ids || [d.id];
  var hasil = denganKunci_(function () {
    return ids.map(function (id) {
      var r = cari_(tab, id);
      if (!r) return { id: id, ok: false, pesan: 'tidak ditemukan' };
      if (!bolehProyek_(u, r.proyek_id)) return { id: id, ok: false, pesan: 'tanpa akses' };
      if (r.status !== 'Menunggu') return { id: id, ok: false, pesan: 'status sudah ' + r.status };
      var ubahan = { status: d.keputusan };
      if (tab === 'PROGRES') { ubahan.approve_oleh = u.user_id; ubahan.tgl_approve = sekarang_(); ubahan.catatan_approve = d.catatan || ''; }
      ubah_(tab, r, ubahan);
      catatLog_(u, d.keputusan === 'Disetujui' ? 'APPROVE' : 'TOLAK', tab, id, { status: 'Menunggu' }, { status: d.keputusan, catatan: d.catatan || '' });
      return { id: id, ok: true, proyek_id: r.proyek_id };
    });
  });
  if (tab === 'MATERIAL_TRX') hitungStokSemua_();
  // Risiko otomatis dicek saat dashboard pengelola dibuka & oleh trigger harian (agar approval tetap cepat).
  return hasil;
}

function antrianApproval_(u, d) {
  var hasil = [];
  Object.keys(TAB_APPROVAL).forEach(function (tab) {
    rows_(tab).forEach(function (r) {
      if (r.status !== 'Menunggu') return;
      if (d.proyek_id && r.proyek_id !== d.proyek_id) return;
      if (!bolehProyek_(u, r.proyek_id)) return;
      var o = bersihObjek_(r);
      o._tab = tab;
      o._umur_hari = selisihHari_(r.tanggal, hariIni_());
      o._media = rows_('MEDIA').filter(function (m) { return m.ref_id === r[TAB_APPROVAL[tab]]; }).map(bersihObjek_);
      var p = cari_('USERS', r.input_oleh);
      o._input_nama = p ? p.nama : r.input_oleh;
      if (r.item_id) { var it = cari_('RAB_ITEM', r.item_id); if (it) o._item = { uraian: it.uraian, satuan: it.satuan, bab_kode: it.bab_kode, vol_final: it.vol_final, cara_ukur: it.cara_ukur }; }
      hasil.push(o);
    });
  });
  hasil.sort(function (a, b) { return String(a.tanggal).localeCompare(String(b.tanggal)); });
  return hasil;
}
