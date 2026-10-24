#!/usr/bin/env bash
# =========================================================
#  ReservaUJAP - Cargar datos de prueba (Linux / Mac)
#  Uso (desde la raiz del proyecto, con el sistema levantado):
#      bash scripts/cargar-datos-prueba.sh
# =========================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker compose ps --status running --services | grep -qx "servicio-python"; then
  echo "El sistema no esta corriendo. Primero ejecuta: docker compose up --build -d"
  exit 1
fi

# El script se ejecuta dentro del contenedor de Python (no hace falta instalar nada)
docker compose cp scripts/datos_prueba.py servicio-python:/tmp/datos_prueba.py
docker compose exec -T servicio-python python /tmp/datos_prueba.py cargar
