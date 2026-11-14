/**
 * MITRAKONIN Monitor — konfigurasi backend.
 * ATURAN: tidak ada ID akun/Sheet/folder yang ditulis di kode.
 *  - Sheet  : SpreadsheetApp.getActiveSpreadsheet() (script bound)
 *  - Folder : Script Properties ROOT_FOLDER_ID (dibuat oleh setup())
 *  - Pepper : Script Properties PEPPER (dibuat oleh setup())
 *  - Ambang indikator & nilai lain: tab SETTING
 */
var APP = {
  NAMA: 'MITRAKONIN Monitor',
  VERSI: '0.2.0',
  TZ: 'Asia/Jakarta',
  SESI_DETIK: 21600,          // 6 jam, diperpanjang setiap ada panggilan (sliding)
  HASH_ITERASI: 200,
  LOGIN_GAGAL_MAKS: 5,
  LOGIN_KUNCI_DETIK: 900,
  FOLDER_INDUK_NAMA: 'MITRAKONIN Monitor - Data',
  SUBFOLDER: { PROGRES: 'Progres', MATERIAL: 'Material', BIAYA: 'Biaya', TERMIN: 'Termin', RAB: 'RAB', LAPORAN: 'Laporan', CCO: 'CCO' },
  BATAS_UNGGAH_KB: { FOTO: 3072, VIDEO: 40960, DOKUMEN: 15360 },
};

// Urutan kolom resmi (dipakai setup() untuk memeriksa; kode membaca kolom berdasarkan NAMA header).
var SKEMA = {
  USERS: ['user_id', 'nama', 'email', 'no_hp', 'peran', 'proyek_akses', 'password_hash', 'aktif', 'login_terakhir'],
  PROYEK: ['proyek_id', 'kode', 'nama', 'jenis', 'lokasi', 'client_nama', 'client_email', 'nilai_kontrak', 'overhead_pct', 'tgl_mulai', 'durasi_hari', 'tgl_selesai_rencana', 'status', 'project_manager', 'folder_drive_id'],
  RAB_ITEM: ['item_id', 'proyek_id', 'kategori', 'bab_kode', 'bab_nama', 'no_item', 'uraian', 'spesifikasi', 'satuan', 'vol_kontrak', 'harga_kontrak', 'jumlah_kontrak', 'vol_final', 'harga_final', 'jumlah_final', 'status_cco', 'bobot_pct', 'cara_ukur', 'urutan'],
  CCO: ['cco_id', 'proyek_id', 'no_cco', 'tanggal', 'item_id', 'jenis', 'vol_lama', 'vol_baru', 'harga', 'selisih_nilai', 'alasan', 'disetujui_client', 'dokumen_url'],
  JADWAL: ['jadwal_id', 'proyek_id', 'item_id', 'tgl_mulai', 'tgl_selesai', 'pola'],
  PROGRES: ['progres_id', 'proyek_id', 'tanggal', 'item_id', 'volume_hari_ini', 'persen_kumulatif', 'uraian_kegiatan', 'cuaca', 'jumlah_pekerja', 'hambatan_teknis', 'hambatan_nonteknis', 'input_oleh', 'status', 'approve_oleh', 'tgl_approve', 'catatan_approve'],
  MEDIA: ['media_id', 'proyek_id', 'ref_tipe', 'ref_id', 'tipe', 'drive_file_id', 'url', 'lat', 'lng', 'waktu_ambil', 'ukuran_kb'],
  MASTER_MATERIAL: ['kode', 'nama', 'kelompok', 'spesifikasi', 'satuan', 'catatan_pencatatan', 'harga_acuan'],
  MATERIAL_TRX: ['trx_id', 'proyek_id', 'tanggal', 'kode_material', 'jenis', 'qty', 'harga_satuan', 'pemasok', 'no_surat_jalan', 'item_id', 'proyek_tujuan', 'input_oleh', 'status'],
  STOK: ['proyek_id', 'kode_material', 'masuk', 'pakai', 'retur', 'transfer', 'saldo', 'nilai_stok', 'kebutuhan_rab', 'sisa_kebutuhan'],
  BIAYA: ['biaya_id', 'proyek_id', 'tanggal', 'kategori', 'bab_kode', 'uraian', 'nominal', 'dibayar_ke', 'input_oleh', 'status'],
  TERMIN: ['termin_id', 'proyek_id', 'termin_ke', 'syarat_progres_pct', 'persen_nilai', 'nominal', 'tgl_tagih', 'tgl_bayar', 'nominal_diterima', 'status'],
  RISIKO: ['risiko_id', 'proyek_id', 'tanggal', 'kategori', 'deskripsi', 'dampak', 'kemungkinan', 'skor', 'mitigasi', 'pic', 'target_tgl', 'status', 'sumber', 'indikator'],
  LAPORAN: ['laporan_id', 'proyek_id', 'periode_awal', 'periode_akhir', 'prestasi_rencana', 'prestasi_realisasi', 'deviasi', 'pdf_url', 'dikirim_ke', 'tgl_kirim'],
  MASTER_TENAGA: ['kode', 'jabatan', 'kelompok', 'ruang_lingkup'],
  LOG: ['waktu', 'user_id', 'aksi', 'tab', 'record_id', 'nilai_lama', 'nilai_baru'],
  SETTING: ['kunci', 'nilai', 'keterangan'],
};

