#!/usr/bin/env bash
# =========================================================
#  ReservaUJAP - Quitar datos de prueba (Linux / Mac)
#  Borra solo los registros creados por cargar-datos-prueba.
#  No borra archivos ni los datos originales del sistema.
#  Uso (desde la raiz del proyecto, con el sistema levantado):
#      bash scripts/quitar-datos-prueba.sh
# =========================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker compose ps --status running --services | grep -qx "servicio-python"; then
  echo "El sistema no esta corriendo. Primero ejecuta: docker compose up --build -d"
  exit 1
fi

docker compose cp scripts/datos_prueba.py servicio-python:/tmp/datos_prueba.py
docker compose exec -T servicio-python python /tmp/datos_prueba.py quitar
