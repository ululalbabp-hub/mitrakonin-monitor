/**
 * Perhitungan dashboard. Hanya data berstatus Disetujui yang dihitung.
 *
 * Bobot_i     = jumlah_final_i / Σ jumlah_final × 100   (tanpa supply-by-owner)
 * Progres_i   = min(Σ volume disetujui / vol_final, 1); item persen: persen kumulatif terakhir / 100
 * Realisasi   = Σ bobot × progres;  Rencana(t) = Σ bobot × fraksi jadwal(t) (hanya jika ada jadwal)
 * Deviasi     = realisasi − rencana
 * Nilai terpasang = Σ jumlah_final × progres
 * Biaya aktual    = Σ(qty MASUK × harga) + Σ BIAYA   (disetujui)
 * Indeks biaya    = nilai terpasang / biaya aktual
 * Stok        = masuk − pakai − retur − transfer keluar + transfer masuk; laju pakai = rata-rata 7 hari
 */
function benar_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function bulat_(x, d) { var p = Math.pow(10, d === undefined ? 2 : d); return Math.round((Number(x) || 0) * p) / p; }

function itemProyek_(pid) {
  return rows_('RAB_ITEM').filter(function (r) { return String(r.proyek_id) === String(pid) && !benar_(r.supply_owner); });
}

/** Hitung ulang & simpan bobot_pct untuk satu proyek (dipanggil setelah import/CCO). */
function simpanBobot_(pid) {
  var items = itemProyek_(pid);
  var total = items.reduce(function (s, r) { return s + (Number(r.jumlah_final) || 0); }, 0);
  var sh = sheet_('RAB_ITEM'), hdr = baca_('RAB_ITEM').header, c = hdr.indexOf('bobot_pct') + 1;
  items.forEach(function (r) { sh.getRange(r._baris, c).setValue(total ? (Number(r.jumlah_final) || 0) / total * 100 : 0); });
  bersihCache_('RAB_ITEM');
}

/** Progres per item sampai tanggal t (yyyy-MM-dd, inklusif). Mengembalikan {item_id: fraksi 0..1} */
function progresItem_(items, progres, t) {
  var hasil = {}, perItem = {};
  progres.forEach(function (p) {
    if (p.status !== 'Disetujui') return;
    if (t && String(p.tanggal).slice(0, 10) > t) return;
    (perItem[p.item_id] = perItem[p.item_id] || []).push(p);
  });
  items.forEach(function (it) {
    var list = perItem[it.item_id] || [];
    var f = 0;
    if (it.cara_ukur === 'persen') {
      var terakhir = null;
      list.forEach(function (p) { if (!terakhir || String(p.tanggal) >= String(terakhir.tanggal)) terakhir = p; });
      f = terakhir ? (Number(terakhir.persen_kumulatif) || 0) / 100 : 0;
    } else {
      var vol = list.reduce(function (s, p) { return s + (Number(p.volume_hari_ini) || 0); }, 0);
      f = Number(it.vol_final) > 0 ? vol / Number(it.vol_final) : 0;
    }
    hasil[it.item_id] = Math.max(0, Math.min(1, f));
  });
  return hasil;
}

/** Fraksi rencana item pada tanggal t menurut jadwal (pola rata; custom dihitung rata sampai ada kurva custom). */
function fraksiJadwal_(j, t) {
  if (!j) return 0;
  var total = selisihHari_(j.tgl_mulai, j.tgl_selesai) + 1;
  var jalan = selisihHari_(j.tgl_mulai, t) + 1;
  if (total <= 0) return jalan > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, jalan / total));
}

function warna_(nilai, fn) { return nilai === null || nilai === undefined || isNaN(nilai) ? { nilai: null, warna: 'Abu' } : { nilai: bulat_(nilai, 3), warna: fn(nilai) }; }

