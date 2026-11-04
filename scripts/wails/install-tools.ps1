# Optional native helpers. Run this script only for the features you need.
# Package managers validate publisher package hashes. Sol.A does not download
# model weights or install Python, Node.js, Electron or a background service.
param([switch]$OCR, [switch]$Video, [switch]$Office, [switch]$PDF, [switch]$All)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'Install Microsoft App Installer (winget) first, or follow README.md for manual installation.'
}
function Install-Package([string]$Id) {
    & winget install --exact --id $Id --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { throw "Installation failed: $Id" }
}
if ($All -or $OCR) { Install-Package 'UB-Mannheim.TesseractOCR' }
if ($All -or $Video) { Install-Package 'Gyan.FFmpeg' }
if ($All -or $Office) { Install-Package 'TheDocumentFoundation.LibreOffice' }
if ($All -or $PDF) { Install-Package 'oschwartz10612.Poppler' }
Write-Host 'Restart Sol.A after installation. Check tools in Settings. Korean OCR also requires kor.traineddata from the official tesseract-ocr/tessdata repository.'
