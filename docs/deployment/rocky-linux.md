# NWRMP — Deployment and end-to-end test on Rocky Linux

**Audience:** the systems engineer installing NWRMP on a Ministry server.
**Result:** NWRMP running on one Rocky Linux server over HTTPS at the server's IP address, with backups, and a signed-off end-to-end test.
**Time:** about 2 hours for installation, plus 1–2 hours for the end-to-end test.

Every command is run as `root` (or with `sudo`) unless stated otherwise. Text in `<angle brackets>` must be replaced with your own values; `<server-ip>` is the server's IP address, for example `10.20.30.40`.

> **No domain name yet.** This guide deploys NWRMP on the server's **IP address**. HTTPS uses a certificate from a private **NWRMP Test CA** created during installation; test PCs and phones install that CA once so they trust the server. When the Ministry has a domain name, follow §11 to switch: no rebuild is needed.

---

## 1. What you are installing

```
                Users: browsers on PCs, phones in the field
                     │  https://<server-ip>   (http redirects to https)
┌────────────────────┼──────────────────────────────────────────────┐
│ Rocky Linux server ▼                                              │
│   ┌──────────────────────────────────────┐                        │
│   │ web   nginx (nwrmp-web image)        │  app, HTTPS, /api/*    │
│   └──────────────────┬───────────────────┘                        │
│                      │ http://api:3001  (internal Docker network) │
│   ┌──────────────────▼───────────────────┐                        │
│   │ api   Node.js 22 (nwrmp-api image)   │──► volume: uploads     │
│   └──────────────────┬───────────────────┘    (inspection photos) │
│                      │ postgresql://db:5432  (internal only)      │
│   ┌──────────────────▼───────────────────┐                        │
│   │ db    PostgreSQL 17 + PostGIS 3.5    │──► volume: db-data     │
│   └──────────────────────────────────────┘                        │
└───────────────────────────────────────────────────────────────────┘
```

| Component | Image | Exposed | Data |
|---|---|---|---|
| `web` | `nwrmp-web` (built from `apps/web`, nginx 1.27) | ports **80**, **443** | — |
| `api` | `nwrmp-api` (built from `apps/api`, Node.js 22) | internal only | volume `nwrmp_uploads` |
| `db` | `postgis/postgis:17-3.5` | **not exposed** | volume `nwrmp_db-data` |

- Database migrations run automatically every time the API starts.
- The map background is loaded by users' browsers from `tiles.openfreemap.org` (OpenStreetMap data), so users need internet access for map backgrounds. Everything else is served by this server.
- Files used (all in the Git repository): `deploy/docker-compose.yml`, `deploy/.env.example`, `deploy/nginx/`, `deploy/scripts/`, `apps/api/Dockerfile`, `apps/web/Dockerfile`.

---

## 2. Before you start

| Item | Requirement |
|---|---|
| Server | Rocky Linux **9.x** (x86_64), fresh minimal install. Rocky 10 works with the same commands. |
| Size (minimum) | 2 vCPU, 4 GB RAM, 40 GB SSD |
| Size (recommended for national use) | 4 vCPU, 8 GB RAM, 100 GB SSD (each inspection photo is about 300 KB) |
| Address | A **fixed IP address** that test PCs and phones can reach (office network, VPN or public IP) |
| Network in | TCP 80 and 443 from users; TCP 22 from administrators |
| Network out (installation) | `dnf` mirrors, `download.docker.com`, Docker Hub, `registry.npmjs.org`, `github.com` |
| Test devices | Windows PCs with Chrome or Edge; Android phones with Chrome. You must be able to install a certificate on them (§6.3). |
| Access | Root or sudo on the server; a Ministry ICT person to receive the first administrator password |

> **Why the certificate matters:** phones allow GPS, the camera, offline mode and "Install app" only on HTTPS pages with a certificate they trust. The NWRMP Test CA (§6.2) gives you that on an IP address, once the CA is installed on each device.

---