/** Indikator dengan ambang dari tab SETTING. */
function indikator_(s, x) {
  var A = function (k, def) { var v = angka_(s[k]); return v === null ? def : v; };
  var dK = A('ambang_deviasi_kuning', 0), dM = A('ambang_deviasi_merah', -5);
  var iH = A('ambang_indeks_biaya_hijau', 1), iM = A('ambang_indeks_biaya_merah', 0.9);
  var sK = A('ambang_serapan_kuning', 5), sM = A('ambang_serapan_merah', 10);
  var stK = A('ambang_stok_kuning_hari', 7), stM = A('ambang_stok_merah_hari', 3);
  var lK = A('ambang_laporan_kuning_hari', 2), lM = A('ambang_laporan_merah_hari', 7);
  var tM = A('ambang_termin_merah_hari', 14), aM = A('ambang_approval_merah_hari', 3);
  return {
    deviasi: warna_(x.deviasi, function (v) { return v >= dK ? 'Hijau' : v >= dM ? 'Kuning' : 'Merah'; }),
    indeks_biaya: warna_(x.indeks_biaya, function (v) { return v >= iH ? 'Hijau' : v >= iM ? 'Kuning' : 'Merah'; }),
    serapan: warna_(x.selisih_serapan, function (v) { return v <= sK ? 'Hijau' : v <= sM ? 'Kuning' : 'Merah'; }),
    stok: warna_(x.stok_hari_min, function (v) { return v > stK ? 'Hijau' : v >= stM ? 'Kuning' : 'Merah'; }),
    laporan: warna_(x.hari_sejak_laporan, function (v) { return v <= lK ? 'Hijau' : v <= lM ? 'Kuning' : 'Merah'; }),
    termin: warna_(x.termin_telat_hari, function (v) { return v <= 0 ? 'Hijau' : v <= tM ? 'Kuning' : 'Merah'; }),
    approval: warna_(x.approval_umur_hari, function (v) { return v <= 1 ? 'Hijau' : v <= aM ? 'Kuning' : 'Merah'; }),
  };
}

