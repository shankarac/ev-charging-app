#!/usr/bin/env bash
set -euo pipefail

mkdir -p /var/data
mkdir -p data/sqlite data/email_outbox

exec uvicorn backend:app --host 0.0.0.0 --port "${PORT:?PORT is required}"
