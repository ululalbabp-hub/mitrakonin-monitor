# Kirim kode Apps Script lalu perbarui deployment Web App yang URL-nya ada di app/config.js
# (URL tetap sama). Jalankan dari mana saja:  powershell -File tools\deploy-gas.ps1 "catatan rilis"
param([string]$Catatan = "update")
$repo = Split-Path -Parent $PSScriptRoot
$cfg = Get-Content (Join-Path $repo 'app\config.js') -Raw
$m = [regex]::Match($cfg, '/macros/s/([A-Za-z0-9_-]+)/exec')
if (-not $m.Success) { Write-Error 'URL Web App di app/config.js belum diisi. Buat deployment pertama dengan: clasp create-deployment'; exit 1 }
$id = $m.Groups[1].Value
Push-Location (Join-Path $repo 'gas')
try {
  clasp push --force
  if ($LASTEXITCODE -ne 0) { throw 'clasp push gagal' }
  clasp update-deployment $id --description $Catatan
} finally { Pop-Location }