/** Semua angka satu proyek (versi lengkap untuk pengelola). */
function hitungProyek_(pid, opsi) {
  opsi = opsi || {};
  var p = cari_('PROYEK', pid);
  if (!p) throw galat_('TIDAK_ADA', 'Proyek tidak ditemukan.');
  var s = setting_(), today = opsi.tanggal || hariIni_();
  var items = itemProyek_(pid);
  var semuaProgres = rows_('PROGRES').filter(function (r) { return r.proyek_id === pid; });
  var jadwal = {}, adaJadwal = false;
  rows_('JADWAL').forEach(function (j) { if (j.proyek_id === pid) { jadwal[j.item_id] = j; adaJadwal = true; } });

  var totalFinal = items.reduce(function (a, r) { return a + (Number(r.jumlah_final) || 0); }, 0);
  var totalKontrak = items.reduce(function (a, r) { return a + (Number(r.jumlah_kontrak) || 0); }, 0);
  var bobot = {};
  items.forEach(function (r) { bobot[r.item_id] = totalFinal ? (Number(r.jumlah_final) || 0) / totalFinal * 100 : 0; });

  var prog = progresItem_(items, semuaProgres, today);
  var realisasi = 0, rencana = 0, terpasang = 0, tanpaJadwal = 0;
  items.forEach(function (r) {
    realisasi += bobot[r.item_id] * prog[r.item_id];
    terpasang += (Number(r.jumlah_final) || 0) * prog[r.item_id];
    if (adaJadwal) { if (jadwal[r.item_id]) rencana += bobot[r.item_id] * fraksiJadwal_(jadwal[r.item_id], today); else tanpaJadwal++; }
  });

  // Biaya aktual (material MASUK + BIAYA, disetujui), dikelompokkan per bab
  var babItem = {};
  items.forEach(function (r) { babItem[r.item_id] = r.bab_kode; });
  var biayaBab = {}, biayaMaterial = 0, biayaLain = 0, biayaKategori = { Material: 0, Upah: 0, Alat: 0, Operasional: 0, Lain: 0 };
  rows_('MATERIAL_TRX').forEach(function (m) {
    if (m.proyek_id !== pid || m.status !== 'Disetujui' || m.jenis !== 'MASUK') return;
    var v = (Number(m.qty) || 0) * (Number(m.harga_satuan) || 0);
    biayaMaterial += v; biayaKategori.Material += v;
    var b = (m.item_id && babItem[m.item_id]) || '(tanpa bab)';
    biayaBab[b] = (biayaBab[b] || 0) + v;
  });
  rows_('BIAYA').forEach(function (b) {
    if (b.proyek_id !== pid || b.status !== 'Disetujui') return;
    var v = Number(b.nominal) || 0;
    biayaLain += v; biayaKategori[b.kategori] = (biayaKategori[b.kategori] || 0) + v;
    var k = b.bab_kode || '(tanpa bab)';
    biayaBab[k] = (biayaBab[k] || 0) + v;
  });
  var biaya = biayaMaterial + biayaLain;
  var serapan = totalFinal ? biaya / totalFinal * 100 : 0;

  // Per bab
  var perBab = {}, urutBab = [];
  items.forEach(function (r) {
    var b = perBab[r.bab_kode];
    if (!b) { b = perBab[r.bab_kode] = { bab_kode: r.bab_kode, bab_nama: r.bab_nama, kategori: r.kategori, bobot: 0, realisasi: 0, rencana: 0, rab_final: 0, rab_kontrak: 0, nilai_terpasang: 0, biaya_aktual: 0, jumlah_item: 0 }; urutBab.push(r.bab_kode); }
    b.bobot += bobot[r.item_id]; b.realisasi += bobot[r.item_id] * prog[r.item_id];
    if (adaJadwal) b.rencana += bobot[r.item_id] * fraksiJadwal_(jadwal[r.item_id], today);
    b.rab_final += Number(r.jumlah_final) || 0; b.rab_kontrak += Number(r.jumlah_kontrak) || 0;
    b.nilai_terpasang += (Number(r.jumlah_final) || 0) * prog[r.item_id]; b.jumlah_item++;
  });
  var listBab = urutBab.map(function (k) {
    var b = perBab[k];
    b.biaya_aktual = biayaBab[k] || 0;
    b.progres_bab_pct = b.bobot ? b.realisasi / b.bobot * 100 : 0;
    ['bobot', 'realisasi', 'rencana', 'progres_bab_pct'].forEach(function (x) { b[x] = bulat_(b[x], 3); });
    ['rab_final', 'rab_kontrak', 'nilai_terpasang', 'biaya_aktual'].forEach(function (x) { b[x] = Math.round(b[x]); });
    return b;
  });
  if (biayaBab['(tanpa bab)']) listBab.push({ bab_kode: '(tanpa bab)', bab_nama: 'Biaya tanpa bab', biaya_aktual: Math.round(biayaBab['(tanpa bab)']) });

  // Kurva S mingguan
  var kurva = [];
  if (p.tgl_mulai && items.length) {
    var akhir = p.tgl_selesai_rencana || tambahHari_(p.tgl_mulai, (Number(p.durasi_hari) || 90) - 1);
    if (today > akhir) akhir = today;
    var maxTitik = 120, langkah = Math.max(7, Math.ceil((selisihHari_(p.tgl_mulai, akhir) + 1) / maxTitik / 7) * 7);
    for (var t = p.tgl_mulai; t <= akhir; t = tambahHari_(t, langkah)) kurva.push(titikKurva_(t));
    if (!kurva.length || kurva[kurva.length - 1].tanggal !== akhir) kurva.push(titikKurva_(akhir));
    if (today >= p.tgl_mulai && today < akhir && !kurva.some(function (k) { return k.tanggal === today; })) { kurva.push(titikKurva_(today)); kurva.sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : 1; }); }
  }
  function titikKurva_(t) {
    var o = { tanggal: t, rencana: null, realisasi: null };
    if (adaJadwal) o.rencana = bulat_(items.reduce(function (a, r) { return a + bobot[r.item_id] * fraksiJadwal_(jadwal[r.item_id], t); }, 0), 3);
    if (t <= today) { var pr = progresItem_(items, semuaProgres, t); o.realisasi = bulat_(items.reduce(function (a, r) { return a + bobot[r.item_id] * pr[r.item_id]; }, 0), 3); }
    return o;
  }

  // Stok
  var stok = stokProyek_(pid, today);
  var stokMin = null;
  stok.forEach(function (x) { if (x.hari_cukup !== null && (stokMin === null || x.hari_cukup < stokMin)) stokMin = x.hari_cukup; });

  // Termin
  var termin = rows_('TERMIN').filter(function (r) { return r.proyek_id === pid; }).map(bersihObjek_)
    .sort(function (a, b) { return Number(a.termin_ke) - Number(b.termin_ke); });
  var telatMaks = null;
  termin.forEach(function (tr) {
    tr.siap_ditagih = tr.status === 'Belum' && realisasi >= (Number(tr.syarat_progres_pct) || 0);
    tr.telat_hari = tr.status === 'Ditagih' && tr.tgl_tagih ? Math.max(0, selisihHari_(tr.tgl_tagih, today)) : 0;
    if (tr.status === 'Ditagih') telatMaks = Math.max(telatMaks || 0, tr.telat_hari);
  });
  var diterima = termin.reduce(function (a, r) { return a + (Number(r.nominal_diterima) || 0); }, 0);

  // Laporan progres terakhir & antrian approval
  var tglTerakhir = null;
  semuaProgres.forEach(function (r) { if (r.status !== 'Ditolak' && (!tglTerakhir || String(r.tanggal) > tglTerakhir)) tglTerakhir = String(r.tanggal).slice(0, 10); });
  var menunggu = { PROGRES: 0, MATERIAL_TRX: 0, BIAYA: 0 }, umurMaks = null;
  Object.keys(TAB_APPROVAL).forEach(function (tab) {
    rows_(tab).forEach(function (r) {
      if (r.proyek_id !== pid || r.status !== 'Menunggu') return;
      menunggu[tab]++;
      var umur = selisihHari_(r.tanggal, today);
      if (umurMaks === null || umur > umurMaks) umurMaks = umur;
    });
  });

  var ring = {
    nilai_kontrak: Number(p.nilai_kontrak) || 0, overhead_pct: Number(p.overhead_pct) || 0,
    rab_kontrak: Math.round(totalKontrak), rab_final: Math.round(totalFinal), jumlah_item: items.length,
    realisasi_pct: bulat_(realisasi, 3), rencana_pct: adaJadwal ? bulat_(rencana, 3) : null, deviasi: adaJadwal ? bulat_(realisasi - rencana, 3) : null,
    ada_jadwal: adaJadwal, item_tanpa_jadwal: adaJadwal ? tanpaJadwal : 0,
    nilai_terpasang: Math.round(terpasang), biaya_aktual: Math.round(biaya), biaya_material: Math.round(biayaMaterial), biaya_lain: Math.round(biayaLain),
    biaya_per_kategori: biayaKategori, indeks_biaya: biaya ? bulat_(terpasang / biaya, 3) : null,
    serapan_pct: bulat_(serapan, 3), selisih_serapan: bulat_(serapan - realisasi, 3),
    termin_diterima: Math.round(diterima), hari_sejak_laporan: tglTerakhir ? selisihHari_(tglTerakhir, today) : null, laporan_terakhir: tglTerakhir,
    menunggu: menunggu, approval_umur_hari: umurMaks,
  };
  var ind = indikator_(s, {
    deviasi: ring.deviasi, indeks_biaya: ring.indeks_biaya, selisih_serapan: biaya ? ring.selisih_serapan : null, stok_hari_min: stokMin,
    hari_sejak_laporan: ring.hari_sejak_laporan, termin_telat_hari: telatMaks, approval_umur_hari: umurMaks,
  });
  var linimasa = semuaProgres.filter(function (r) { return r.status === 'Disetujui'; })
    .sort(function (a, b) { return String(b.tanggal).localeCompare(String(a.tanggal)); }).slice(0, opsi.linimasa || 30)
    .map(function (r) { var it = cari_('RAB_ITEM', r.item_id); var o = bersihObjek_(r); o.uraian_item = it ? it.uraian : ''; o.satuan = it ? it.satuan : ''; return o; });

  return {
    proyek: bersihObjek_(p), tanggal: today, ringkas: ring, indikator: ind, per_bab: listBab, kurva_s: kurva,
    stok: stok, termin: termin, linimasa: linimasa,
    progres_item: items.map(function (r) { return { item_id: r.item_id, bab_kode: r.bab_kode, no_item: r.no_item, uraian: r.uraian, satuan: r.satuan, vol_final: r.vol_final, cara_ukur: r.cara_ukur, bobot: bulat_(bobot[r.item_id], 4), progres_pct: bulat_(prog[r.item_id] * 100, 2) }; }),
  };
}