## 3. Prepare the server

```bash
dnf -y update
dnf -y install git curl openssl tar policycoreutils-python-utils
timedatectl set-timezone Africa/Mogadishu
hostnamectl set-hostname <nwrmp-server-name>
```

Firewall — allow only SSH, HTTP and HTTPS:

```bash
systemctl enable --now firewalld
firewall-cmd --permanent --add-service=ssh --add-service=http --add-service=https
firewall-cmd --reload
firewall-cmd --list-services
```

SELinux stays **enforcing** (the Docker files are prepared for it). Check:

```bash
getenforce        # expected: Enforcing
```

If the server has 4 GB RAM or less, add swap (helps during image builds):

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap defaults 0 0' >> /etc/fstab
```

Reboot if the kernel was updated: `reboot`.

---

## 4. Install Docker Engine

Rocky Linux ships Podman, which conflicts with Docker's packages. Remove it, then install Docker CE from Docker's official repository:

```bash
dnf -y remove podman buildah runc 2>/dev/null || true
dnf -y install dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
```

Check:

```bash
docker version            # Client and Server versions shown
docker compose version    # v2.x
docker run --rm hello-world
```

> Behind an HTTP proxy? Configure it for the Docker daemon (`/etc/systemd/system/docker.service.d/http-proxy.conf`) and for builds (`HTTP_PROXY` / `HTTPS_PROXY` build arguments) before continuing.

---

## 5. Get the code

```bash
git clone https://github.com/abdiMuhamud/NWRMP.git /opt/nwrmp
cd /opt/nwrmp
git checkout main          # or a release tag agreed with the project team
git log --oneline -1       # note the commit for the test record (§9.5)
cd /opt/nwrmp/deploy
```

All remaining commands are run from **`/opt/nwrmp/deploy`**.

---

## 6. Configure

### 6.1 Settings

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 24       # copy the output: this is the database password
vi .env
```

Set at least:

| Variable | Value |
|---|---|
| `NWRMP_HOST` | the server's IP address, e.g. `10.20.30.40` |
| `POSTGRES_PASSWORD` | the value from `openssl rand -hex 24` (letters and digits only) |
| `TZ` | `Africa/Mogadishu` (default) |

`POSTGRES_PASSWORD` is used only when the database is first created. Store it in the Ministry's password safe.

### 6.2 HTTPS certificate for the IP address

Create the NWRMP Test CA and a certificate for the server's IP address:

```bash
./scripts/make-test-cert.sh
```

Expected output:

```
Created the NWRMP Test CA (valid 10 years).
Server certificate for 10.20.30.40 (IP:10.20.30.40) written to deploy/certs/ (valid 825 days).
Install certs/nwrmp-test-ca.crt on test devices, or download it from http://10.20.30.40/nwrmp-test-ca.crt
```

This writes:

| File | Purpose |
|---|---|
| `deploy/certs/fullchain.pem`, `deploy/certs/privkey.pem` | Server certificate and key, used by nginx |
| `deploy/certs/nwrmp-test-ca.crt` | CA certificate to install on test devices (public, safe to share) |
| `deploy/test-ca/nwrmp-test-ca.key` | CA private key — **keep secret**, back it up in the password safe; never copy it to devices |

If the server's IP address changes, update `NWRMP_HOST` and run the script again; the CA is kept, so devices need no change.

### 6.3 Trust the NWRMP Test CA on test devices

Do this once on every PC and phone used for testing. The CA certificate can be downloaded from `http://<server-ip>/nwrmp-test-ca.crt` once the stack is running (§7), or copied from `deploy/certs/nwrmp-test-ca.crt`.

**Android (Chrome):**

1. Open `http://<server-ip>/nwrmp-test-ca.crt` in Chrome; the file is downloaded.
2. Open **Settings → Security and privacy → More security settings → Encryption and credentials → Install a certificate → CA certificate** (wording varies by phone brand), confirm **Install anyway**, and choose the downloaded file.
3. Check: **Trusted credentials → User** lists *NWRMP Test CA*.

