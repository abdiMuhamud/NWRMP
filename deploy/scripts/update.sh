#!/usr/bin/env bash
# Deploys the latest code from the main branch. Database migrations run automatically
# when the API starts. Take a backup first (this script does).
#   ./scripts/update.sh            # latest main
#   ./scripts/update.sh <git-ref>  # a specific tag or commit
set -euo pipefail
cd "$(dirname "$0")/.."

REF="${1:-main}"
./scripts/backup.sh

git -C .. fetch --tags origin
git -C .. checkout "$REF"
[[ "$REF" == "main" ]] && git -C .. pull --ff-only origin main

export NWRMP_VERSION="$(git -C .. rev-parse --short HEAD)"
echo "Building version $NWRMP_VERSION..."
docker compose build
docker compose up -d
docker image prune -f > /dev/null

echo "Waiting for the API to report healthy..."
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q api)")"
  [[ "$status" == "healthy" ]] && { echo "API healthy (version $NWRMP_VERSION)."; exit 0; }
  sleep 5
done
echo "API did not become healthy. Check: docker compose logs api" >&2
exit 1
