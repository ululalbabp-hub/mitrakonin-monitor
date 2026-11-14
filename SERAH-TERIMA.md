# Serah Terima ke Akun MITRAKONIN

> **Status: DRAF (Tahap 0).** Dilengkapi bertahap; versi final di Tahap 6.

Tujuan: memindahkan aplikasi dari akun pribadi (demo) ke akun Google `mitrakonin.monitor` dan akun GitHub MITRAKONIN **hanya dengan konfigurasi, tanpa mengubah kode**.

## Yang tertaut ke akun (dan cara memindahkannya)

| Komponen | Di mana | Cara pindah |
|---|---|---|
| Sheet database + Apps Script (bound) | Google Drive | Buat salinan Sheet dari akun baru → script ikut tersalin |
| Folder Drive induk | Script Properties `ROOT_FOLDER_ID` | `setup()` membuat folder baru bila kosong |
| Salt/pepper password | Script Properties | **Tidak ikut tersalin** — salin nilainya manual, atau jalankan reset password massal |
| Trigger (laporan bulanan, pengingat) | Apps Script | Jalankan `installTriggers()` dari akun baru |
| URL Web App | `app/config.js` | Deploy ulang dari akun baru, ganti `API_URL` |
| scriptId clasp | `gas/.clasp.json` (tidak di-commit) | Isi scriptId baru |
| Frontend | GitHub Pages | Push ke repo baru, aktifkan Pages |

## Langkah (ringkas — dirinci di Tahap 6)
1. Login `mitrakonin.monitor`, buka Sheet demo (sudah dibagikan) → File › Buat salinan.
2. Di salinan: Ekstensi › Apps Script → jalankan `setup()` (izinkan akses).
3. Isi Script Properties yang tidak ikut tersalin (salt/pepper) — atau `resetPasswordMassal()`.
4. Deploy › New deployment › Web app (Execute as: Me, Who has access: Anyone) → salin URL.
5. Jalankan `installTriggers()`.
6. Ubah `app/config.js` → `API_URL` baru.
7. Buat repo `mitrakonin-monitor` di GitHub MITRAKONIN, push, aktifkan Pages (branch `main`, folder `/app` atau via Actions).
8. Uji login 3 peran, input → approve → dashboard → client.
9. Hapus salinan/deployment/trigger di akun pribadi.

## Daftar periksa "tidak ada yang tertaut ke akun pribadi"
- [ ] Pemilik Sheet & folder Drive induk = `mitrakonin.monitor`
- [ ] Semua file foto/video/PDF ada di folder Drive akun baru
- [ ] Tab SETTING `email_pengirim` = akun baru
- [ ] Web App di-deploy dari akun baru; `config.js` memakai URL itu
- [ ] Trigger lama di akun pribadi sudah dihapus (script.google.com › Triggers)
- [ ] Deployment Web App lama di akun pribadi diarsipkan
- [ ] Repo & Pages di GitHub MITRAKONIN; repo pribadi dihapus/diarsipkan
- [ ] `clasp logout` di akun pribadi, login ulang dengan akun baru
- [ ] Akses berbagi Sheet/folder ke akun pribadi dicabut
