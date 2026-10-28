@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Reiniciar Sabi.ps1"
set "RESULTADO=%ERRORLEVEL%"
if not "%RESULTADO%"=="0" pause
exit /b %RESULTADO%
