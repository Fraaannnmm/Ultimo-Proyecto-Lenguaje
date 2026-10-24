# =========================================================
#  ReservaUJAP - Quitar datos de prueba (Windows / PowerShell)
#  Borra solo los registros creados por cargar-datos-prueba.
#  No borra archivos ni los datos originales del sistema.
#  Uso (desde la raiz del proyecto, con el sistema levantado):
#      powershell -ExecutionPolicy Bypass -File scripts\quitar-datos-prueba.ps1
# =========================================================
Push-Location (Join-Path $PSScriptRoot "..")
try {
    $servicios = docker compose ps --status running --services
    if ($servicios -notcontains "servicio-python") {
        Write-Host "El sistema no esta corriendo. Primero ejecuta: docker compose up --build -d"
        exit 1
    }

    docker compose cp scripts/datos_prueba.py servicio-python:/tmp/datos_prueba.py
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    docker compose exec -T servicio-python python /tmp/datos_prueba.py quitar
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
