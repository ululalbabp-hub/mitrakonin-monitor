# Serah Terima ke Akun MITRAKONIN

> **Status: FINAL (Tahap 6).** Semua langkah di bawah hanya berupa **konfigurasi**; tidak ada kode yang perlu diubah.

Tujuan: memindahkan MITRAKONIN Monitor dari akun pribadi (demo) ke akun Google **`mitrakonin.monitor`** dan akun **GitHub MITRAKONIN**.
Perkiraan waktu: ±60 menit. Siapkan laptop dengan Chrome, sudah login ke akun `mitrakonin.monitor`.

---

## 1. Peta: apa yang tertaut ke akun

| Komponen | Lokasi | Ikut tersalin saat "Buat salinan" Sheet? | Cara pindah |
|---|---|---|---|
| Database (17 tab + kolom tambahan `sub_grup`, `supply_owner` di RAB_ITEM) | Google Sheet | Ya | Buat salinan dari akun baru |
| Backend Apps Script (bound ke Sheet) | Di dalam Sheet | **Ya** | Otomatis ikut salinan |
| `ROOT_FOLDER_ID`: folder Drive "MITRAKONIN Monitor - Data" | Script Properties | **Tidak** | `setup()` membuat folder baru |
| `PEPPER`: pengaman hash password | Script Properties | **Tidak** | Salin nilai lama, atau reset password (langkah 5) |
| Trigger harian (06.00) & laporan bulanan (07.00) | Apps Script | Tidak | `installTriggers()` |
| Izin script (Sheet, Drive, email, trigger) | Akun Google | Tidak | Diberikan ulang saat menjalankan fungsi pertama kali |
| URL Web App (API) | Deployment Apps Script | Tidak | Deploy baru, URL masuk `app/config.js` |
| Logo kop laporan (`SETTING.logo_url`) | Drive | Tidak (file) | Unggah ulang lewat menu Laporan bulanan |
| Foto, video, nota, PDF laporan | Drive akun lama | **Tidak** | Mulai bersih (disarankan) atau pindahkan kepemilikan (bagian 4) |
| Frontend PWA | GitHub Pages | – | Repo baru + Pages |
| scriptId untuk `clasp` | `gas/.clasp.json` (tidak di-commit) | – | Isi scriptId baru (opsional) |

### Script Properties yang dipakai
| Kunci | Isi | Dibuat oleh |
|---|---|---|
| `ROOT_FOLDER_ID` | ID folder "MITRAKONIN Monitor - Data" | `setup()` |
| `PEPPER` | 64 karakter acak | `setup()` (hanya jika kosong) |
| `IZINKAN_KOSONGKAN` | `YA`, sementara; pengaman `kosongkanDataDemo()` | Anda, lalu dihapus otomatis |
| `PENGELOLA_NAMA`, `PENGELOLA_EMAIL` | Data pengelola pertama, sementara | Anda, lalu dihapus otomatis |

Lokasinya: editor Apps Script › ⚙ **Setelan project** › **Properti skrip** › Edit properti skrip.

---

## 2. Langkah pindah akun

### A. Google (Sheet + Apps Script)
1. **Bagikan Sheet demo** dari akun pribadi ke `mitrakonin.monitor` (Editor).
2. Login sebagai `mitrakonin.monitor`, buka Sheet › **File › Buat salinan**. Simpan di "Drive Saya" dengan nama tanpa "(TRIAL)", misalnya *MITRAKONIN - Database Pemantauan Proyek*.
3. Di salinan: **Ekstensi › Apps Script**. Ganti nama project menjadi *MITRAKONIN Monitor API*.
4. **Kosongkan data demo.** Disarankan, karena file foto dan PDF demo tetap berada di Drive akun pribadi.
   - Properti skrip: tambah `IZINKAN_KOSONGKAN` = `YA`.
   - Pilih fungsi **`kosongkanDataDemo`** › **Jalankan**.
   - Saat diminta izin: **Tinjau izin** › pilih `mitrakonin.monitor` › **Lanjutan** › **Buka project (tidak aman)** › centang **Pilih semua** › **Lanjutkan**.
   - Log menampilkan jumlah baris yang dikosongkan per tab. MASTER_MATERIAL, MASTER_TENAGA, dan ambang di SETTING tetap utuh.
