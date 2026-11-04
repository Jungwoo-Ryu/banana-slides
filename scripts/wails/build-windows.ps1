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
Get-FileHash (Join-Path $PackageDir 'SolA.exe') -Algorithm SHA256 | Format-List
