// Core schema: administrative areas, the water-source registry, and the event tables
// (inspections, interventions) that keep each source's history over time.
export const sql = /* sql */ `
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE source_type AS ENUM ('borehole', 'shallow_well', 'berkad', 'dam', 'spring');
CREATE TYPE functional_status AS ENUM ('functioning', 'non_functioning', 'abandoned', 'unknown');
CREATE TYPE permanence AS ENUM ('permanent', 'seasonal');
CREATE TYPE verification_status AS ENUM ('unverified', 'verified');

CREATE TABLE regions (
  id       smallserial PRIMARY KEY,
  code     text NOT NULL UNIQUE,
  name     text NOT NULL UNIQUE,
  -- Other spellings found in legacy data, used to normalise imports
  aliases  text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE districts (
  id         serial PRIMARY KEY,
  region_id  smallint NOT NULL REFERENCES regions (id),
  name       text NOT NULL,
  UNIQUE (region_id, name)
);

CREATE TABLE water_sources (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- National unique code, e.g. BH-MJ-00012
  code                       text NOT NULL UNIQUE,
  type                       source_type NOT NULL,
  name                       text NOT NULL,
  region_id                  smallint NOT NULL REFERENCES regions (id),
  district_id                integer REFERENCES districts (id),
  settlement                 text,
  distance_to_settlement_km  double precision,
  location                   geography (Point, 4326) NOT NULL,
  altitude_m                 double precision,
  permanence                 permanence,
  status                     functional_status NOT NULL,
  status_reason              text,
  is_protected               boolean,
  established_on             date,
  establishing_agency        text,
  funding_agency             text,
  contractor                 text,

  -- Who uses the source (as reported at the last visit)
  people_served              integer,
  idps_served                integer,
  camels                     integer,
  cattle                     integer,
  shoats                     integer,
  irrigated_ha               double precision,

  -- Supply system
  reservoir_type             text,
  reservoir_capacity_m3      double precision,
  pipeline_type              text,
  pipeline_length_m          double precision,
  household_connections      integer,
  kiosks                     integer,
  animal_troughs             integer,
  sanitation_structures      integer,
  used_for_trucking          boolean,
  trucks_per_day             integer,
  truck_capacity_m3          double precision,

  -- Pump and power
  pump_type                  text,
  pump_model                 text,
  pump_capacity_lps          double precision,
  pump_level_m               double precision,
  power_source               text,
  generator_type             text,
  generator_kva              double precision,
  solar_type                 text,
  solar_kw                   double precision,
  supply_condition           text,
  supply_condition_notes     text,

  -- Latest physical water-quality observation
  quality_issue              text,
  color_odor                 text,
  temperature_c              double precision,
  ph                         double precision,

  wsc_established_on         date,
  field_area_ha              double precision,

  -- Type-specific technical fields (depth, yield, dimensions...), keyed by field definitions
  details                    jsonb NOT NULL DEFAULT '{}',

  verification               verification_status NOT NULL DEFAULT 'unverified',
  data_source                text,
  legacy_ref                 text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ph_range CHECK (ph IS NULL OR ph BETWEEN 0 AND 14)
);

CREATE INDEX water_sources_location_gix ON water_sources USING gist (location);
CREATE INDEX water_sources_type_idx ON water_sources (type);
CREATE INDEX water_sources_region_idx ON water_sources (region_id);
CREATE INDEX water_sources_status_idx ON water_sources (status);

-- Each field visit is a new row; visits never overwrite each other.
CREATE TABLE inspections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     uuid NOT NULL REFERENCES water_sources (id) ON DELETE CASCADE,
  inspected_on  date NOT NULL,
  agency        text,
  status        functional_status,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspections_source_idx ON inspections (source_id, inspected_on DESC);

-- Repairs, rehabilitation and other work done on a source.
CREATE TABLE interventions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     uuid NOT NULL REFERENCES water_sources (id) ON DELETE CASCADE,
  performed_on  date,
  agency        text,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX interventions_source_idx ON interventions (source_id, performed_on DESC);

-- Problems found while importing legacy spreadsheets, kept for review by data officers.
CREATE TABLE import_issues (
  id              serial PRIMARY KEY,
  batch           text NOT NULL,
  sheet           text,
  row_number      integer,
  source_id       uuid REFERENCES water_sources (id) ON DELETE SET NULL,
  field           text,
  severity        text NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  message         text NOT NULL,
  original_value  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_issues_source_idx ON import_issues (source_id);
`;