/** Versi aman untuk CLIENT: tanpa biaya, harga beli, stok, risiko, dan analisis internal. */
function untukClient_(h) {
  var r = h.ringkas;
  return {
    proyek: saringBaca_({ peran: 'CLIENT', user_id: '-', proyek_akses: h.proyek.proyek_id, email: '' }, 'PROYEK', [h.proyek])[0] || {},
    tanggal: h.tanggal,
    ringkas: { nilai_kontrak: r.nilai_kontrak, realisasi_pct: r.realisasi_pct, rencana_pct: r.rencana_pct, deviasi: r.deviasi, ada_jadwal: r.ada_jadwal, laporan_terakhir: r.laporan_terakhir, termin_diterima: r.termin_diterima },
    indikator: { deviasi: h.indikator.deviasi },
    per_bab: h.per_bab.filter(function (b) { return b.bobot !== undefined; }).map(function (b) { return { bab_kode: b.bab_kode, bab_nama: b.bab_nama, kategori: b.kategori, bobot: b.bobot, realisasi: b.realisasi, rencana: b.rencana, progres_bab_pct: b.progres_bab_pct }; }),
    kurva_s: h.kurva_s,
    termin: h.termin.map(function (t) { return { termin_id: t.termin_id, termin_ke: t.termin_ke, syarat_progres_pct: t.syarat_progres_pct, persen_nilai: t.persen_nilai, nominal: t.nominal, tgl_tagih: t.tgl_tagih, tgl_bayar: t.tgl_bayar, nominal_diterima: t.nominal_diterima, status: t.status }; }),
    linimasa: h.linimasa.map(function (x) { return { progres_id: x.progres_id, tanggal: x.tanggal, item_id: x.item_id, uraian_item: x.uraian_item, satuan: x.satuan, volume_hari_ini: x.volume_hari_ini, persen_kumulatif: x.persen_kumulatif, uraian_kegiatan: x.uraian_kegiatan, cuaca: x.cuaca, jumlah_pekerja: x.jumlah_pekerja }; }),
    progres_item: h.progres_item.map(function (x) { return { item_id: x.item_id, bab_kode: x.bab_kode, no_item: x.no_item, uraian: x.uraian, satuan: x.satuan, bobot: x.bobot, progres_pct: x.progres_pct }; }),
  };
}

