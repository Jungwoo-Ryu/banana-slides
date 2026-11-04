$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$SmokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('sola-smoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $SmokeRoot | Out-Null
$env:SOLA_DATA_DIR = Join-Path $SmokeRoot 'data'
$env:SOLA_SMOKE_REPORT = Join-Path $SmokeRoot 'report.json'
$SavedPath = Join-Path $SmokeRoot 'native-download.txt'
$env:SOLA_SMOKE_OUTPUT = Join-Path $RepoRoot '.runtime/wails-windows-smoke'
New-Item -ItemType Directory -Path $env:SOLA_SMOKE_OUTPUT -Force | Out-Null
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
$Executable = Join-Path $RepoRoot 'wails/build/bin/SolA.exe'
$Process = Start-Process $Executable -PassThru
try {
    & node (Join-Path $PSScriptRoot 'inspect-windows.mjs')
    if ($LASTEXITCODE -ne 0) { Write-Warning 'WebView2 inspection failed; collecting native window diagnostics.' }
    $Dialog = $null
    $Condition = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::NameProperty, 'Sol.A 파일 저장')
    $Deadline = [DateTime]::UtcNow.AddSeconds(90)
    while ([DateTime]::UtcNow -lt $Deadline -and -not $Process.HasExited) {
        $Dialog = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
            [System.Windows.Automation.TreeScope]::Children, $Condition)
        if ($null -ne $Dialog) { break }
        Start-Sleep -Milliseconds 500
    }
    if ($null -eq $Dialog) {
        $Windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
            [System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($Window in $Windows) { Write-Host ("Window: " + $Window.Current.Name + " / " + $Window.Current.ClassName) }
        throw 'The real WebView2 window did not reach its native save dialog.'
    }
    [Microsoft.VisualBasic.Interaction]::AppActivate('Sol.A 파일 저장')
    [System.Windows.Forms.SendKeys]::SendWait('%n')
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    [System.Windows.Forms.SendKeys]::SendWait($SavedPath)
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    if (-not $Process.WaitForExit(30000)) { throw 'Desktop did not exit after the save-dialog test.' }
    if ($Process.ExitCode -ne 0) { throw "Desktop exit code: $($Process.ExitCode)" }
    if (-not (Test-Path $env:SOLA_SMOKE_REPORT)) { throw 'The desktop verification report was not created.' }
    $Report = Get-Content $env:SOLA_SMOKE_REPORT | ConvertFrom-Json
    if (-not $Report.ui -or -not $Report.nativeSave -or $Report.runtime -ne 'wails-go') { throw 'Desktop verification failed.' }
    if ((Get-Content $SavedPath -Raw) -ne "Sol.A native file save verified`n") { throw 'Native download content differs.' }
    Get-Content $env:SOLA_SMOKE_REPORT
} finally {
    if (-not $Process.HasExited) { Stop-Process -Id $Process.Id -Force }
    $Log = Join-Path $env:LOCALAPPDATA 'SolA/logs/desktop.log'
    if (Test-Path $Log) { Get-Content $Log -Tail 80 }
    if (Test-Path $Log) { Copy-Item $Log (Join-Path $env:SOLA_SMOKE_OUTPUT 'desktop.log') -Force }
    Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
    Remove-Item Env:SOLA_SMOKE_REPORT -ErrorAction SilentlyContinue
    Remove-Item Env:SOLA_DATA_DIR -ErrorAction SilentlyContinue
}