// Kolom tambahan (ditambahkan di ujung kanan oleh setup(), disetujui Ulul di Tahap 1).
var KOLOM_TAMBAHAN = {
  RAB_ITEM: ['sub_grup', 'supply_owner'],
};

// Kolom kunci (ID) dan awalan ID baru per tab.
var KUNCI = {
  USERS: ['user_id', 'USR'], PROYEK: ['proyek_id', 'PRY'], RAB_ITEM: ['item_id', 'RAB'], CCO: ['cco_id', 'CCO'],
  JADWAL: ['jadwal_id', 'JDW'], PROGRES: ['progres_id', 'PRG'], MEDIA: ['media_id', 'MED'], MATERIAL_TRX: ['trx_id', 'MTX'],
  BIAYA: ['biaya_id', 'BYA'], TERMIN: ['termin_id', 'TRM'], RISIKO: ['risiko_id', 'RSK'], LAPORAN: ['laporan_id', 'LAP'],
  MASTER_MATERIAL: ['kode', null], MASTER_TENAGA: ['kode', null], SETTING: ['kunci', null],
};

var KOLOM_ANGKA = {
  nilai_kontrak: 1, overhead_pct: 1, durasi_hari: 1, vol_kontrak: 1, harga_kontrak: 1, jumlah_kontrak: 1, vol_final: 1, harga_final: 1,
  jumlah_final: 1, bobot_pct: 1, urutan: 1, vol_lama: 1, vol_baru: 1, harga: 1, selisih_nilai: 1, volume_hari_ini: 1, persen_kumulatif: 1,
  jumlah_pekerja: 1, lat: 1, lng: 1, ukuran_kb: 1, harga_acuan: 1, qty: 1, harga_satuan: 1, masuk: 1, pakai: 1, retur: 1, transfer: 1,
  saldo: 1, nilai_stok: 1, kebutuhan_rab: 1, sisa_kebutuhan: 1, nominal: 1, termin_ke: 1, syarat_progres_pct: 1, persen_nilai: 1,
  nominal_diterima: 1, dampak: 1, kemungkinan: 1, skor: 1, prestasi_rencana: 1, prestasi_realisasi: 1, deviasi: 1,
};
// Kolom kode/nomor yang harus tetap teks (jangan diubah Sheets menjadi angka/tanggal).
var KOLOM_TEKS = { no_item: 1, kode: 1, bab_kode: 1, no_cco: 1, no_surat_jalan: 1, no_hp: 1, kode_material: 1, proyek_akses: 1 };
var RE_KOLOM_TANGGAL = /^(tanggal|tgl_|waktu|login_terakhir|target_tgl|periode_)/;

var PILIHAN = {
  peran: ['PENGELOLA', 'ADMIN', 'CLIENT'],
  status_proyek: ['Persiapan', 'Berjalan', 'Ditunda', 'Selesai'],
  kategori_rab: ['Struktur', 'Arsitektur', 'MEP', 'Lain-lain', 'Item Baru'],
  status_cco: ['Tetap', 'Tambah', 'Kurang', 'Baru'],
  jenis_cco: ['Tambah', 'Kurang', 'Baru'],
  cara_ukur: ['volume', 'persen'],
  pola: ['rata', 'custom'],
  status_input: ['Menunggu', 'Disetujui', 'Ditolak'],
  ref_tipe: ['PROGRES', 'MATERIAL', 'BIAYA', 'TERMIN'],
  tipe_media: ['FOTO', 'VIDEO', 'DOKUMEN'],
  jenis_material: ['MASUK', 'PAKAI', 'RETUR', 'TRANSFER'],
  kategori_biaya: ['Upah', 'Alat', 'Operasional', 'Lain'],
  status_termin: ['Belum', 'Ditagih', 'Lunas'],
  kategori_risiko: ['Jadwal', 'Biaya', 'Material', 'Mutu', 'K3', 'Cuaca', 'Client'],
  status_risiko: ['Terbuka', 'Dimitigasi', 'Selesai'],
};