/** Versi untuk ADMIN lapangan: progres & stok qty, tanpa keuangan. */
function untukAdmin_(h) {
  var c = untukClient_(h);
  c.proyek = saringBaca_({ peran: 'ADMIN', user_id: '-', proyek_akses: h.proyek.proyek_id }, 'PROYEK', [h.proyek])[0] || {};
  c.ringkas.nilai_kontrak = undefined;
  c.termin = undefined;
  c.ringkas.menunggu = h.ringkas.menunggu;
  c.ringkas.hari_sejak_laporan = h.ringkas.hari_sejak_laporan;
  c.indikator.laporan = h.indikator.laporan;
  c.stok = h.stok.map(function (x) { return { kode_material: x.kode_material, nama: x.nama, satuan: x.satuan, saldo: x.saldo, laju_pakai: x.laju_pakai, hari_cukup: x.hari_cukup, warna: x.warna }; });
  c.progres_item = h.progres_item.map(function (x) { return { item_id: x.item_id, bab_kode: x.bab_kode, no_item: x.no_item, uraian: x.uraian, satuan: x.satuan, vol_final: x.vol_final, cara_ukur: x.cara_ukur, progres_pct: x.progres_pct }; });
  return c;
}

/** Aksi dashboardProyek {proyek_id} -> versi sesuai peran. */
function dashboardProyek_(u, d) {
  wajibProyek_(u, d.proyek_id);
  var h = hitungProyek_(d.proyek_id);
  if (u.peran === 'PENGELOLA') {
    try { h.risiko_baru = cekRisikoOtomatis_(d.proyek_id, h); } catch (e) { console.error('risiko: ' + e); }
    h.risiko = rows_('RISIKO').filter(function (r) { return r.proyek_id === d.proyek_id; }).map(bersihObjek_);
    return h;
  }
  return u.peran === 'CLIENT' ? untukClient_(h) : untukAdmin_(h);
}

/** Aksi dashboard: ringkasan semua proyek yang boleh diakses. */
function dashboard_(u) {
  var list = daftarProyekUser_(u).map(function (pid) {
    var h = hitungProyek_(pid, { linimasa: 3 });
    if (u.peran === 'PENGELOLA') { try { cekRisikoOtomatis_(pid, h); } catch (e) { console.error('risiko: ' + e); } }
    if (u.peran === 'PENGELOLA') return { proyek: h.proyek, ringkas: h.ringkas, indikator: h.indikator, risiko_terbuka: rows_('RISIKO').filter(function (r) { return r.proyek_id === pid && r.status === 'Terbuka'; }).length };
    var v = u.peran === 'CLIENT' ? untukClient_(h) : untukAdmin_(h);
    return { proyek: v.proyek, ringkas: v.ringkas, indikator: v.indikator };
  });
  var hasil = { proyek: list, tanggal: hariIni_() };
  if (u.peran === 'PENGELOLA') hasil.menunggu_total = list.reduce(function (a, x) { var m = x.ringkas.menunggu; return a + m.PROGRES + m.MATERIAL_TRX + m.BIAYA; }, 0);
  if (u.peran === 'ADMIN') {
    hasil.input_saya = Object.keys(TAB_APPROVAL).reduce(function (a, tab) {
      a[tab] = rows_(tab).filter(function (r) { return r.input_oleh === u.user_id; }).reduce(function (c, r) { c[r.status] = (c[r.status] || 0) + 1; return c; }, {});
      return a;
    }, {});
  }
  return hasil;
}

