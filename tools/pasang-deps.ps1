# Pasang dependensi skrip uji DI LUAR folder Google Drive.
# (Google Drive for Desktop merusak node_modules: file package.json jadi 0 byte.)
# Jalankan: powershell -ExecutionPolicy Bypass -File tools\pasang-deps.ps1
$tujuan = Join-Path $env:LOCALAPPDATA 'mitrakonin-tools'
New-Item -ItemType Directory -Force $tujuan | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'package.json') $tujuan -Force
Push-Location $tujuan
npm install --no-fund --no-audit
Pop-Location
Write-Output "Dependensi terpasang di $tujuan"
