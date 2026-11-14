# MITRAKONIN Monitor

Aplikasi pemantauan proyek konstruksi PT MITRAKONIN (didukung SEP Consultant).

| Folder | Isi |
|---|---|
| `app/` | PWA statis (GitHub Pages). Konfigurasi akun hanya di `app/config.js`. |
| `gas/` | Google Apps Script, bound ke Sheet database, dikelola dengan `clasp`. |
| `tools/` | Skrip uji lokal (Node), mis. uji importer RAB. |
| `SERAH-TERIMA.md` | Langkah pindah ke akun `mitrakonin.monitor` & GitHub MITRAKONIN. |

## Aturan repo
- Repo ini **publik**. Tidak boleh ada password, salt, token, kunci, atau data client (file RAB/laporan) di sini.
- `gas/.clasp.json` tidak di-commit (berisi scriptId per akun). Salin dari `gas/.clasp.json.example`.
- File contoh RAB dibaca dari luar repo (default `C:\Users\HP\Downloads\MITRAKONIN\`, bisa diganti lewat variabel `MITRAKONIN_SAMPLES`).

## Perintah
```bash
cd gas && clasp push      # kirim kode ke Apps Script
cd gas && clasp open-script
```