5. **PEPPER.** Karena data pengguna sudah dikosongkan, cukup biarkan kosong; `setup()` membuat yang baru.
   - *Jika data pengguna dipertahankan* (langkah 4 dilewati): salin nilai `PEPPER` dari Properti skrip project lama ke project baru **sebelum** `setup()`. Jika lupa, jalankan `resetPasswordMassal()`; semua pengguna aktif menerima password sementara lewat email.
6. Pilih **`setup`** › **Jalankan**. Log harus menampilkan: folder induk dibuat, PEPPER dibuat, kolom tambahan sudah ada, `email_pengirim` terisi, dan "Skema 17 tab sesuai".
7. Pilih **`installTriggers`** › **Jalankan**. Log harus menampilkan: `Trigger aktif: triggerHarian, triggerLaporan`.
8. Pilih **`ujiIzinEmail`** › **Jalankan**.
   - Jika muncul error izin, klik **"Klik di sini untuk memberikan izin"** di *Log eksekusi* dan centang **Kirim email atas nama Anda**.
   - Jalankan lagi; email uji masuk ke `mitrakonin.monitor`.
9. **Pengelola pertama.**
   - Properti skrip: `PENGELOLA_NAMA` = nama lengkap, `PENGELOLA_EMAIL` = email pengelola.
   - Jalankan **`buatPengelolaPertama`**. Password sementara dikirim ke email itu.
10. **Deploy Web App:** **Terapkan › Deployment baru** › ⚙ jenis **Aplikasi web**
    - Deskripsi: `Produksi`
    - Jalankan sebagai: **Saya (mitrakonin.monitor)**
    - Yang memiliki akses: **Siapa saja**
    - Klik **Terapkan** dan salin **URL aplikasi web** (berakhiran `/exec`).

### B. GitHub (frontend)
11. Buat akun/organisasi GitHub MITRAKONIN (jika belum ada), lalu repo **publik** `mitrakonin-monitor`.
12. Unduh isi repo ini: **Code › Download ZIP** dari repo lama, atau `git clone`.
13. Ubah **hanya** `app/config.js`: `API_URL` diisi URL dari langkah 10.
14. Push ke repo baru, lalu di repo baru buka **Settings › Pages › Source = GitHub Actions**. Workflow `Publikasi PWA` berjalan otomatis (tab Actions, hijau dalam ±1 menit). Alamat aplikasi menjadi `https://<akun-mitrakonin>.github.io/mitrakonin-monitor/`.
15. *(Opsional, untuk pengembang)* `clasp logout` › `clasp login` dengan akun baru › salin `gas/.clasp.json.example` ke `gas/.clasp.json` dan isi scriptId project baru (Setelan project › ID Skrip).

### C. Uji
16. Buka alamat aplikasi baru, login dengan akun dari langkah 9, lalu **ganti password** di menu Akun.
17. Buat 1 akun ADMIN dan 1 akun CLIENT di menu **Pengguna**. Buat proyek, import RAB, lalu jalankan alur: admin lapor progres dengan foto › pengelola approve › dashboard berubah › client melihat.
18. *(Opsional, pengembang)* Jalankan uji otomatis. Buat dulu file akun uji di luar repo (format sama dengan `akun-uji-RAHASIA.json`).
    ```bash
    node tools/test-api.js
    ```
    ```bash
    node tools/test-akses.js
    ```
    Proyek `UJI-API-…` yang terbentuk dihapus dengan aksi `hapusProyekUji` (hanya proyek berkode `UJI-`).
19. **Laporan bulanan:** menu **Laporan bulanan › Ganti logo** untuk logo kop. Isi email client di data proyek. Coba **Buat PDF** untuk satu periode.
20. Bagikan alamat aplikasi baru ke semua pengguna dan minta mereka **memasang ulang** aplikasi di HP. Aplikasi lama terpasang di alamat lama.

