#!/usr/bin/env bash
# Ship the server to the Oracle VM and (re)start it. The image is built on the VM (ARM).
# Usage from anywhere:  server/deploy/deploy.sh [ssh-host]     (default host: trofficient)
set -euo pipefail

HOST="${1:-trofficient}"
cd "$(dirname "$0")/../.."

ssh "$HOST" 'mkdir -p ~/steppool/server ~/steppool/shared'
rsync -az --delete --exclude node_modules --exclude dist --exclude '.env*' server/ "$HOST":steppool/server/
rsync -az --delete shared/ "$HOST":steppool/shared/

ssh "$HOST" '
  set -e
  cd ~/steppool
  [ -f .env ] || { echo "Missing ~/steppool/.env (see server/deploy/env.example)"; exit 1; }
  docker compose -f server/deploy/docker-compose.yml up -d --build
  for i in $(seq 1 20); do
    s=$(docker inspect -f "{{.State.Health.Status}}" steppool-api)
    [ "$s" = healthy ] && { echo "steppool-api is healthy"; exit 0; }
    sleep 3
  done
  docker logs --tail 40 steppool-api
  exit 1
'
