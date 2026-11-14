# MITRAKONIN Monitor

Aplikasi pemantauan proyek konstruksi PT MITRAKONIN (didukung SEP Consultant).
PWA (bisa dipasang di HP, jalan offline) + Google Apps Script + Google Sheet + Google Drive. Semua gratis.

| Folder | Isi |
|---|---|
| `app/` | PWA statis, dipublikasikan ke GitHub Pages oleh `.github/workflows/pages.yml`. **Konfigurasi akun hanya di `app/config.js`.** |
| `gas/` | Backend Google Apps Script, bound ke Sheet database, dikelola dengan `clasp`. |
| `tools/` | Skrip uji lokal (importer RAB, API end-to-end) dan `deploy-gas.ps1`. |
| `SERAH-TERIMA.md` | Langkah pindah ke akun `mitrakonin.monitor` & GitHub MITRAKONIN. |
| `PANDUAN-PENGGUNA.md` | Panduan singkat untuk pengelola, admin lapangan, dan client. |

## Aturan repo
- Repo ini **publik**. Tidak boleh ada password, salt, token, kunci, atau data client (file RAB/laporan, angka kontrak) di sini.
- `gas/.clasp.json` tidak di-commit (berisi scriptId per akun). Salin dari `gas/.clasp.json.example`.
- File contoh, akun uji, dan nilai harapan uji disimpan **di luar repo** (folder induk `..\`).

## Struktur PWA
- `js/inti.js` — template aman (auto-escape), API, sesi, antrian offline (IndexedDB), kompres foto + cap waktu/GPS, router.
- `js/layar/` — layar per peran: `pengelola.js`, `admin.js`, `client.js`, `umum.js` (login & akun).
- `js/rab-import.js` — parser & validasi RAB (dipakai juga oleh `tools/test-rab.js`).
- `vendor/xlsx-0.20.3.full.min.js` — SheetJS versi terkunci, dimuat hanya saat Import RAB.
- `sw.js` — cache cangkang aplikasi; naikkan `VERSI` setiap rilis.

## Perintah pengembang
```bash
powershell -ExecutionPolicy Bypass -File tools/deploy-gas.ps1 "catatan rilis"
```
```bash
node tools/test-api.js
```
```bash
node tools/test-akses.js
```
```bash
node tools/test-rab.js
```
Push ke `main` otomatis memperbarui GitHub Pages.
