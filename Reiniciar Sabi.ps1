$ErrorActionPreference = 'Stop'

$listeners = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
$processIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)

foreach ($processId in $processIds) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
  if (-not $process -or $process.Name -ne 'node.exe' -or $process.CommandLine -notmatch 'server\.js') {
    throw "A porta 3000 está ocupada por um processo que não parece ser o servidor do Sabi. Nenhum processo foi encerrado."
  }

  $status = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/status' -TimeoutSec 3
  $features = $status.Content | ConvertFrom-Json
  if ($status.StatusCode -ne 200 -or $status.Headers['X-Sabi-App'] -ne 'Sabi' -or $features.features -notcontains 'fichas') {
    throw "O processo na porta 3000 não foi confirmado como o servidor do Sabi. Nenhum processo foi encerrado."
  }

  Write-Host "Encerrando o servidor Sabi (PID $processId)..."
  Stop-Process -Id $processId
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
  }
  if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
    throw "Não foi possível encerrar o processo do servidor Sabi (PID $processId)."
  }
}

if ($processIds.Count -eq 0) {
  Write-Host 'Nenhum servidor está ativo na porta 3000; iniciando o Sabi.'
}

$starter = Join-Path $PSScriptRoot 'Iniciar Sabi.bat'
Start-Process -FilePath $starter -WorkingDirectory $PSScriptRoot | Out-Null

$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    $status = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/status' -TimeoutSec 2
    $features = $status.Content | ConvertFrom-Json
    if ($status.StatusCode -eq 200 -and $status.Headers['X-Sabi-App'] -eq 'Sabi' -and $features.features -contains 'fichas') {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

if (-not $ready) {
  throw 'O Sabi não respondeu como esperado após a reinicialização.'
}

Write-Host 'Sabi reiniciado e API verificada com sucesso.'
