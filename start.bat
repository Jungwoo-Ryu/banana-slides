@echo off
rem Default desktop entrypoint: Go + Wails. For browser development use start-web.bat.
call "%~dp0start-wails.bat" %*
exit /b %errorlevel%
