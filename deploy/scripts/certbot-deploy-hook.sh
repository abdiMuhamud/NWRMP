#!/usr/bin/env bash
# Called by certbot after it obtains or renews the certificate:
#   certbot certonly --webroot -w /opt/nwrmp/deploy/certbot-www -d <domain> \
#     --deploy-hook /opt/nwrmp/deploy/scripts/certbot-deploy-hook.sh
# Copies the new certificate into deploy/certs and reloads nginx without downtime.
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LIVE="${RENEWED_LINEAGE:?certbot sets RENEWED_LINEAGE}"

install -m 644 "$LIVE/fullchain.pem" "$DEPLOY_DIR/certs/fullchain.pem"
install -m 600 "$LIVE/privkey.pem" "$DEPLOY_DIR/certs/privkey.pem"
cd "$DEPLOY_DIR"
docker compose exec -T web nginx -s reload
echo "Certificate installed and nginx reloaded."
