# Panduan Singkat Pengguna — MITRAKONIN Monitor

Buka alamat aplikasi dari pengelola di Chrome (HP atau laptop), lalu login dengan email & kata sandi yang diberikan.
**Ganti kata sandi sementara** di menu **Akun** setelah login pertama.

**Pasang di HP:** buka aplikasi di Chrome, ketuk **⋮ › Instal aplikasi / Tambahkan ke layar utama**. Aplikasi lalu bisa dibuka dari ikon seperti aplikasi biasa.

---

## Admin lapangan
**Tugas:** melaporkan progres dengan foto, mencatat material, dan mencatat biaya untuk proyek yang ditugaskan.

### Lapor progres (setiap hari)
1. **Beranda › Lapor progres** (atau tab **Progres**).
2. Pilih **Bab pekerjaan**, lalu **Item RAB**. Di bawahnya tampil bobot item dan progres terakhir yang sudah disetujui.
3. Isi sesuai cara ukur item:
   - *Volume:* volume yang **terpasang hari ini** (bukan kumulatif), misalnya 4,5 m³.
   - *Persen (lumpsum):* persen **kumulatif sekarang**, misalnya 60%.
4. Isi uraian kegiatan, cuaca, jumlah pekerja, dan hambatan (jika ada).
5. **Ambil foto** minimal 2 dari kamera. Video maksimal 60 detik. Foto otomatis dikompres dan diberi cap tanggal, jam, dan GPS. Izinkan akses kamera & lokasi bila diminta.
6. **Kirim untuk approval.** Status menjadi *Menunggu*. Data baru dihitung dan terlihat client setelah disetujui pengelola.

### Material
- **Material › Masuk:** pilih material, isi jumlah, harga satuan, pemasok, dan no. surat jalan, lalu foto surat jalan dan barang. Pembelian material **hanya dicatat di sini** (tidak dicatat lagi di Biaya).
- **Material › Pakai:** jumlah yang dipakai dan item RAB-nya. Saldo dan perkiraan stok habis tampil di bawah.
- **Retur / Transfer:** pengembalian ke pemasok atau pemindahan ke proyek lain.

### Biaya / nota
**Beranda › Biaya / nota:** kategori (Upah/Alat/Operasional/Lain), bab, uraian, nominal, dibayar ke, dan foto nota. Nota hanya dilihat pengelola.

### Perlu diketahui
- **Tanpa sinyal?** Tetap kirim. Laporan dan foto disimpan di HP lalu terkirim otomatis saat online. Jumlah antrian tampil di Beranda dan menu Akun.
- **Mengoreksi input:** selama status masih *Menunggu*, input bisa diubah atau dihapus. Input yang **Ditolak** muncul di Beranda bersama catatan pengelola; kirim laporan baru yang benar.

---

## Pengelola
**Tugas:** membuat proyek, import RAB, mengatur termin & jadwal, approve/tolak input, mengelola pengguna dan laporan.

### Memulai proyek baru
1. **Dashboard › Proyek baru.** Isi data proyek, nilai kontrak, overhead, durasi, tanggal mulai, client, project manager, dan admin lapangan. Folder Drive proyek dibuat otomatis.
2. **Import RAB.** Baca syarat & ketentuan file, centang setuju, lalu pilih file `.xlsx`. Periksa pratinjau per bab dibanding REKAPITULASI dan daftar temuan. **Temuan merah wajib dicentang** sebelum simpan. Setelah disimpan, RAB kontrak **terkunci**.
3. **Termin & jadwal:**
   - Tambah termin dengan % nilai dan syarat progres.
   - Isi jadwal per bab bila ingin rencana, deviasi, dan Kurva S. Jadwal boleh dilewati.
   - Klik **Aktifkan proyek**.
4. Proyek yang sudah berjalan sebelum memakai aplikasi: progres awalnya bisa diimpor sekaligus lewat aksi *progres awal*. Minta bantuan pengembang.

### Harian
- **Approval:** lihat foto, GPS, dan detail input, lalu **Setujui** atau **Tolak**. Catatan wajib diisi jika menolak. Di tablet/laptop tampil dua panel.
- **Dashboard:** proyek diurutkan dari paling kritis. Warna indikator: deviasi jadwal, indeks biaya, serapan biaya, stok, keterlambatan laporan, termin, dan antrian approval. Indikator **merah** otomatis membuat **risiko** beserta usulan mitigasi.
- **Detail proyek:**
  - Tab **Progres:** Kurva S, progres per bab, kegiatan terbaru.
  - Tab **Keuangan:** nilai terpasang vs biaya aktual, per kategori, per bab, termin.
  - Tab **Material:** stok dan perkiraan habis.
  - Tab **Risiko:** ubah status, tambah risiko manual.

### Perubahan kontrak (CCO)
**RAB & CCO › Item** › ketuk item › isi volume/harga baru, alasan, dan link berita acara › tandai *disetujui client* bila sudah. Item pekerjaan baru: **CCO item pekerjaan baru**. Kontrak asli tidak berubah; nilai final dan bobot dihitung ulang dan semuanya tercatat di LOG.

### Laporan bulanan
**Laporan bulanan:** PDF dibuat dan dikirim **otomatis** ke email client (cc pengelola) sehari setelah periode berakhir. Periode mengikuti tanggal mulai proyek. Dari menu ini juga bisa **Buat PDF**, **Kirim**, **Unduh**, dan **Ganti logo** kop. Biaya aktual & harga beli tidak pernah masuk laporan client.

### Pengguna
**Pengguna › Tambah pengguna:** nama, email, peran, dan proyek. Password sementara dikirim lewat email. Di menu yang sama bisa **Ubah** akses, **Reset password**, dan **Nonaktifkan**. Riwayat input pengguna nonaktif tetap tersimpan.

### Pengaturan
Ambang indikator, nama perusahaan, dan tanggal laporan ada di tab **SETTING** pada Google Sheet.

---

## Client
**Yang terlihat:** hanya proyek Anda, dan hanya data yang sudah diperiksa pengelola.
- **Progres:** persentase selesai, rencana (jika ada jadwal), progres per tahap pekerjaan, Kurva S, kegiatan terbaru.
- **Foto:** dokumentasi lapangan. Ketuk untuk memperbesar.
- **Termin:** nilai kontrak, termin, dan status pembayaran.
- **Laporan:** arsip laporan bulanan PDF (**Unduh**). Laporan juga dikirim ke email Anda setiap bulan.

---

**Bantuan:** lupa kata sandi atau tidak bisa login → hubungi pengelola untuk *Reset password*.