**Windows (Chrome and Edge):** open PowerShell **as Administrator** in the folder with the file and run:

```powershell
certutil -addstore -f Root nwrmp-test-ca.crt
```

Or double-click the file → **Install Certificate** → **Local Machine** → **Place all certificates in: Trusted Root Certification Authorities**. Restart the browser.

**iPhone (Safari):** open the download link, then **Settings → Profile Downloaded → Install**, then **Settings → General → About → Certificate Trust Settings** and switch on *NWRMP Test CA*.

**Firefox** uses its own certificate store: **Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import**.

> Only install this CA on Ministry test devices. Remove it after the test period, or when the server moves to a domain with a public certificate (§11).

---

## 7. Build and start

```bash
docker compose build       # first build: 10–15 minutes (downloads base images and packages)
docker compose up -d
docker compose ps
```

Wait until all three services show `healthy` (about 1 minute):

```
NAME          SERVICE   STATUS
nwrmp-db-1    db        Up (healthy)
nwrmp-api-1   api       Up (healthy)
nwrmp-web-1   web       Up (healthy)
```

Look at the API log — the first start applies the database migrations:

```bash
docker compose logs api | head -40
```

Expected lines include `Connected (postgres), applied migrations: 001-init, …, 005-field-inspections` and `NWRMP API listening`.

Check from the server:

```bash
curl -s --cacert certs/nwrmp-test-ca.crt https://<server-ip>/api/health
# {"status":"ok","database":"postgres","sources":0,...}
curl -sI http://<server-ip>/nwrmp-test-ca.crt | head -1
# HTTP/1.1 200 OK
```

On a PC where the CA is installed, open `https://<server-ip>`: the NWRMP sign-in page appears with a padlock and no warning.

---

## 8. First-time setup

Administration commands run inside the API container: `docker compose exec api node dist/cli.js <command>`. Run `docker compose exec api node dist/cli.js help` to list them.

### 8.1 First administrator

Create the ICT administrator. A **temporary password** is printed once; give it to that person securely.

```bash
docker compose exec api node dist/cli.js users:create \
  --email <ict.admin@ministry> --name "<Full Name>" --role admin --department ict
```

They sign in at `https://<server-ip>` and must choose a new password. Further users can then be created in the web app (**Administration → Users and roles**).

### 8.2 Staff accounts in bulk (optional)

Prepare a CSV (UTF-8) with the header `full_name,email,role,department,region`:

```csv
full_name,email,role,department,region
Xasan Carab Cawaale,xasan@ministry.example,department_reviewer,groundwater,
Field Officer Hargeisa,officer1@ministry.example,field_officer,regional_coordination,MJ
```

Roles: `admin`, `department_reviewer`, `data_officer`, `regional_coordinator`, `field_officer`, `lab_officer`, `maintenance_officer`, `viewer`. Field officers and regional coordinators need a region: `AW`, `MJ`, `SX`, `SN`, `SL`, `TG`. Department reviewers need the department `groundwater`, `shallow_wells` or `surface_water`.

```bash
docker compose cp staff.csv api:/tmp/staff.csv
docker compose exec api node dist/cli.js users:import /tmp/staff.csv
docker compose exec api cat /tmp/staff.passwords.local.txt   # hand out securely
docker compose exec -u root api rm /tmp/staff.csv /tmp/staff.passwords.local.txt
```

### 8.3 Data

- **For the end-to-end test** (recommended on a test installation), load the 64 example records. They are labelled "Sample data" in the app.

```bash
docker compose exec api node dist/cli.js seed
```

- **For production**, import the Ministry's own workbook (same template as the sample):

```bash
docker compose cp <national-water-sources>.xlsx api:/tmp/sources.xlsx
docker compose exec api node dist/cli.js seed /tmp/sources.xlsx
docker compose exec -u root api rm /tmp/sources.xlsx
```

