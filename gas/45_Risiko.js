/**
 * Indikator MERAH otomatis membuat baris RISIKO (sumber=otomatis) dengan usulan mitigasi.
 * Tidak membuat duplikat selama masih ada risiko otomatis Terbuka untuk indikator yang sama.
 */
var RISIKO_OTOMATIS = {
  deviasi: { kategori: 'Jadwal', judul: 'Progres tertinggal dari rencana', mitigasi: 'Tambah tenaga/jam kerja pada item jalur kritis, susun ulang jadwal mingguan, rapat koordinasi lapangan minggu ini.' },
  indeks_biaya: { kategori: 'Biaya', judul: 'Biaya aktual melebihi nilai pekerjaan terpasang', mitigasi: 'Telusuri pengeluaran per bab, hentikan pembelian di luar RAB, negosiasi ulang harga pemasok, cek pemborosan material.' },
  serapan: { kategori: 'Biaya', judul: 'Serapan biaya jauh di atas prestasi fisik', mitigasi: 'Bandingkan biaya per bab dengan progres, tunda pembelian material yang belum dipakai, pastikan progres sudah dilaporkan.' },
  stok: { kategori: 'Material', judul: 'Stok material hampir habis', mitigasi: 'Pesan ulang material dengan stok < 3 hari, konfirmasi jadwal kirim pemasok, siapkan pemasok cadangan.' },
  laporan: { kategori: 'Jadwal', judul: 'Laporan progres lapangan terlambat', mitigasi: 'Hubungi admin lapangan, pastikan laporan harian dengan foto dikirim, cek kendala sinyal/aplikasi.' },
  termin: { kategori: 'Client', judul: 'Pembayaran termin lewat jatuh tempo', mitigasi: 'Kirim pengingat resmi ke client, jadwalkan pertemuan penagihan, evaluasi arus kas proyek.' },
  approval: { kategori: 'Jadwal', judul: 'Input lapangan lama menunggu approval', mitigasi: 'Pengelola memeriksa antrian approval hari ini agar angka dashboard dan laporan client akurat.' },
};

function cekRisikoOtomatis_(pid, hasil) {
  var p = cari_('PROYEK', pid);
  if (!p) return [];
  var dibuat = [];
  denganKunci_(function () {
    var terbuka = rows_('RISIKO').filter(function (r) { return r.proyek_id === pid && r.sumber === 'otomatis' && r.status !== 'Selesai'; });
    Object.keys(hasil.indikator).forEach(function (k) {
      var ind = hasil.indikator[k];
      if (ind.warna !== 'Merah' || !RISIKO_OTOMATIS[k]) return;
      var tag = '[' + k + ']';
      if (terbuka.some(function (r) { return String(r.deskripsi).indexOf(tag) === 0; })) return;
      var def = RISIKO_OTOMATIS[k];
      var row = {
        risiko_id: idBaru_('RISIKO'), proyek_id: pid, tanggal: hariIni_(), kategori: def.kategori,
        deskripsi: tag + ' ' + def.judul + ' (nilai: ' + ind.nilai + ')', dampak: 3, kemungkinan: 3, skor: 9,
        mitigasi: def.mitigasi, pic: p.project_manager || '', target_tgl: tambahHari_(hariIni_(), 7),
        status: 'Terbuka', sumber: 'otomatis', indikator: 'Merah',
      };
      sisip_('RISIKO', [row]);
      catatLog_(null, 'RISIKO_OTOMATIS', 'RISIKO', row.risiko_id, null, { indikator: k, nilai: ind.nilai });
      dibuat.push(row.risiko_id);
    });
  });
  return dibuat;
}