### D. Bersihkan akun pribadi
21. Di project Apps Script **lama**:
    - **Pemicu** › hapus `triggerHarian` & `triggerLaporan`.
    - **Terapkan › Kelola deployment** › arsipkan deployment lama.
22. Repo GitHub pribadi `mitrakonin-monitor`: **Settings › Archive** (atau hapus).
23. Drive pribadi: hapus folder "MITRAKONIN Monitor - Data" dan Sheet TRIAL setelah akun baru terbukti berjalan. Cabut berbagi ke akun pribadi.

---

## 3. Daftar periksa: tidak ada yang tertaut ke akun pribadi
- [ ] Pemilik Sheet database = `mitrakonin.monitor`
- [ ] `ROOT_FOLDER_ID` menunjuk folder milik `mitrakonin.monitor`
- [ ] SETTING `email_pengirim` = `mitrakonin.monitor`; `logo_url` = file milik akun baru
- [ ] `app/config.js` di repo MITRAKONIN memakai URL Web App yang di-deploy dari `mitrakonin.monitor`
- [ ] Trigger aktif hanya di project baru (cek **Pemicu** di project lama: kosong)
- [ ] Deployment Web App lama diarsipkan
- [ ] Repo & Pages di GitHub MITRAKONIN; repo pribadi diarsipkan/dihapus
- [ ] Tab USERS tidak berisi akun demo (`*@mitrakonin.test`)
- [ ] Tab PROYEK tidak berisi proyek demo/`UJI-…`
- [ ] Email uji & laporan dikirim dari `mitrakonin.monitor`
- [ ] `clasp` (jika dipakai) login dengan akun baru
- [ ] Sheet & folder di akun pribadi sudah dihapus, berbagi dicabut

## 4. Jika data demo/foto ingin dipertahankan (tidak disarankan)
Lewati langkah 4. Sebelum `setup()`:
1. Di akun pribadi, pindahkan kepemilikan folder "MITRAKONIN Monitor - Data" ke `mitrakonin.monitor` (Drive › Bagikan › Jadikan pemilik).
2. Isi Properti skrip `ROOT_FOLDER_ID` di project baru dengan ID folder itu.
3. Salin `PEPPER` lama (langkah 5) agar password tetap berlaku.

## 5. Batas layanan gratis (akun Gmail biasa)
| Batas | Nilai | Dampak untuk ±15 pengguna |
|---|---|---|
| Email per hari (MailApp) | 100 penerima | Laporan bulanan + pengingat, cukup |
| Durasi satu eksekusi | 6 menit | Import RAB 300 item ±20 detik |
| Total waktu trigger per hari | 90 menit | Trigger harian ±1 menit per proyek |
| Panggilan API bersamaan | ±30 | Cukup; antrian otomatis bila sibuk |
| Ruang Drive | 15 GB | Foto ±300 KB → ±40.000 foto |

## 6. Operasional rutin
| Kapan | Siapa | Apa |
|---|---|---|
| Setiap hari | Admin lapangan | Lapor progres + foto; catat material & biaya |
| Setiap hari | Pengelola | Periksa **Approval** (indikator merah bila > 3 hari) |
| Otomatis 06.00 | Sistem | Hitung stok, indikator, risiko otomatis, email pengingat admin yang terlambat lapor |
| Otomatis 07.00 | Sistem | Kirim laporan bulanan H+1 setelah periode berakhir |
| Ada perubahan kontrak | Pengelola | **RAB & CCO › Buat CCO** (kontrak tidak tertimpa) |
| Pengguna keluar | Pengelola | **Pengguna › Nonaktifkan** (riwayat tetap tersimpan) |
| Lupa password | Pengelola | **Pengguna › Reset password** (dikirim ke email) |

Ambang indikator (deviasi, indeks biaya, stok, laporan, termin, approval) diubah di tab **SETTING** tanpa mengubah kode.
