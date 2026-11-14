/**
 * Laporan progres bulanan (PDF) mengikuti format laporan MITRAKONIN:
 * cover · laporan umum (data proyek, evaluasi, waktu, pekerjaan bulan ini, hambatan, tanda tangan)
 * · rekapitulasi per bab · detail per item · Kurva S (jika ada jadwal) · status termin · dokumentasi foto.
 * Hanya data Disetujui. Biaya aktual & harga beli TIDAK pernah masuk laporan client.
 *
 * Periode: mengikuti tanggal mulai proyek (mis. mulai 29 Sep -> 29 Sep–28 Okt, 29 Okt–28 Nov, ...).
 * Bisa diatur: SETTING "tgl_kirim_laporan" (semua proyek) atau "tgl_laporan_<KODE>" (per proyek) = tanggal awal periode (1–28).
 * Dikirim H+1 setelah periode berakhir oleh trigger harian triggerLaporan (lihat 60_Setup.js).
 */
var BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function tglIndo_(s) { if (!s) return '-'; var d = keTanggal_(String(s).slice(0, 10)); var x = Utilities.formatDate(d, APP.TZ, 'd-M-yyyy').split('-'); return x[0] + ' ' + BULAN_ID[Number(x[1]) - 1] + ' ' + x[2]; }
function tglPendek_(s) { return s ? Utilities.formatDate(keTanggal_(String(s).slice(0, 10)), APP.TZ, 'dd/MM/yyyy') : '-'; }
function esc_(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function f2_(n, d) { d = d === undefined ? 2 : d; var x = (Number(n) || 0).toFixed(d).split('.'); return x[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + x[1] : ''); }

/** Tanggal awal periode (1–28) untuk proyek. */
function hariPeriode_(p, s) {
  var k = s['tgl_laporan_' + p.kode], g = s.tgl_kirim_laporan;
  var n = angka_(k !== undefined && k !== '' ? k : g);
  if (n && n >= 1 && n <= 28) return n;
  return Number(String(p.tgl_mulai).slice(8, 10));
}
/** Daftar periode [awal, akhir] sejak mulai proyek sampai tanggal t. */
function daftarPeriode_(p, t) {
  var s = setting_(), hari = hariPeriode_(p, s), hasil = [];
  if (!p.tgl_mulai) return hasil;
  var mulai = String(p.tgl_mulai).slice(0, 10);
  var y = Number(mulai.slice(0, 4)), m = Number(mulai.slice(5, 7));
  var awal = mulai;
  for (var i = 0; i < 60; i++) {
    // batas periode berikut = tanggal "hari" pada bulan berikutnya
    var m2 = m + 1 + i, y2 = y + Math.floor((m2 - 1) / 12); m2 = ((m2 - 1) % 12) + 1;
    var hariMaks = new Date(y2, m2, 0).getDate(); // jumlah hari bulan itu (mis. Februari 28)
    var batas = y2 + '-' + ('0' + m2).slice(-2) + '-' + ('0' + Math.min(hari, hariMaks)).slice(-2);
    if (batas <= awal) continue;
    var akhir = tambahHari_(batas, -1);
    hasil.push([awal, akhir]);
    if (akhir >= t) break;
    awal = batas;
  }
  return hasil;
}

/** Ambil gambar Drive sebagai data URI (null jika gagal). */
function dataUri_(fileId, maksByte) {
  try {
    var f = DriveApp.getFileById(fileId), b = f.getBlob();
    if (maksByte && b.getBytes().length > maksByte) { var t = f.getThumbnail(); if (t) b = t; }
    return 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
  } catch (e) { return null; }
}
function logoUri_() {
  var id = String(setting_().logo_url || '').match(/[-\w]{25,}/);
  return id ? dataUri_(id[0]) : null;
}

/** Kurva S sebagai gambar PNG (Charts); null bila layanan grafik tidak tersedia. */
function grafikKurva_(kurva) {
  try {
    var dt = Charts.newDataTable().addColumn(Charts.ColumnType.STRING, 'Tanggal').addColumn(Charts.ColumnType.NUMBER, 'Rencana').addColumn(Charts.ColumnType.NUMBER, 'Realisasi');
    kurva.forEach(function (k) { dt.addRow([tglPendek_(k.tanggal), k.rencana === null ? 0 : k.rencana, k.realisasi === null ? null : k.realisasi]); });
    var c = Charts.newLineChart().setDataTable(dt.build()).setDimensions(900, 380).setColors(['#C98A12', '#1F4E8C'])
      .setRange(0, 100).setTitle('Kurva S (%)').setLegendPosition(Charts.Position.BOTTOM).build();
    return 'data:image/png;base64,' + Utilities.base64Encode(c.getAs('image/png').getBytes());
  } catch (e) { console.warn('Kurva S: ' + e); return null; }
}

/** Susun HTML laporan untuk proyek & periode. */
function htmlLaporan_(pid, awal, akhir, nomor) {
  var p = cari_('PROYEK', pid), s = setting_();
  var h = hitungProyek_(pid, { tanggal: akhir, linimasa: 500 });
  var r = h.ringkas;
  var prog = rows_('PROGRES').filter(function (x) { return x.proyek_id === pid && x.status === 'Disetujui' && String(x.tanggal).slice(0, 10) >= awal && String(x.tanggal).slice(0, 10) <= akhir; });
  var bersih = function (t) { return String(t || '').replace(/\s*\(contoh[^)]*\)/gi, ' (contoh)').trim(); };
  var kegiatan = [], hamT = [], hamN = [], sudah = {};
  prog.sort(function (a, b) { return String(a.tanggal).localeCompare(String(b.tanggal)); }).forEach(function (x) {
    var k = bersih(x.uraian_kegiatan); if (k && !sudah[k]) { sudah[k] = 1; kegiatan.push(k); }
    if (x.hambatan_teknis && hamT.indexOf(x.hambatan_teknis) < 0) hamT.push(x.hambatan_teknis);
    if (x.hambatan_nonteknis && hamN.indexOf(x.hambatan_nonteknis) < 0) hamN.push(x.hambatan_nonteknis);
  });
  // pembuat laporan = admin yang paling banyak menginput di periode ini
  var hit = {}; prog.forEach(function (x) { hit[x.input_oleh] = (hit[x.input_oleh] || 0) + 1; });
  var pembuatId = Object.keys(hit).sort(function (a, b) { return hit[b] - hit[a]; })[0];
  var pembuat = pembuatId && cari_('USERS', pembuatId);
  var hariJalan = selisihHari_(p.tgl_mulai, akhir) + 1, durasi = Number(p.durasi_hari) || 0;
  var logo = logoUri_(), nama = s.nama_perusahaan || 'MITRAKONIN';
  var logoImg = function (w) { return logo ? '<img src="' + logo + '" style="width:' + w + 'px">' : '<b style="font-size:20px;color:#0B2149">' + esc_(nama) + '</b>'; };
  var kurva = r.ada_jadwal ? grafikKurva_(h.kurva_s.filter(function (k) { return k.tanggal <= akhir || k.rencana !== null; })) : null;

  // Foto periode ini (maks 20, merata)
  var idProg = {}; prog.forEach(function (x) { idProg[x.progres_id] = x; });
  var foto = rows_('MEDIA').filter(function (m) { return m.ref_tipe === 'PROGRES' && m.tipe === 'FOTO' && idProg[m.ref_id]; })
    .sort(function (a, b) { return String(a.waktu_ambil).localeCompare(String(b.waktu_ambil)); });
  if (foto.length > 20) { var step = foto.length / 20, pilih = []; for (var i = 0; i < 20; i++) pilih.push(foto[Math.floor(i * step)]); foto = pilih; }
  var itemNama = {}; rows_('RAB_ITEM').forEach(function (it) { if (it.proyek_id === pid) itemNama[it.item_id] = it.uraian; });

  var css = '<style>@page{size:A4;margin:14mm 12mm}body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#13203A}' +
    'h1{font-size:17px;font-style:italic;text-align:center;margin:6px 0}h2{font-size:14px;margin:0 0 6px}' +
    'table{border-collapse:collapse;width:100%;font-size:10.5px}td,th{border:1px solid #9AA6BC;padding:3px 5px;vertical-align:top}th{background:#E8ECF3}' +
    '.n{text-align:right;white-space:nowrap}.c{text-align:center}.bab td{font-weight:bold;background:#F4F6FA}.tot td{font-weight:bold;background:#DDE3EE}' +
    '.pg{page-break-before:always}.pita{height:16px;background:#F2A91E;margin:10px 0}.pita b{display:block;height:16px;width:22%;background:#1F4E8C;float:right}' +
    '.kv td{border:0;padding:2px 4px}.foto td{text-align:center;width:50%;border:1px solid #9AA6BC}.foto img{width:180px;height:240px;object-fit:cover}</style>';

  var cover = '<div style="text-align:center">' + logoImg(150) + '<div style="margin:6px 0;font-weight:bold">' + esc_(p.lokasi) + '</div></div>' +
    '<div class="pita"><b></b></div>' +
    '<h1>LAPORAN PROGRES BULANAN PROYEK ' + esc_(String(p.nama).toUpperCase()) + '</h1><div class="c"><b>LOKASI</b><br>' + esc_(p.lokasi) + '</div>' +
    '<div style="margin:40px 0 40px 170px;font-size:18px;font-style:italic;font-weight:bold">Periode : ' + tglIndo_(awal) + '<br><span style="margin-left:92px">' + tglIndo_(akhir) + '</span></div>' +
    '<table class="kv" style="width:80%;margin:30px auto"><tr><td style="width:120px">Pemberi tugas</td><td>: ' + esc_(p.client_nama) + '</td></tr><tr><td>Pekerjaan</td><td>: ' + esc_(String(p.nama).toUpperCase()) + '</td></tr>' +
    '<tr><td>Laporan ke</td><td>: ' + nomor + '</td></tr><tr><td>Nilai kontrak</td><td>: Rp ' + f2_(p.nilai_kontrak, 2) + '</td></tr></table>' +
    '<div class="pita" style="margin-top:120px"><b></b></div><div class="c" style="font-weight:bold">DIBUAT OLEH<br>KONTRAKTOR PELAKSANA<br>' + logoImg(130) + '</div>';

  var umum = '<div class="pg"><table><tr><td style="width:120px;border-right:0">' + logoImg(100) + '</td><td class="c" style="border-left:0"><h2 style="font-size:18px;font-style:italic">LAPORAN UMUM</h2></td>' +
    '<td style="width:170px">PERIODE LAPORAN<br>' + tglIndo_(awal) + ' s/d ' + tglIndo_(akhir) + '<br>TANGGAL LAPORAN<br>' + tglIndo_(tambahHari_(akhir, 1)) + '</td></tr></table>' +
    '<table><tr><td style="width:130px">Nama Proyek</td><td>' + esc_(p.nama) + '</td></tr><tr><td>Lokasi</td><td>' + esc_(p.lokasi) + '</td></tr>' +
    '<tr><td>Periode Laporan</td><td>' + tglPendek_(awal) + ' - ' + tglPendek_(akhir) + '</td></tr><tr><td>Tahapan Pekerjaan</td><td>' + esc_(h.per_bab.filter(function (b) { return b.realisasi > 0; }).map(function (b) { return b.bab_nama; }).join(', ') || '-') + '</td></tr></table>' +
    '<h2 style="margin-top:12px">I &nbsp; DATA PROYEK</h2><table class="kv"><tr><td style="width:240px">1. Nama Proyek</td><td>: ' + esc_(p.nama) + '</td></tr><tr><td>2. Pemberi Tugas</td><td>: <b>' + esc_(p.client_nama) + '</b></td></tr>' +
    '<tr><td>3. Tanggal Dimulainya Pekerjaan</td><td>: <b>' + tglIndo_(p.tgl_mulai) + '</b></td></tr><tr><td>4. Jangka Waktu Pelaksanaan</td><td>: ' + durasi + ' Hari</td></tr></table>' +
    '<h2 style="margin-top:12px">II &nbsp; EVALUASI PEKERJAAN</h2><b>A. Prestasi Pekerjaan</b><table class="kv"><tr><td style="width:300px">1. Prestasi tercapai s/d ' + tglIndo_(akhir) + '</td><td class="n">' + f2_(r.realisasi_pct, 3) + ' %</td></tr>' +
    '<tr><td>2. Prestasi menurut rencana</td><td class="n">' + (r.ada_jadwal ? f2_(r.rencana_pct, 3) + ' %' : 'jadwal belum diisi') + '</td></tr><tr><td>3. Deviasi Prestasi Kumulatif</td><td class="n">' + (r.ada_jadwal ? f2_(r.deviasi, 3) + ' %' : '-') + '</td></tr></table>' +
    '<b>B. Waktu Pelaksanaan</b><table class="kv"><tr><td style="width:300px">1. Jangka Waktu Pelaksanaan</td><td class="n">' + durasi + ' Hari Kalender</td></tr><tr><td>2. Waktu yang telah berjalan</td><td class="n">' + hariJalan + ' Hari Kalender</td></tr><tr><td>3. Sisa waktu pelaksanaan</td><td class="n">' + Math.max(0, durasi - hariJalan) + ' Hari Kalender</td></tr></table>' +
    '<b>C. Pekerjaan yang dilaksanakan dalam periode ini</b><ol style="margin:4px 0 8px 18px;padding:0">' + (kegiatan.length ? kegiatan.map(function (k) { return '<li>' + esc_(k) + '</li>'; }).join('') : '<li>-</li>') + '</ol>' +
    '<b>D. Masalah / Hambatan</b><table class="kv"><tr><td style="width:100px">- Teknis</td><td>: ' + esc_(hamT.join('; ') || '-') + '</td></tr><tr><td>- Non Teknis</td><td>: ' + esc_(hamN.join('; ') || '-') + '</td></tr></table>' +
    '<table class="kv" style="margin-top:24px"><tr><td class="c" style="width:50%">Kontraktor<br>Dibuat oleh<br><br><br><br><br><b><u>' + esc_(pembuat ? pembuat.nama : '................................') + '</u></b><br><i>Admin Lapangan</i></td>' +
    '<td class="c">Kontraktor<br>Diperiksa oleh<br><br><br><br><br><b><u>' + esc_(p.project_manager || '................................') + '</u></b><br><i>Project Manager</i></td></tr></table></div>';

  var rekap = '<div class="pg"><h2>REKAPITULASI PROGRES</h2><table class="kv"><tr><td style="width:90px">PEKERJAAN</td><td>: ' + esc_(String(p.nama).toUpperCase()) + '</td></tr><tr><td>OWNER</td><td>: ' + esc_(p.client_nama) + '</td></tr><tr><td>LOKASI</td><td>: ' + esc_(p.lokasi) + '</td></tr><tr><td>PERIODE</td><td>: ' + tglIndo_(awal) + ' - ' + tglIndo_(akhir) + '</td></tr></table>' +
    '<table style="margin-top:6px"><tr><th rowspan="2" style="width:40px">NO.</th><th rowspan="2">URAIAN PEKERJAAN</th><th>Bobot</th><th colspan="2">Kemajuan fisik s/d periode ini</th></tr><tr><th>%</th><th>Kuantitas</th><th>Bobot</th></tr>' +
    h.per_bab.filter(function (b) { return b.bobot !== undefined; }).map(function (b) { return '<tr><td class="c">' + esc_(b.bab_kode) + '</td><td>' + esc_(b.bab_nama) + '</td><td class="n">' + f2_(b.bobot) + '</td><td class="n">' + f2_(b.progres_bab_pct, 0) + '%</td><td class="n">' + f2_(b.realisasi) + '</td></tr>'; }).join('') +
    '<tr class="tot"><td colspan="2" class="c">TOTAL</td><td class="n">' + f2_(h.per_bab.reduce(function (a, b) { return a + (b.bobot || 0); }, 0)) + '</td><td></td><td class="n">' + f2_(r.realisasi_pct) + '</td></tr></table>' +
    (r.ada_jadwal ? '<p>Prestasi rencana s/d ' + tglIndo_(akhir) + ': <b>' + f2_(r.rencana_pct, 3) + '%</b> · deviasi: <b>' + f2_(r.deviasi, 3) + '%</b></p>' : '') +
    (kurva ? '<div class="c" style="margin-top:10px"><img src="' + kurva + '" style="width:640px"></div>' : '') + '</div>';

  var detail = '<div class="pg"><h2>LAPORAN PROGRES PEKERJAAN — DETAIL PER ITEM</h2><table><tr><th style="width:44px">NO.</th><th>URAIAN PEKERJAAN</th><th>Bobot %</th><th>Kuantitas</th><th>Bobot</th></tr>';
  var babAktif = null;
  h.progres_item.forEach(function (it) {
    if (it.bab_kode !== babAktif) { babAktif = it.bab_kode; var b = h.per_bab.filter(function (x) { return x.bab_kode === babAktif; })[0] || {}; detail += '<tr class="bab"><td class="c">' + esc_(babAktif) + '</td><td>' + esc_(b.bab_nama || '') + '</td><td class="n">' + f2_(b.bobot) + '</td><td class="n">' + f2_(b.progres_bab_pct, 0) + '%</td><td class="n">' + f2_(b.realisasi) + '</td></tr>'; }
    detail += '<tr><td class="c">' + esc_(it.no_item) + '</td><td>' + esc_(it.uraian) + '</td><td class="n">' + f2_(it.bobot) + '</td><td class="n">' + f2_(it.progres_pct, 0) + '%</td><td class="n">' + f2_(it.bobot * it.progres_pct / 100) + '</td></tr>';
  });
  detail += '<tr class="tot"><td colspan="2" class="c">GRAND TOTAL</td><td class="n">100,00</td><td></td><td class="n">' + f2_(r.realisasi_pct) + '</td></tr></table></div>';

  var termin = rows_('TERMIN').filter(function (t) { return t.proyek_id === pid; }).sort(function (a, b) { return Number(a.termin_ke) - Number(b.termin_ke); });
  var tabelTermin = termin.length ? '<h2 style="margin-top:14px">STATUS TERMIN PEMBAYARAN</h2><table><tr><th>Termin</th><th>Syarat progres</th><th>% nilai</th><th>Nominal (Rp)</th><th>Status</th></tr>' +
    termin.map(function (t) { return '<tr><td class="c">' + esc_(t.termin_ke) + '</td><td class="n">' + f2_(t.syarat_progres_pct, 0) + '%</td><td class="n">' + f2_(t.persen_nilai, 0) + '%</td><td class="n">' + f2_(t.nominal, 0) + '</td><td>' + esc_(t.status) + (t.tgl_bayar ? ' (' + tglPendek_(t.tgl_bayar) + ')' : t.tgl_tagih ? ' (' + tglPendek_(t.tgl_tagih) + ')' : '') + '</td></tr>'; }).join('') + '</table>' : '';
  detail = detail.replace(/<\/div>$/, tabelTermin + '</div>');

  var dok = '';
  if (foto.length) {
    dok = '<div class="pg"><table><tr><td style="width:120px;border-right:0">' + logoImg(100) + '</td><td style="border-left:0;text-align:right"><b>DOKUMENTASI<br>PELAKSANAAN PEKERJAAN</b></td></tr>' +
      '<tr><td colspan="2">Nama Proyek : ' + esc_(p.nama) + ' &nbsp; · &nbsp; Kontraktor : ' + esc_(nama) + ' &nbsp; · &nbsp; Perihal : Laporan Visual<br>Tanggal : ' + tglPendek_(awal) + ' - ' + tglPendek_(akhir) + ' &nbsp; · &nbsp; Lokasi : ' + esc_(p.lokasi) + '</td></tr></table><table class="foto">';
    for (var j = 0; j < foto.length; j += 2) {
      dok += '<tr>' + [foto[j], foto[j + 1]].map(function (m) {
        if (!m) return '<td></td>';
        var src = dataUri_(m.drive_file_id, 450000), pr = idProg[m.ref_id];
        return '<td>' + (src ? '<img src="' + src + '">' : '[foto]') + '<br>' + esc_(bersih(pr.uraian_kegiatan) || itemNama[pr.item_id]) + '<br>' + tglPendek_(m.waktu_ambil) + '</td>';
      }).join('') + '</tr>';
      if (j % 6 === 4 && j + 2 < foto.length) dok += '</table><table class="foto pg">';
    }
    dok += '</table></div>';
  }
  var catatan = '<p style="margin-top:10px;color:#5A6782;font-size:9px">Dibuat otomatis oleh ' + esc_(APP.NAMA) + ' dari data yang sudah disetujui pengelola. Biaya aktual & harga beli tidak dicantumkan.</p>';
  return { html: '<html><head><meta charset="utf-8">' + css + '</head><body>' + cover + umum + rekap + detail + catatan + dok + '</body></html>', h: h };
}