The import report lists rows imported, skipped and data-quality issues; the issues are also shown in the app under **Data quality**.

### 8.4 Demo accounts for testing (optional)

Creates one account per role (`admin@nwrmp.test`, `coordinator.mj@nwrmp.test`, `field.mj@nwrmp.test`, …) with one shared password, printed once:

```bash
docker compose exec api node dist/cli.js users:demo
```

**Deactivate these accounts before go-live** (Users and roles → Deactivate), or test on a separate installation.

---

## 9. End-to-end test

Record each result in the sign-off table (§9.5). Use a PC with Chrome or Edge and an Android phone with Chrome, both with the NWRMP Test CA installed (§6.3). The tests use the demo accounts (§8.4) and the sample data (§8.3).

### 9.1 Automated smoke test

On the server (or any Linux/macOS machine with `bash` and `curl`):

```bash
./scripts/smoke-test.sh https://<server-ip> --cacert certs/nwrmp-test-ca.crt
```

It asks for an administrator email and password (use an account whose temporary password has been changed). **Expected: all 24 checks PASS** — HTTPS redirect, security headers, API health, installable-app files, sign-in, secure session cookie, all main API endpoints, sign-out.

### 9.2 Web application (PC browser)

| # | Test | Steps | Expected result |
|---|---|---|---|
| W1 | Sign-in protection | Open `https://<server-ip>/sources` while signed out | Redirected to the branded sign-in page |
| W2 | First sign-in | Sign in with a temporary password (§8.1) | Forced to choose a new password; then the dashboard |
| W3 | Dashboard | Open Dashboard | Totals, charts by type and region, map with markers, "Sample data" banner |
| W4 | Map | Open Map; switch colour Type/Status; untick a type; click a marker | Markers filter; popup opens; "Open record" shows the record |
| W5 | Registry | Water sources: search "Xaraf", filter by region and status, sort, open a record | Results change; record page shows all sections, nearby sources, history |
| W6 | Region limits | Sign in as `coordinator.mj@nwrmp.test` | Only Maroodi Jeex sources everywhere; no region filter shown |
| W7 | Register a source | As `coordinator.mj`: Water sources → Register a source; choose Shallow well; fill the name, click the map for the location, set people served; Submit | "New source sent for approval"; request shows *Waiting for review* |
| W8 | Approval routing | As `surfacewater@nwrmp.test` open Approvals | The shallow-well request is **not** listed (another department) |
| W9 | Approve | As `shallowwells@nwrmp.test`: Approvals → open the request → Approve | Record created with a code like `SW-MJ-000NN`; visible on the map and registry |
| W10 | Edit and reject | As `coordinator.mj`: open the new record → Propose changes → pH 7.5 → Submit. As `shallowwells`: Reject with a reason | Request shows *Rejected* with the reason; record unchanged |
| W11 | Validation | Propose a change with pH = 30 | Field error "Must be at most 14"; nothing submitted |
| W12 | Separation of duties | As `shallowwells`, propose a change to a shallow well and open the request | Approve not offered: "You cannot approve your own request" |
| W13 | User admin | As `admin@nwrmp.test`: Users and roles → Add user (field officer, region Sool) | Temporary password shown once; user listed "Awaiting first sign-in" |
| W14 | Lockout | Sign in 5 times with a wrong password for `viewer@nwrmp.test`, then with the right one | 6th attempt: "Too many failed attempts"; works again after 15 minutes |
| W15 | Audit log | As admin: Administration → Audit log | Sign-ins, requests, approvals and user changes from the tests above, with user, time and IP |
| W16 | Data quality | Data quality page | Issues from the sample import listed with sheet and row |

### 9.3 Field inspections (Android phone + PC)

