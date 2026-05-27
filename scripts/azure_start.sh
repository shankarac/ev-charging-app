#!/usr/bin/env bash
set -euo pipefail

mkdir -p /home/data

if [[ "${DATABASE_ENGINE:-sqlite}" == "sqlite" ]]; then
  export SQLITE_PATH="${SQLITE_PATH:-/home/data/ev_app.db}"
fi

exec uvicorn backend:app --host 0.0.0.0 --port "${PORT:-8000}"
