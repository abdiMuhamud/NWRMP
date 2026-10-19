#!/usr/bin/env bash
# HTTPS for a server reached by IP address (or a name without a public certificate).
#
# Creates a private "NWRMP Test CA" once, then a server certificate for NWRMP_HOST signed by it.
# Install the CA certificate (certs/nwrmp-test-ca.crt, also downloadable from
# http://<server>/nwrmp-test-ca.crt) on the PCs and phones used for testing: they then trust
# the server, and phones allow GPS, the camera, offline mode and "Install app".
#
#   ./scripts/make-test-cert.sh                 # uses NWRMP_HOST from deploy/.env
#   ./scripts/make-test-cert.sh 10.20.30.40     # or give the IP address / name
#
# Re-run it if the server's IP address changes; the CA is kept, so devices need no change.
# The CA private key stays in deploy/test-ca/ (never mounted into a container, never in Git).
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${1:-$(grep -E '^NWRMP_HOST=' .env 2>/dev/null | cut -d= -f2 || true)}"
if [[ -z "$HOST" ]]; then
  echo "Usage: $0 <server-ip-or-name>   (or set NWRMP_HOST in deploy/.env)" >&2
  exit 1
fi
if [[ "$HOST" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then SAN="IP:${HOST}"; else SAN="DNS:${HOST}"; fi

mkdir -p certs test-ca
chmod 700 test-ca

if [[ ! -f test-ca/nwrmp-test-ca.key ]]; then
  openssl req -x509 -new -nodes -newkey rsa:3072 -sha256 -days 3650 \
    -keyout test-ca/nwrmp-test-ca.key -out test-ca/nwrmp-test-ca.crt \
    -subj "/O=Ministry of Water Development/CN=NWRMP Test CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  chmod 600 test-ca/nwrmp-test-ca.key
  echo "Created the NWRMP Test CA (valid 10 years)."
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
openssl req -new -nodes -newkey rsa:2048 -sha256 \
  -keyout "$work/privkey.pem" -out "$work/server.csr" -subj "/CN=${HOST}" 2>/dev/null
cat > "$work/server.ext" <<EOF
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=${SAN}
EOF
openssl x509 -req -in "$work/server.csr" -CA test-ca/nwrmp-test-ca.crt -CAkey test-ca/nwrmp-test-ca.key \
  -CAcreateserial -CAserial test-ca/nwrmp-test-ca.srl -out "$work/server.crt" -days 825 -sha256 \
  -extfile "$work/server.ext" 2>/dev/null

cat "$work/server.crt" test-ca/nwrmp-test-ca.crt > certs/fullchain.pem
install -m 600 "$work/privkey.pem" certs/privkey.pem
install -m 644 test-ca/nwrmp-test-ca.crt certs/nwrmp-test-ca.crt
chmod 644 certs/fullchain.pem

openssl verify -CAfile test-ca/nwrmp-test-ca.crt "$work/server.crt" > /dev/null
echo "Server certificate for ${HOST} (${SAN}) written to deploy/certs/ (valid 825 days)."
echo "Install certs/nwrmp-test-ca.crt on test devices, or download it from http://${HOST}/nwrmp-test-ca.crt"
echo "If nginx is already running, reload it:  docker compose exec web nginx -s reload"
