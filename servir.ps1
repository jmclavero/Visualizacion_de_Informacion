# Sirve el repositorio en http://localhost:8000.
#
# Web Serial y WebUSB solo funcionan en un contexto seguro:
#   - http://localhost
#   - https://...
# NO funcionan abriendo el archivo con doble clic (file://).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\servir.ps1
#
# Luego abre en Chrome o Edge:
#   http://localhost:8000/E2/v1/arduino.html

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "Servidor local en http://localhost:8000" -ForegroundColor Cyan
Write-Host "Arduino:  http://localhost:8000/E2/v1/arduino.html" -ForegroundColor Yellow
Write-Host "Perilla:  http://localhost:8000/E2/v1/knob.html" -ForegroundColor Yellow
Write-Host "Ctrl+C para detener." -ForegroundColor Gray
Write-Host ""

if (Get-Command py -ErrorAction SilentlyContinue) {
  py -m http.server 8000
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  python -m http.server 8000
} else {
  Write-Host "No se encontró Python. Instálalo o usa otro servidor local." -ForegroundColor Red
  exit 1
}
