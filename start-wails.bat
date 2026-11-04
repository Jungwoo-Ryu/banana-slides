@echo off
setlocal
cd /d "%~dp0"
if not exist "wails\build\bin\SolA.exe" (
  call build-wails.bat
  if errorlevel 1 exit /b 1
)
start "Sol.A" "%~dp0wails\build\bin\SolA.exe"
