# =========================================================
#  ReservaUJAP - Cargar datos de prueba (Windows / PowerShell)
#  Uso (desde la raiz del proyecto, con el sistema levantado):
#      powershell -ExecutionPolicy Bypass -File scripts\cargar-datos-prueba.ps1
# =========================================================
Push-Location (Join-Path $PSScriptRoot "..")
try {
    $servicios = docker compose ps --status running --services
    if ($servicios -notcontains "servicio-python") {
        Write-Host "El sistema no esta corriendo. Primero ejecuta: docker compose up --build -d"
        exit 1
    }

    # El script se ejecuta dentro del contenedor de Python (no hace falta instalar nada)
    docker compose cp scripts/datos_prueba.py servicio-python:/tmp/datos_prueba.py
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    docker compose exec -T servicio-python python /tmp/datos_prueba.py cargar
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
