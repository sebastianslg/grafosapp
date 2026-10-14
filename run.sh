#!/usr/bin/env bash
# Arranque local sin Docker: crea un entorno, instala dependencias y levanta la app en http://localhost:8000
set -e
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q -r backend/requirements.txt
cd backend && exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
