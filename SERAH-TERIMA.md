# Serah Terima ke Akun MITRAKONIN

> **Status: DRAF (diperbarui Tahap 5).** Versi final di Tahap 6.

Tujuan: memindahkan aplikasi dari akun pribadi (demo) ke akun Google `mitrakonin.monitor` dan akun GitHub MITRAKONIN **hanya dengan konfigurasi, tanpa mengubah kode**.

## Yang tertaut ke akun (dan cara memindahkannya)

| Komponen | Di mana | Ikut tersalin saat "Buat salinan" Sheet? | Cara pindah |
|---|---|---|---|
| Sheet database (17 tab) | Google Drive | Ya | Buat salinan dari akun baru |
| Kode Apps Script (bound) | Di dalam Sheet | **Ya** | Otomatis ikut salinan |
| `ROOT_FOLDER_ID` (folder Drive induk) | Script Properties | **Tidak** | `setup()` membuat folder baru di akun baru |
| `PEPPER` (pengaman hash password) | Script Properties | **Tidak** | Salin nilai lama, ATAU jalankan `resetPasswordMassal()` |
| Trigger harian & laporan bulanan | Apps Script | Tidak | Jalankan `installTriggers()` |
| Deployment Web App + URL | Apps Script | Tidak | Deploy baru, URL baru masuk `app/config.js` |
| `folder_drive_id` tiap proyek, file foto/PDF | Tab PROYEK/MEDIA + Drive | Isi kolom ya, **file tidak** | Lihat "Memindahkan file Drive" |
| scriptId clasp | `gas/.clasp.json` (tidak di-commit) | – | Isi scriptId baru |
| Frontend | GitHub Pages | – | Push ke repo baru, aktifkan Pages |

## Script Properties yang dipakai
| Kunci | Isi | Dibuat oleh |
|---|---|---|
| `ROOT_FOLDER_ID` | ID folder "MITRAKONIN Monitor - Data" | `setup()` |
| `PEPPER` | 64 karakter acak | `setup()` (hanya bila kosong) |

Lihat/ubah: editor Apps Script › ⚙ **Setelan project** › **Properti skrip**.

## Langkah pindah akun
1. **Siapkan akun baru.** Login `mitrakonin.monitor`. Pastikan Sheet demo sudah dibagikan ke akun ini.
2. **Salin Sheet.** Buka Sheet demo › File › **Buat salinan** › simpan di Drive `mitrakonin.monitor`. Beri nama tanpa "(TRIAL)".
3. **Buka Apps Script salinan.** Ekstensi › Apps Script. Ganti nama project menjadi "MITRAKONIN Monitor API".
4. **PEPPER — pilih salah satu:**
   - **(A) Pertahankan password pengguna:** di project LAMA, buka Properti skrip, salin nilai `PEPPER`. Di project BARU tambahkan properti `PEPPER` dengan nilai yang sama **sebelum** menjalankan `setup()`.
   - **(B) Reset:** lewati langkah ini. Setelah langkah 5, jalankan `resetPasswordMassal()`; semua pengguna aktif menerima password sementara lewat email.
5. **Jalankan `setup()`** (pilih fungsi › Jalankan). Saat diminta izin: pilih akun baru › Lanjutan › Buka project › centang **Pilih semua** › Lanjutkan. Periksa log: folder induk dibuat, skema 17 tab sesuai.
6. **Jalankan `installTriggers()`.** Log harus menampilkan `triggerHarian, triggerLaporan`. Lalu jalankan **`ujiIzinEmail()`**: bila muncul error izin, klik *Klik di sini untuk memberikan izin* di Log eksekusi dan centang **Kirim email**. Email uji masuk ke akun baru.
   - Unggah logo kop laporan dari menu **Laporan bulanan › Ganti logo**, atau isi SETTING `logo_url` dengan ID file logo di Drive.
7. **Deploy Web App:** tombol Terapkan › Deployment baru › jenis **Aplikasi web** › Jalankan sebagai **Saya**, Akses **Siapa saja** › Terapkan › salin URL (`.../exec`).
8. **Ubah `app/config.js`:** `API_URL` = URL baru. Hanya file ini yang diubah.
9. **GitHub MITRAKONIN:** buat repo publik `mitrakonin-monitor`, push isi repo ini. Di repo: Settings › Pages › Source = **GitHub Actions**. Workflow `.github/workflows/pages.yml` mempublikasikan folder `app/` ke `https://<akun-mitrakonin>.github.io/mitrakonin-monitor/`.
10. **clasp (opsional, untuk pengembang):** `clasp logout`, `clasp login` dengan akun baru, salin `gas/.clasp.json.example` ke `gas/.clasp.json` dan isi scriptId baru.
11. **Uji:** jalankan `node tools/test-api.js` (menghasilkan proyek uji "UJI-API-…", hapus setelahnya) lalu uji manual login 3 peran: input → approve → dashboard → client.
12. **Bersihkan akun pribadi:** arsipkan deployment lama, hapus trigger lama, hapus salinan Sheet & folder data demo di akun pribadi.

### Memindahkan file Drive (foto, nota, PDF)
Kolom `folder_drive_id` dan `MEDIA.drive_file_id` menunjuk ke file di akun lama. Untuk demo, data contoh cukup dibuat ulang di akun baru (Tahap 4). Untuk data sungguhan: pindahkan kepemilikan folder "MITRAKONIN Monitor - Data" ke `mitrakonin.monitor` (Drive › Bagikan › jadikan pemilik), lalu isi `ROOT_FOLDER_ID` akun baru dengan ID folder itu **sebelum** `setup()`.

## Akun pengelola pertama
Selama belum ada PENGELOLA aktif di tab USERS, API menerima aksi `bootstrap` (sekali saja) untuk membuat pengelola pertama. Setelah ada pengelola, bootstrap otomatis tertutup.

## Daftar periksa "tidak ada yang tertaut ke akun pribadi"
- [ ] Pemilik Sheet & folder Drive induk = `mitrakonin.monitor`
- [ ] `ROOT_FOLDER_ID` menunjuk folder milik akun baru
- [ ] Semua file foto/video/PDF ada di folder Drive akun baru
- [ ] Tab SETTING `email_pengirim` = akun baru
- [ ] Web App di-deploy dari akun baru; `config.js` memakai URL itu
- [ ] Trigger lama di akun pribadi sudah dihapus (script.google.com › Pemicu)
- [ ] Deployment Web App lama di akun pribadi diarsipkan
- [ ] Repo & Pages di GitHub MITRAKONIN; repo pribadi dihapus/diarsipkan
- [ ] `clasp logout` di akun pribadi, login ulang dengan akun baru
- [ ] Akses berbagi Sheet/folder ke akun pribadi dicabut
- [ ] Akun uji (`*.uji@mitrakonin.test`) dinonaktifkan; proyek `UJI-API-*` dihapus
