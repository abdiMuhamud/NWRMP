# NWRMP — National Water Resource Management Platform

Digital platform of the **Ministry of Water Development** (Wasaaradda Horumarinta Biyaha) for registering,
mapping and monitoring the country's water sources: boreholes, shallow wells, berkads, dams and springs.

This repository holds **Phase 1 — Registry & GIS**:

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

With no `DATABASE_URL` set, the API starts an embedded PostgreSQL + PostGIS database in `apps/api/.pglite`
and imports the sample workbook on first start. To use a real PostgreSQL server instead, copy
`apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`.

Database commands (run inside `apps/api`, with the API stopped when using the embedded database):

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Import the sample workbook if the database is empty |
| `npm run db:reset` | Delete all water sources and re-import the sample |
| `npm run db:seed -- path/to/file.xlsx` | Import another workbook in the Ministry template |

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
4. **Web project**: *Add New → Project*, same repo, **Root Directory** `apps/web` (framework: Vite). Add the environment variable
   `VITE_API_BASE_URL` = `https://<your-api-project>.vercel.app/api`, then deploy.
5. Back in the API project, set `CORS_ORIGIN` = `https://<your-web-project>.vercel.app` and redeploy.

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