// ---------- STOK ----------
function saldoMaterial_(pid, kode, kecualiTrx) {
  var s = 0;
  rows_('MATERIAL_TRX').forEach(function (m) {
    if (m.status !== 'Disetujui' || m.kode_material !== kode || m.trx_id === kecualiTrx) return;
    var q = Number(m.qty) || 0;
    if (m.proyek_id === pid) { if (m.jenis === 'MASUK') s += q; else s -= q; }
    else if (m.jenis === 'TRANSFER' && m.proyek_tujuan === pid) s += q;
  });
  return s;
}

function stokProyek_(pid, today) {
  today = today || hariIni_();
  var s = setting_(), batas7 = tambahHari_(today, -6);
  var stK = angka_(s.ambang_stok_kuning_hari), stM = angka_(s.ambang_stok_merah_hari);
  if (stK === null) stK = 7; if (stM === null) stM = 3;
  var per = {};
  function g(kode) { return per[kode] = per[kode] || { proyek_id: pid, kode_material: kode, masuk: 0, pakai: 0, retur: 0, transfer: 0, transfer_masuk: 0, nilai_masuk: 0, pakai7: 0 }; }
  rows_('MATERIAL_TRX').forEach(function (m) {
    if (m.status !== 'Disetujui') return;
    var q = Number(m.qty) || 0;
    if (m.proyek_id === pid) {
      var x = g(m.kode_material);
      if (m.jenis === 'MASUK') { x.masuk += q; x.nilai_masuk += q * (Number(m.harga_satuan) || 0); }
      else if (m.jenis === 'PAKAI') { x.pakai += q; if (String(m.tanggal).slice(0, 10) >= batas7 && String(m.tanggal).slice(0, 10) <= today) x.pakai7 += q; }
      else if (m.jenis === 'RETUR') x.retur += q;
      else if (m.jenis === 'TRANSFER') x.transfer += q;
    } else if (m.jenis === 'TRANSFER' && m.proyek_tujuan === pid) {
      g(m.kode_material).transfer_masuk += q;
    }
  });
  return Object.keys(per).map(function (k) {
    var x = per[k], mm = cari_('MASTER_MATERIAL', k) || {};
    var saldo = x.masuk - x.pakai - x.retur - x.transfer + x.transfer_masuk;
    var hargaRata = x.masuk ? x.nilai_masuk / x.masuk : (Number(mm.harga_acuan) || 0);
    var laju = x.pakai7 / 7;
    var hari = laju > 0 ? saldo / laju : null;
    return {
      proyek_id: pid, kode_material: k, nama: mm.nama || k, satuan: mm.satuan || '',
      masuk: bulat_(x.masuk, 3), pakai: bulat_(x.pakai, 3), retur: bulat_(x.retur, 3), transfer: bulat_(x.transfer - x.transfer_masuk, 3),
      saldo: bulat_(saldo, 3), nilai_stok: Math.round(Math.max(0, saldo) * hargaRata), kebutuhan_rab: '', sisa_kebutuhan: '',
      laju_pakai: bulat_(laju, 3), hari_cukup: hari === null ? null : bulat_(hari, 1),
      warna: hari === null ? 'Abu' : hari > stK ? 'Hijau' : hari >= stM ? 'Kuning' : 'Merah',
    };
  });
}

/** Tulis ulang tab STOK untuk semua proyek (kolom transfer = keluar − masuk). */
function hitungStokSemua_() {
  var semua = [];
  rows_('PROYEK').forEach(function (p) { semua = semua.concat(stokProyek_(p.proyek_id)); });
  gantiIsi_('STOK', semua);
  return semua.length;
}
