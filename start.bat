@echo off
setlocal
set PYTHONUTF8=1
chcp 65001 >nul
cd /d "%~dp0"
where uv >nul 2>&1
if errorlevel 1 (
  echo [오류] uv가 필요합니다. PowerShell에서 winget install astral-sh.uv 를 실행한 뒤 다시 시작하세요.
  pause
  exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
  echo [오류] Node.js 22.23.4 LTS 또는 보안 패치 버전을 설치한 뒤 다시 시작하세요.
  pause
  exit /b 1
)
echo Python 환경을 준비합니다...
set UV_NATIVE_TLS=true
uv sync --frozen --python 3.12
if errorlevel 1 (
  echo [오류] 의존성 설치에 실패했습니다. 네트워크와 사내 인증서 설정을 확인하세요.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" scripts\start_local.py %*
if errorlevel 1 (
  pause
  exit /b 1
)
endlocal