| # | Test | Steps | Expected result |
|---|---|---|---|
| F1 | Assign | PC, as `coordinator.mj`: Inspections → Assign inspections → *Maroodi Jeex Field Officer*, tick 2 sources, due date, note → Assign | "2 inspections assigned"; listed under Assignments |
| F2 | Install app | Phone (CA installed, §6.3), Chrome: open `https://<server-ip>`, sign in as `field.mj@nwrmp.test`; ⋮ menu → **Install app** | Padlock, no warning; NWRMP icon on the home screen; opens full screen |
| F3 | Assignment list | Open the app → My inspections | Both sources listed with location, due date and the coordinator's note |
| F4 | Online inspection | Start inspection on source 1: status *Not functioning*, add a reason; **Record GPS position** (allow location); **Take photo** ×2 (allow camera); Send | GPS shows accuracy and distance to the registered point; "Inspection sent for review" |
| F5 | Offline inspection | Turn on **airplane mode**. Start inspection on source 2, change people served, record GPS, take a photo, Save | "Saved on this phone"; *Waiting to send* list shows it; top bar "Offline · 1 to send" |
| F6 | Automatic sending | Turn airplane mode **off**; keep the app open about 30 seconds | Item leaves *Waiting to send*; assignment shows "Sent · waiting for review" |
| F7 | Review and return | PC, as `coordinator.mj`: Inspections → To review → open inspection 2 → Return with a comment | Phone (refresh): listed under *Returned for correction* with the comment |
| F8 | Correct and resend | Phone: open the returned inspection, correct, Send correction | Back in the coordinator's review list |
| F9 | Approve | PC: open inspection 1 → check values found, photos (click to enlarge), GPS map → Approve | "Approved"; record shows the new status, **Verified**, and a history entry "Field inspection of <date>: updated … fields" by the field officer |
| F10 | Location correction | Approve inspection 2 with "Move the registered location to the GPS position" ticked (offered when more than 50 m away) | The record's map position moves to the phone's GPS point |
| F11 | Photo privacy | Copy a photo address (`/api/inspections/photos/…`) and open it in a private browser window | 401 — sign-in required |

### 9.4 Operations

| # | Test | Steps | Expected result |
|---|---|---|---|
| O1 | Restart resilience | `reboot` the server; after boot run `docker compose ps` | All services `healthy`; data and photos still present |
| O2 | Ports | From another machine: `nmap -Pn -p 22,80,443,3001,5432 <server-ip>` (or `ss -tlnp` on the server) | Only 22, 80, 443 open; 3001 and 5432 closed |
| O3 | Backup | `./scripts/backup.sh` | `db-*.dump` and `uploads-*.tar.gz` created in `/var/backups/nwrmp` |
| O4 | Restore drill (**test installation only — replaces all data**) | Note the number of sources; register one more; `./scripts/restore.sh /var/backups/nwrmp/db-<stamp>.dump /var/backups/nwrmp/uploads-<stamp>.tar.gz` | After the restore the extra source is gone; inspection photos from §9.3 still display |
| O5 | Update procedure | `./scripts/update.sh` | Backup taken, images rebuilt, "API healthy (version <commit>)" |
| O6 | Logs | `docker compose logs --tail 50 api web` | Request activity visible; no repeated errors |

### 9.5 Sign-off

| Section | Result (Pass / Fail / N/A) | Notes | Tested by / date |
|---|---|---|---|
| 9.1 Smoke test | | | |
| 9.2 Web application W1–W16 | | | |
| 9.3 Field inspections F1–F11 | | | |
| 9.4 Operations O1–O6 | | | |
| Commit / version deployed | | | |

---

## 10. Operating the service

### Backups (set up before go-live)

```bash
cat > /etc/cron.d/nwrmp-backup <<'EOF'
30 1 * * * root /opt/nwrmp/deploy/scripts/backup.sh >> /var/log/nwrmp-backup.log 2>&1
EOF
```

Backups are kept 14 days in `/var/backups/nwrmp` (`RETENTION_DAYS` and `BACKUP_DIR` can be set in the cron line). **Copy them off the server daily** (another server, NAS or object storage): a backup on the same disk does not protect against disk loss. Also keep a copy of `deploy/.env` and `deploy/test-ca/` in the password safe.