/** Buat PDF + simpan baris LAPORAN (+ kirim email bila kirim=true). */
function buatLaporanPdf_(pid, awal, akhir, kirim, user) {
  var p = cari_('PROYEK', pid);
  var sebelumnya = rows_('LAPORAN').filter(function (l) { return l.proyek_id === pid; });
  var ada = sebelumnya.filter(function (l) { return String(l.periode_akhir).slice(0, 10) === akhir; })[0];
  var nomor = ada ? sebelumnya.indexOf(ada) + 1 : sebelumnya.length + 1;
  var hasil = htmlLaporan_(pid, awal, akhir, nomor);
  var nama = 'Laporan Bulanan #' + nomor + ' ' + p.kode + ' ' + awal + ' sd ' + akhir + '.pdf';
  var pdf = Utilities.newBlob(hasil.html, 'text/html', 'laporan.html').getAs('application/pdf').setName(nama);
  var file = folderJenis_(pid, 'LAPORAN').createFile(pdf);
  var r = hasil.h.ringkas, kepada = '';
  if (kirim) kepada = kirimLaporanEmail_(p, pdf, awal, akhir, nomor, r);
  var data = { proyek_id: pid, periode_awal: awal, periode_akhir: akhir, prestasi_rencana: r.rencana_pct === null ? '' : r.rencana_pct, prestasi_realisasi: r.realisasi_pct, deviasi: r.deviasi === null ? '' : r.deviasi, pdf_url: file.getUrl(), dikirim_ke: kepada, tgl_kirim: kirim ? sekarang_() : '' };
  return denganKunci_(function () {
    var lama = ada && cari_('LAPORAN', ada.laporan_id);
    if (lama) {
      if (lama.pdf_url) { var idLama = String(lama.pdf_url).match(/[-\w]{25,}/); if (idLama) try { DriveApp.getFileById(idLama[0]).setTrashed(true); } catch (e) { /* */ } }
      ubah_('LAPORAN', lama, data); data.laporan_id = lama.laporan_id;
    } else { data.laporan_id = idBaru_('LAPORAN'); sisip_('LAPORAN', [data]); }
    catatLog_(user || null, kirim ? 'KIRIM_LAPORAN' : 'BUAT_LAPORAN', 'LAPORAN', data.laporan_id, null, { periode: awal + ' - ' + akhir, kepada: kepada, file: file.getId() });
    return data;
  });
}

