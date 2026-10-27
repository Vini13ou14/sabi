@echo off
setlocal
set "APP_DIR=%~dp0pagina-inicial"
set "APP_URL=http://127.0.0.1:3000"

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%APP_URL%/api/me' -TimeoutSec 2; if ($response.StatusCode -eq 200 -and $response.Headers['X-Sabi-App'] -eq 'Sabi') { exit 0 } } catch { exit 1 }; exit 1" >nul 2>nul
if not errorlevel 1 goto abrir

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js 22.13 ou superior para executar o Sabi.
  echo Depois, clique duas vezes neste arquivo novamente.
  pause
  exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)"
if errorlevel 1 (
  echo Esta aplicacao precisa do Node.js 22.13 ou superior.
  echo Versao encontrada:
  node --version
  pause
  exit /b 1
)

start "Sabi - servidor local" /D "%APP_DIR%" node --disable-warning=ExperimentalWarning server.js

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ready = $false; for ($i = 0; $i -lt 30; $i++) { try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%APP_URL%/api/me' -TimeoutSec 1; if ($response.StatusCode -eq 200 -and $response.Headers['X-Sabi-App'] -eq 'Sabi') { $ready = $true; break } } catch { Start-Sleep -Milliseconds 500 } }; if ($ready) { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo O servidor nao iniciou. Confira a janela "Sabi - servidor local" para ver o erro.
  pause
  exit /b 1
)

:abrir
start "" "%APP_URL%"
exit /b 0
