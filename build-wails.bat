@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\wails\build-windows.ps1"
if errorlevel 1 (
  echo Sol.A build failed. Review the error above.
  pause
  exit /b 1
)
echo Built: %~dp0wails\build\bin\SolA.exe