### Updating to a new version

```bash
cd /opt/nwrmp/deploy && ./scripts/update.sh            # latest main
./scripts/update.sh <tag-or-commit>                    # a specific version
```

The script backs up first, rebuilds, restarts and waits for the API to be healthy. Migrations run automatically.

### Useful commands

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| Logs (follow) | `docker compose logs -f api` (or `web`, `db`) |
| Restart one service | `docker compose restart api` |
| Stop / start everything | `docker compose down` / `docker compose up -d` (data is kept in volumes) |
| Admin commands | `docker compose exec api node dist/cli.js help` |
| Database shell | `docker compose exec db psql -U nwrmp -d nwrmp` |
| Disk used by data | `docker system df -v` |
| Reset a user's password | Web: Users and roles → key icon (temporary password shown once) |
| New certificate after an IP change | `./scripts/make-test-cert.sh && docker compose exec web nginx -s reload` |

### Monitoring

Point the Ministry's monitoring at `https://<server-ip>/api/health` (expects HTTP 200 and `"status":"ok"`). Also watch disk space on `/var/lib/docker` and `/var/backups`.

### Changing the database password later

```bash
docker compose exec db psql -U nwrmp -d nwrmp -c "ALTER USER nwrmp PASSWORD '<new-hex-password>';"
# then update POSTGRES_PASSWORD in .env and:
docker compose up -d api
```

---

## 11. Moving to a domain name later

When the Ministry has a domain name (for example `nwrmp.mowd.gov.so`):

1. Create a DNS record pointing the name to the server's IP address.
2. Set `NWRMP_HOST=<domain>` in `deploy/.env`.
3. Install a certificate for the domain in `deploy/certs/`, choosing one option:
   - **Government / Ministry CA:** copy the issued files to `certs/fullchain.pem` (certificate with chain) and `certs/privkey.pem` (key, `chmod 600`).
   - **Let's Encrypt** (domain reachable from the internet on port 80):

```bash
dnf -y install epel-release && dnf -y install certbot
certbot certonly --webroot -w /opt/nwrmp/deploy/certbot-www -d <domain> \
  --agree-tos -m <ict-email@ministry> --no-eff-email \
  --deploy-hook /opt/nwrmp/deploy/scripts/certbot-deploy-hook.sh
systemctl enable --now certbot-renew.timer     # automatic renewal; the hook reloads nginx
```

4. Reload nginx: `docker compose exec web nginx -s reload`. No rebuild is needed: the site answers on any address.
5. Tell users the new address; installed phone apps must be reinstalled from the new address.
6. Remove the NWRMP Test CA from test devices and archive `deploy/test-ca/`.

---

## 12. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Browser warns "Your connection is not private" | NWRMP Test CA not installed on this device, or opened by a different address than the certificate | Install the CA (§6.3); use exactly `https://<server-ip>`; if the IP changed, run `make-test-cert.sh` again |
| `web` keeps restarting | Certificate files missing | `docker compose logs web`; run `./scripts/make-test-cert.sh` (§6.2) |
| 502 Bad Gateway when signing in | API not healthy | `docker compose logs api`; often a wrong `POSTGRES_PASSWORD` after the database was created with another one |
| API log: `password authentication failed` | `.env` password changed after the first start | Put the original password back in `.env`, or change it in the database (§10) |
| Sign-in succeeds but returns to the sign-in page | Site opened over plain HTTP, so the Secure cookie is dropped | Always use `https://`; check that HTTP redirects to HTTPS |
| Phone: no "Install app", GPS or camera refused | CA not installed on the phone, or site opened over HTTP | Install the CA (§6.3) and reopen `https://<server-ip>`; in Chrome site settings allow Location and Camera |
| Map shows markers but no background | Devices cannot reach `tiles.openfreemap.org` | Allow it in the firewall/proxy, or self-host a basemap and set `VITE_MAP_STYLE_URL`, then `docker compose build web && docker compose up -d` |
| Photo upload fails with 413 | Request larger than 10 MB | Phones compress photos automatically; check nginx `client_max_body_size` if another client is used |
| `docker compose build` fails downloading packages | No outbound internet or proxy needed | See the proxy note in §4; or build the images elsewhere and move them with `docker save` / `docker load` |
| Permission denied on `deploy/certs` inside the container | SELinux label | The compose file uses `:z`; if files were moved in, run `restorecon -Rv /opt/nwrmp/deploy/certs`; check `ausearch -m avc -ts recent` |
| Everything stopped after a reboot | Docker not enabled | `systemctl enable --now docker`; services restart automatically (`restart: unless-stopped`) |

