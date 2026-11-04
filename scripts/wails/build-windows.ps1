$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $RepoRoot
foreach ($CommandName in @('go', 'node', 'npm.cmd')) {
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Missing $CommandName. Install Go 1.27.3 and a supported Node.js version, then open a new terminal."
    }
}
$GoVersion = (& go env GOVERSION).Trim()
if ($GoVersion -notmatch '^go1\.27\.(\d+)$' -or [int]$Matches[1] -lt 3) {
    throw 'Use the pinned Go 1.27.3 toolchain (or a later 1.27 patch).'
}
& node scripts/check-node.cjs
if ($LASTEXITCODE -ne 0) { throw 'Node security version check failed.' }
& npm.cmd --prefix frontend ci
if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
& npm.cmd --prefix frontend run build:wails
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
& go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.1
if ($LASTEXITCODE -ne 0) { throw 'Wails installation failed.' }
$WailsExecutable = Join-Path ((& go env GOPATH).Trim()) 'bin/wails.exe'
Push-Location wails
try {
    & go test ./...
    if ($LASTEXITCODE -ne 0) { throw 'Go tests failed.' }
    & $WailsExecutable build -platform windows/amd64 -s -skipbindings
    if ($LASTEXITCODE -ne 0) { throw 'Wails Windows build failed.' }
} finally { Pop-Location }
$PackageDir = Join-Path $RepoRoot 'wails/build/bin'
Copy-Item LICENSE (Join-Path $PackageDir 'LICENSE')
Copy-Item scripts/wails/install-tools.ps1 (Join-Path $PackageDir 'install-tools.ps1')
Copy-Item wails/README.md (Join-Path $PackageDir 'README.md')
$SourceRevision = 'feat/wails-windows'
if ((Get-Command git -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $RepoRoot '.git'))) {
    $SourceRevision = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the source revision.' }
}
@"
Sol.A is derived from Banana Slides and distributed under AGPL-3.0.
Corresponding source: https://github.com/Jungwoo-Ryu/banana-slides/tree/$SourceRevision
Source archive: https://github.com/Jungwoo-Ryu/banana-slides/archive/$SourceRevision.zip
Build instructions: wails/README.md and scripts/wails/build-windows.ps1 in that revision.
"@ | Set-Content (Join-Path $PackageDir 'SOURCE.txt') -Encoding utf8
$Notices = [System.Collections.Generic.List[string]]::new()
$Notices.Add('Third-party licenses for the Go application and bundled frontend. Optional system tools are distributed separately by their publishers.')
function Add-LicenseNotices([string]$Label, [string]$Directory) {
    if (-not $Directory -or -not (Test-Path $Directory)) { return }
    $Files = Get-ChildItem -LiteralPath $Directory -File | Where-Object { $_.Name -match '^(LICENSE|LICENCE|COPYING|NOTICE)([.-].*)?$' }
    foreach ($File in $Files) {
        $Notices.Add("`n===== $Label / $($File.Name) =====`n")
        $Notices.Add((Get-Content -LiteralPath $File.FullName -Raw))
    }
}
$Modules = & go -C wails list -m -f '{{.Path}}|{{.Version}}|{{.Dir}}' all
if ($LASTEXITCODE -ne 0) { throw 'Cannot list Go license sources.' }
foreach ($Module in $Modules) {
    $Parts = $Module -split '\|', 3
    if ($Parts.Length -eq 3) { Add-LicenseNotices "$($Parts[0]) $($Parts[1])" $Parts[2] }
}
$Packages = & npm.cmd --prefix frontend ls --omit=dev --all --parseable
if ($LASTEXITCODE -ne 0) { throw 'Cannot list frontend license sources.' }
foreach ($Package in $Packages) { Add-LicenseNotices ($Package -replace [regex]::Escape($RepoRoot), '') $Package }
$Notices | Set-Content (Join-Path $PackageDir 'THIRD_PARTY_NOTICES.txt') -Encoding utf8
Get-FileHash (Join-Path $PackageDir 'SolA.exe') -Algorithm SHA256 | Format-List
