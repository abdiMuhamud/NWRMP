#!/usr/bin/env bash
# Automated checks of a running NWRMP installation, from any machine with curl.
#   ./scripts/smoke-test.sh http://10.20.30.40:8080                                # plain HTTP (NWRMP_PROTOCOL=http)
#   ./scripts/smoke-test.sh https://10.20.30.40 --cacert certs/nwrmp-test-ca.crt   # NWRMP Test CA (IP address)
#   ./scripts/smoke-test.sh https://nwrmp.example.gov                              # publicly trusted certificate
#   ./scripts/smoke-test.sh https://10.20.30.40 --insecure                         # skip certificate checks
# With HTTPS on a server whose HTTP port is not 80, set HTTP_PORT (e.g. HTTP_PORT=8080) for the redirect check.
# Prompts for an administrator email and password for the signed-in checks.
set -uo pipefail

BASE="${1:?Usage: $0 <http|https>://<ip-or-name>[:port] [--cacert <file> | --insecure]}"
BASE="${BASE%/}"
case "$BASE" in
  https://*) TLS=1 ;;
  http://*) TLS=0 ;;
  *) echo "The address must start with http:// or https://" >&2; exit 2 ;;
esac
CURL=(curl -sS --max-time 20)
case "${2:-}" in
  --insecure) CURL+=(-k) ;;
  --cacert) CURL+=(--cacert "${3:?--cacert needs a file}") ;;
esac
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

pass=0; fail=0
check() { # name, condition-result (0 = ok), detail
  if [[ "$2" == "0" ]]; then echo "  PASS  $1"; pass=$((pass + 1)); else echo "  FAIL  $1 ${3:+($3)}"; fail=$((fail + 1)); fi
}
code() { "${CURL[@]}" -o /dev/null -w '%{http_code}' "$@"; }

echo "Public checks against $BASE"
headers="$("${CURL[@]}" -D - -o /dev/null "$BASE/")"
if (( TLS )); then
  hostname="${BASE#https://}"; hostname="${hostname%%:*}"
  redirect="$("${CURL[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "http://${hostname}${HTTP_PORT:+:$HTTP_PORT}/")"
  [[ "$redirect" == 30[18]\ https://* ]]; check "HTTP redirects to HTTPS" $? "$redirect"
  grep -qi '^strict-transport-security' <<<"$headers"; check "HSTS header present" $?
else
  echo "  SKIP  HTTPS redirect and HSTS (the site runs on plain HTTP)"
fi

page="$("${CURL[@]}" "$BASE/")"
[[ "$page" == *'id="root"'* ]]; check "Web app loads" $?
grep -qi '^x-content-type-options: nosniff' <<<"$headers"; check "nosniff header present" $?

health="$("${CURL[@]}" "$BASE/api/health")"
[[ "$health" == *'"status":"ok"'* && "$health" == *'"database":"postgres"'* ]]; check "API healthy on PostgreSQL" $? "$health"

[[ "$(code "$BASE/manifest.webmanifest")" == 200 ]]; check "App manifest served (installable app)" $?
[[ "$(code "$BASE/sw.js")" == 200 ]]; check "Service worker served (offline support)" $?
[[ "$(code "$BASE/field")" == 200 ]]; check "Deep links load the app" $?
[[ "$(code "$BASE/api/sources")" == 401 ]]; check "API refuses requests without sign-in" $?
[[ "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/auth/login")" == 403 ]]; check "API refuses posts without the CSRF header" $?

echo
read -r -p "Administrator email: " EMAIL
read -r -s -p "Password: " PASSWORD; echo
body="$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASSWORD")"

login_headers="$("${CURL[@]}" -D - -o /dev/null -c "$JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: nwrmp' -d "$body" "$BASE/api/auth/login")"
grep -q ' 200' <<<"$(head -1 <<<"$login_headers")"; check "Administrator can sign in" $?
cookie="$(grep -i '^set-cookie: nwrmp_session' <<<"$login_headers")"
if (( TLS )); then
  [[ "$cookie" == *HttpOnly* && "$cookie" == *Secure* && "$cookie" == *SameSite=Lax* ]]; check "Session cookie is HttpOnly, Secure, SameSite=Lax" $?
else
  [[ "$cookie" == *HttpOnly* && "$cookie" != *Secure* && "$cookie" == *SameSite=Lax* ]]; check "Session cookie is HttpOnly, SameSite=Lax (not Secure on plain HTTP)" $?
fi

me="$("${CURL[@]}" -b "$JAR" "$BASE/api/auth/me")"
[[ "$me" == *'users.manage'* ]]; check "Signed-in user has administrator permissions" $?
if [[ "$me" == *'"mustChangePassword":true'* ]]; then
  echo "  NOTE  This account still has a temporary password: sign in through the browser and change it, then re-run."
else
  for path in /api/reference /api/stats/summary "/api/sources?pageSize=1" /api/sources/geojson /api/data-quality /api/change-requests/counts /api/inspections/counts /api/water-quality/parameters /api/work-orders/counts /api/users "/api/audit?pageSize=1"; do
    [[ "$(code -b "$JAR" "$BASE$path")" == 200 ]]; check "GET $path" $?
  done
fi
[[ "$(code -b "$JAR" -X POST -H 'X-Requested-With: nwrmp' "$BASE/api/auth/logout")" == 204 ]]; check "Sign out" $?
[[ "$(code -b "$JAR" "$BASE/api/auth/me")" == 401 ]]; check "Session ends after sign-out" $?

echo
echo "Result: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
