$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$SmokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('sola-smoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $SmokeRoot | Out-Null
$env:SOLA_DATA_DIR = Join-Path $SmokeRoot 'data'
$env:SOLA_SMOKE_REPORT = Join-Path $SmokeRoot 'report.json'
$SavedPath = Join-Path $SmokeRoot 'native-download.txt'
$env:SOLA_SMOKE_OUTPUT = Join-Path $RepoRoot '.runtime/wails-windows-smoke'
New-Item -ItemType Directory -Path $env:SOLA_SMOKE_OUTPUT -Force | Out-Null
function Save-DesktopScreenshot {
    $Bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $Screenshot = [System.Drawing.Bitmap]::new($Bounds.Width, $Bounds.Height)
    $Graphics = [System.Drawing.Graphics]::FromImage($Screenshot)
    try {
        $Graphics.CopyFromScreen($Bounds.Location, [System.Drawing.Point]::Empty, $Bounds.Size)
        $Screenshot.Save((Join-Path $env:SOLA_SMOKE_OUTPUT 'desktop.png'))
    } finally { $Graphics.Dispose(); $Screenshot.Dispose() }
}
$Executable = Join-Path $RepoRoot 'wails/build/bin/SolA.exe'
$Process = Start-Process $Executable -PassThru
try {
    $Dialog = $null
    $Condition = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::NameProperty, 'Sol.A 파일 저장')
    $Deadline = [DateTime]::UtcNow.AddSeconds(90)
    while ([DateTime]::UtcNow -lt $Deadline -and -not $Process.HasExited) {
        $Dialog = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
            [System.Windows.Automation.TreeScope]::Children, $Condition)
        if ($null -eq $Dialog) {
            $AppCondition = [System.Windows.Automation.PropertyCondition]::new(
                [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $Process.Id)
            $AppWindow = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
                [System.Windows.Automation.TreeScope]::Children, $AppCondition)
            if ($null -ne $AppWindow) {
                $Dialog = $AppWindow.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $Condition)
            }
        }
        if ($null -ne $Dialog) { break }
        Start-Sleep -Milliseconds 500
    }
    if ($null -eq $Dialog) {
        $Windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
            [System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($Window in $Windows) {
            Write-Host ("Window: " + $Window.Current.Name + " / " + $Window.Current.ClassName)
            if ($Window.Current.ProcessId -eq $Process.Id) {
                $Children = $Window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
                foreach ($Child in $Children) { Write-Host ("  Element: " + $Child.Current.Name + " / " + $Child.Current.ClassName) }
            }
        }
        throw 'The real WebView2 window did not reach its native save dialog.'
    }
    Save-DesktopScreenshot
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
    if (-not (Test-Path (Join-Path $env:SOLA_SMOKE_OUTPUT 'desktop.png'))) { Save-DesktopScreenshot }
    if (-not $Process.HasExited) { Stop-Process -Id $Process.Id -Force }
    $Log = Join-Path $env:SOLA_DATA_DIR 'logs/desktop.log'
    if (Test-Path $Log) { Get-Content $Log -Tail 80 }
    if (Test-Path $Log) { Copy-Item $Log (Join-Path $env:SOLA_SMOKE_OUTPUT 'desktop.log') -Force }
    Remove-Item Env:SOLA_SMOKE_REPORT -ErrorAction SilentlyContinue
    Remove-Item Env:SOLA_DATA_DIR -ErrorAction SilentlyContinue
}