---

## 13. Security checklist before go-live

- [ ] HTTPS works without warnings on all test devices; HTTP redirects to HTTPS (smoke test passes).
- [ ] Only ports 22, 80, 443 open (test O2). SSH restricted to administrators (keys, no root password login).
- [ ] `deploy/.env` is `chmod 600`; the database password and `deploy/test-ca/` are stored in the Ministry password safe.
- [ ] The NWRMP Test CA is installed only on Ministry devices; plan the move to a domain certificate (§11).
- [ ] Demo accounts deactivated, or never created on the production server.
- [ ] Every person has their own account; shared accounts are not used.
- [ ] Nightly backups running and copied off the server; a restore has been tested (O4) on a test installation.
- [ ] `dnf -y update` scheduled monthly (with a reboot window); `./scripts/update.sh` used for NWRMP updates.
- [ ] Monitoring checks `https://<server-ip>/api/health`.

---

## 14. Reference

### Settings (`deploy/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NWRMP_HOST` | yes | — | Server IP address (or domain name later); used by the certificate script |
| `POSTGRES_PASSWORD` | yes | — | Database password (set before the first start) |
| `TZ` | no | `Africa/Mogadishu` | Time zone for containers |
| `NWRMP_VERSION` | no | `latest` | Image tag (set automatically by `update.sh`) |
| `PG_POOL_MAX` | no | `10` | Database connections per API instance |
| `VITE_MAP_STYLE_URL` | no | OpenFreeMap | Map style (requires `docker compose build web` after changing) |

### Files on the server

| Path | Content |
|---|---|
| `/opt/nwrmp` | Git checkout of the application |
| `/opt/nwrmp/deploy/.env` | Settings and secrets (not in Git) |
| `/opt/nwrmp/deploy/certs/` | Server certificate, key and the public CA certificate (not in Git) |
| `/opt/nwrmp/deploy/test-ca/` | NWRMP Test CA private key (secret, not in Git) |
| Docker volume `nwrmp_db-data` | PostgreSQL data |
| Docker volume `nwrmp_uploads` | Inspection photos |
| `/var/backups/nwrmp/` | Nightly backups |

### Administration commands (`docker compose exec api node dist/cli.js …`)

| Command | Purpose |
|---|---|
| `help` | List commands |
| `migrate` | Apply migrations (also automatic at API start) |
| `seed [--reset] [file.xlsx]` | Import the sample or a Ministry workbook |
| `users:create --email … --name "…" --role … [--department …] [--region …]` | One user, temporary password printed |
| `users:import <file.csv>` | Many users from a CSV file |
| `users:demo` | One demo account per role (testing only) |

### Scripts (`deploy/scripts/`)

| Script | Purpose |
|---|---|
| `make-test-cert.sh` | NWRMP Test CA and the certificate for the server's IP address |
| `smoke-test.sh` | Automated checks of a running installation |
| `backup.sh` | Database and photo backup (nightly from cron) |
| `restore.sh` | Restore a backup (replaces all data) |
| `update.sh` | Back up, update to a new version, restart, wait for health |
| `certbot-deploy-hook.sh` | Installs renewed Let's Encrypt certificates (domain name only) |
