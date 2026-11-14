# tools/

Skrip uji lokal (Node). File contoh dibaca dari `%MITRAKONIN_SAMPLES%`, default `C:\Users\HP\Downloads\MITRAKONIN\`, dan **tidak disalin ke repo**.

## Persiapan (sekali)
Repo ada di Google Drive, dan Drive merusak `node_modules`. Karena itu dependensi dipasang di `%LOCALAPPDATA%\mitrakonin-tools`:

```bash
powershell -ExecutionPolicy Bypass -File tools/pasang-deps.ps1
```

SheetJS dikunci di versi **0.20.3** (dari cdn.sheetjs.com, karena versi di npm berhenti di 0.18.5). Frontend nanti memakai versi yang sama.

## Uji importer RAB
```bash
node tools/test-rab.js                 # file .xlsx pertama di folder contoh
node tools/test-rab.js "D:\lain.xlsx"  # file lain
node tools/test-rab-aturan.js          # uji aturan validasi (file dirusak di memori)
```
Nilai harapan (angka kontrak contoh) disimpan di `..\uji-harapan-RAHASIA.json`, di luar repo. Hasil lengkap ada di `tools/out/rab-hasil.json`. Folder ini tidak di-commit karena berisi data client.