/*
 * HAK BACA per peran: tab -> daftar kolom yang boleh dikirim ke HP.
 * Tab yang tidak tercantum = tidak boleh dibaca peran itu (ditolak di server).
 * PENGELOLA: semua tab & kolom, kecuali password_hash.
 */
var HAK_BACA = {
  ADMIN: {
    PROYEK: ['proyek_id', 'kode', 'nama', 'jenis', 'lokasi', 'client_nama', 'tgl_mulai', 'durasi_hari', 'tgl_selesai_rencana', 'status', 'project_manager'],
    RAB_ITEM: ['item_id', 'proyek_id', 'kategori', 'bab_kode', 'bab_nama', 'no_item', 'uraian', 'spesifikasi', 'satuan', 'vol_final', 'status_cco', 'bobot_pct', 'cara_ukur', 'urutan', 'sub_grup', 'supply_owner'],
    JADWAL: '*', PROGRES: '*', MEDIA: '*', MATERIAL_TRX: '*', BIAYA: '*',
    STOK: ['proyek_id', 'kode_material', 'masuk', 'pakai', 'retur', 'transfer', 'saldo'],
    MASTER_MATERIAL: '*', MASTER_TENAGA: '*',
  },
  CLIENT: {
    PROYEK: ['proyek_id', 'kode', 'nama', 'jenis', 'lokasi', 'client_nama', 'nilai_kontrak', 'tgl_mulai', 'durasi_hari', 'tgl_selesai_rencana', 'status', 'project_manager'],
    RAB_ITEM: ['item_id', 'proyek_id', 'kategori', 'bab_kode', 'bab_nama', 'no_item', 'uraian', 'satuan', 'vol_final', 'bobot_pct', 'cara_ukur', 'urutan', 'sub_grup'],
    JADWAL: ['jadwal_id', 'proyek_id', 'item_id', 'tgl_mulai', 'tgl_selesai'],
    PROGRES: ['progres_id', 'proyek_id', 'tanggal', 'item_id', 'volume_hari_ini', 'persen_kumulatif', 'uraian_kegiatan', 'cuaca', 'jumlah_pekerja', 'hambatan_teknis', 'hambatan_nonteknis', 'status'],
    MEDIA: ['media_id', 'proyek_id', 'ref_tipe', 'ref_id', 'tipe', 'url', 'waktu_ambil'],
    TERMIN: '*',
    CCO: ['cco_id', 'proyek_id', 'no_cco', 'tanggal', 'item_id', 'jenis', 'vol_lama', 'vol_baru', 'selisih_nilai', 'alasan', 'disetujui_client'],
    LAPORAN: ['laporan_id', 'proyek_id', 'periode_awal', 'periode_akhir', 'prestasi_rencana', 'prestasi_realisasi', 'deviasi', 'pdf_url', 'tgl_kirim'],
  },
};

// Tab yang diinput admin lapangan dan wajib approval.
var TAB_APPROVAL = { PROGRES: 'progres_id', MATERIAL_TRX: 'trx_id', BIAYA: 'biaya_id' };
// Kolom yang boleh diisi admin saat input/edit (sisanya diisi server).
var KOLOM_INPUT_ADMIN = {
  PROGRES: ['proyek_id', 'tanggal', 'item_id', 'volume_hari_ini', 'persen_kumulatif', 'uraian_kegiatan', 'cuaca', 'jumlah_pekerja', 'hambatan_teknis', 'hambatan_nonteknis'],
  MATERIAL_TRX: ['proyek_id', 'tanggal', 'kode_material', 'jenis', 'qty', 'harga_satuan', 'pemasok', 'no_surat_jalan', 'item_id', 'proyek_tujuan'],
  BIAYA: ['proyek_id', 'tanggal', 'kategori', 'bab_kode', 'uraian', 'nominal', 'dibayar_ke'],
};
// Kolom RAB kontrak terkunci setelah import. Nilai final hanya berubah lewat CCO.
var KOLOM_RAB_TERKUNCI = ['item_id', 'proyek_id', 'kategori', 'bab_kode', 'bab_nama', 'no_item', 'uraian', 'satuan', 'vol_kontrak', 'harga_kontrak', 'jumlah_kontrak', 'vol_final', 'harga_final', 'jumlah_final', 'status_cco', 'bobot_pct', 'supply_owner'];