function emailValid_(e) { e = String(e || '').trim(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !/\.(test|local|example)$/i.test(e) ? e : ''; }

function kirimLaporanEmail_(p, pdf, awal, akhir, nomor, r) {
  var s = setting_();
  var ke = emailValid_(p.client_email);
  var cc = rows_('USERS').filter(function (u) { return u.peran === 'PENGELOLA' && aktif_(u); }).map(function (u) { return emailValid_(u.email); }).filter(String);
  if (!ke && !cc.length) throw galat_('VALIDASI', 'Email client belum diisi di data proyek, dan tidak ada email pengelola yang valid.');
  if (!ke) { ke = cc.shift(); }
  cc = cc.filter(function (x) { return x.toLowerCase() !== ke.toLowerCase(); });
  var namaP = s.nama_perusahaan || 'MITRAKONIN';
  var body = 'Yth. ' + (p.client_nama || 'Bapak/Ibu') + ',\n\nTerlampir Laporan Progres Bulanan #' + nomor + ' proyek ' + p.nama + '\nperiode ' + tglIndo_(awal) + ' s/d ' + tglIndo_(akhir) + '.\n\n' +
    'Prestasi tercapai : ' + f2_(r.realisasi_pct, 3) + ' %\n' + (r.ada_jadwal ? 'Prestasi rencana  : ' + f2_(r.rencana_pct, 3) + ' %\nDeviasi           : ' + f2_(r.deviasi, 3) + ' %\n' : '') +
    '\nProgres terkini, foto, dan arsip laporan juga dapat dilihat kapan saja di aplikasi ' + APP.NAMA + '.\n\nHormat kami,\n' + namaP + '\nKontraktor Pelaksana';
  MailApp.sendEmail({ to: ke, cc: cc.join(','), subject: 'Laporan Progres Bulanan #' + nomor + ' — ' + p.nama + ' (' + tglPendek_(awal) + ' - ' + tglPendek_(akhir) + ')', body: body, name: namaP, attachments: [pdf] });
  return [ke].concat(cc).join(', ');
}

/** Dipanggil triggerLaporan setiap pagi: kirim laporan periode yang berakhir kemarin (atau yang terlewat). */
function kirimLaporanJatuhTempo_() {
  var hariIni = hariIni_(), log = [];
  rows_('PROYEK').forEach(function (p) {
    if (p.status !== 'Berjalan' || !p.tgl_mulai) return;
    try {
      var per = daftarPeriode_(p, hariIni).filter(function (x) { return x[1] < hariIni; });
      var terakhir = per[per.length - 1];
      if (!terakhir) return;
      var sudah = rows_('LAPORAN').some(function (l) { return l.proyek_id === p.proyek_id && String(l.periode_akhir).slice(0, 10) === terakhir[1] && l.tgl_kirim; });
      if (sudah) return;
      var d = buatLaporanPdf_(p.proyek_id, terakhir[0], terakhir[1], true, null);
      log.push(p.kode + ': terkirim ke ' + d.dikirim_ke);
    } catch (e) { log.push(p.kode + ': GAGAL ' + e.message); console.error(e); }
    bersihCache_();
  });
  Logger.log(log.join('\n') || 'Tidak ada laporan jatuh tempo hari ini.');
  return log;
}

// ---------- aksi API ----------
/** {proyek_id, periode_awal?, periode_akhir?, kirim?} — default: periode terakhir yang sudah lewat (atau periode berjalan s/d hari ini). */
function aksiBuatLaporan_(u, d) {
  wajibProyek_(u, d.proyek_id);
  var p = cari_('PROYEK', d.proyek_id);
  if (!p.tgl_mulai) throw galat_('VALIDASI', 'Tanggal mulai proyek belum diisi.');
  var awal = d.periode_awal, akhir = d.periode_akhir;
  if (!awal || !akhir) {
    var per = daftarPeriode_(p, hariIni_());
    var lewat = per.filter(function (x) { return x[1] < hariIni_(); });
    var pilih = lewat.length ? lewat[lewat.length - 1] : [per[0][0], hariIni_()];
    awal = pilih[0]; akhir = pilih[1];
  }
  if (selisihHari_(awal, akhir) < 0) throw galat_('VALIDASI', 'Periode tidak valid.');
  return buatLaporanPdf_(d.proyek_id, awal, akhir, !!d.kirim, u);
}

function aksiPeriodeLaporan_(u, d) {
  wajibProyek_(u, d.proyek_id);
  var p = cari_('PROYEK', d.proyek_id);
  return { periode: daftarPeriode_(p, tambahHari_(hariIni_(), 31)), hari: hariPeriode_(p, setting_()) };
}

/** Unduh PDF laporan (client & pengelola) lewat API, dengan cek akses. */
function aksiUnduhLaporan_(u, d) {
  var l = cari_('LAPORAN', d.laporan_id);
  if (!l || !saringBaca_(u, 'LAPORAN', [l]).length) throw galat_('AKSES', 'Laporan tidak ditemukan.');
  var id = String(l.pdf_url).match(/[-\w]{25,}/);
  if (!id) throw galat_('TIDAK_ADA', 'File PDF belum ada.');
  var f = DriveApp.getFileById(id[0]);
  return { nama: f.getName(), mime: 'application/pdf', data_base64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

/** Logo kop laporan: {nama, mime, data_base64} -> simpan di folder induk, isi SETTING logo_url. */
function aksiUnggahLogo_(u, d) {
  var f = simpanBerkas_(folderInduk_(), 'logo-kop' + (/png/.test(d.mime) ? '.png' : '.jpg'), d.mime, d.data_base64);
  settingSet_(u, { kunci: 'logo_url', nilai: f.getId() });
  return { file_id: f.getId() };
}
