# NWRMP — National Water Resource Management Platform

Digital platform of the **Ministry of Water Development** (Wasaaradda Horumarinta Biyaha) for registering,
mapping and monitoring the country's water sources: boreholes, shallow wells, berkads, dams and springs.

This repository holds **Phase 1 — Registry & GIS** and **Sprint A — users and control**:

- **Sign-in, roles and region limits**: seven roles mapped to the Ministry's departments; regional staff see only their region.
- **Approval workflow**: every new source and every edit is a request that the responsible department approves or rejects.
- **Change history and audit log**: who changed what and when, for every record and every sign-in.
- **User administration**: create users with temporary passwords, change roles, reset passwords, deactivate.
- **Dashboard**: sources by type and region, functioning rate, people and livestock served, power, water quality and condition.
- **Water-source registry**: search, filter, sort and page through every record; a full record page for each source.
- **National map**: MapLibre map coloured by type or status, with a distinct marker shape per type.
- **Nearby search**: other sources within a radius, measured on the ground with PostGIS.
- **Spreadsheet import with data-quality log**: cleans legacy Excel data and records every problem it finds.
- **Roadmap pages** for the later phases (inspections, water quality, maintenance, reports, forms, users, mobile).

## Stack

| Layer | Technology |
|---|---|
| Web | React 19 + TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router |
| Maps | MapLibre GL, OpenStreetMap basemap (OpenFreeMap; self-host PMTiles in production) |
| API | NestJS 11 (TypeScript) |
| Database | PostgreSQL + PostGIS (Neon on Vercel for testing; government server in production) |
| Local database | PGlite (embedded PostgreSQL + PostGIS) — no installation needed |

```
apps/
  api/   NestJS API, database migrations, Excel importer (data/ holds the sample workbook)
  web/   React web application
```

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm run setup
```

```bash
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:3001/api (health check: `/api/health`)

With no `DATABASE_URL` set, the API starts an embedded PostgreSQL + PostGIS database in `apps/api/.pglite`,
imports the sample workbook and creates one demo account per role on first start. The demo sign-in details
are written to `apps/api/demo-accounts.local.txt` (git-ignored). To use a real PostgreSQL server instead, copy
`apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`.

Database commands (run inside `apps/api`, with the API stopped when using the embedded database):

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Import the sample workbook if the database is empty |
| `npm run db:reset` | Delete all water sources and re-import the sample |
| `npm run db:seed -- path/to/file.xlsx` | Import another workbook in the Ministry template |
| `npm run users:demo` | Create the demo accounts (details go to `demo-accounts.local.txt`) |
| `npm run users:create -- --email … --name "…" --role admin` | Create one user with a temporary password |

## Users, roles and approvals

| Role | Typical department | Can |
|---|---|---|
| Administrator | ICT | Everything, including users and the audit log |
| Department reviewer | Groundwater · Shallow wells · Surface water | Approve changes for their source types; propose changes |
| Regional coordinator | Regional coordination | Register and edit sources **in their region**, which then go for approval |
| Field officer | Regional staff | View their region (field collection arrives in Sprint B) |
| Lab officer / Maintenance officer | Water quality lab / O&M | View (their modules arrive in Sprint C) |
| Viewer | Leadership, research | View dashboards, registry and data quality |

Approvals are routed by source type: Groundwater approves boreholes and springs, Shallow wells approves shallow
wells, Surface water approves dams and berkads. Nobody can approve their own request, and a rejection needs a reason.

Security: passwords are hashed with scrypt; sessions are server-side and stored in an `HttpOnly`, `Secure`,
`SameSite=Lax` cookie; state-changing requests must carry `X-Requested-With: nwrmp`; five failed sign-ins lock
an account for 15 minutes; every sign-in, request, decision and admin action is written to the audit log.

## Deploy to Vercel (testing)

The repository deploys as **two Vercel projects** from the same GitHub repo, plus a Neon database.

1. **API project**: in Vercel, *Add New → Project*, import `abdiMuhamud/NWRMP`, set **Root Directory** to `apps/api`.
   `apps/api/vercel.json` builds `src/vercel.ts` as a serverless function.
2. **Database**: in the API project, *Storage → Create Database → Neon (Postgres)* and connect it.
   This sets `DATABASE_URL`. Migrations run automatically on the first request.
3. **Load the sample data** into Neon from your computer:
   ```bash
   cd apps/api && vercel link && vercel env pull .env && npm run db:seed
   ```
4. **Demo accounts** in Neon (details are appended to `apps/api/demo-accounts.local.txt`):
   ```bash
   cd apps/api && npm run users:demo
   ```
5. **Web project**: *Add New → Project*, same repo, **Root Directory** `apps/web` (framework: Vite).
   `apps/web/vercel.json` forwards `/api/*` to the API project, so the web app and API share one origin and the
   session cookie works. If your API project has a different URL, change the rewrite destination there.

## Data import

`apps/api/src/import` reads workbooks in the Ministry template (one sheet per source type). It:

- maps column headers to fields, tolerating spacing and known misspellings (`Attitude`, `sesonal`, `Dam_wedth`, …);
- separates numbers from units (`"17 m3/hr"` → 17), reads day/month/year dates, and normalises Yes/No;
- normalises region names (e.g. *Woqooyi Galbeed* → *Maroodi Jeex*);
- gives every source a national code (`BH-MJ-00012` = borehole, Maroodi Jeex, number 12);
- stores each inspection and intervention as its own dated record, so history is never overwritten;
- logs every problem (contradictions, unknown values, possible duplicates within 100 m) to the **Data quality** page.

## To confirm with the Ministry

- The official list of regions and districts, and their boundaries (GIS layers) for the map.
- The meaning of the `dw_*` columns on the borehole sheet (assumed: the dug well beside the borehole).
- The national code format and the final data-collection template.

## Design notes

- Brand colours come from the Ministry emblem: green `#0B8034`, gold `#F4E833`, water blue `#1A5A8C`.
- Source-type colours follow the Ministry's existing QGIS legend and were checked for colour-vision deficiency;
  the map also uses a distinct shape per type. Status colours always come with an icon and a label.
- Pages are responsive down to phone width.
