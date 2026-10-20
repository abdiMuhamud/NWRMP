// Sprint C: water-quality laboratory results checked against editable limits, and maintenance
// work orders from a reported breakdown to a verified repair.
export const sql = /* sql */ `
-- One row per measured parameter. Seeded with WHO guideline values; the Ministry replaces them
-- with national standards in the app (Water quality > Standards). kind 'health': exceeding the
-- limit makes the water unsafe to drink; 'aesthetic': taste, smell or appearance; 'info': recorded only.
CREATE TABLE wq_parameters (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  unit        text NOT NULL DEFAULT '',
  min_value   double precision,
  max_value   double precision,
  kind        text NOT NULL CHECK (kind IN ('health', 'aesthetic', 'info')),
  basis       text,
  sort_order  smallint NOT NULL DEFAULT 100,
  active      boolean NOT NULL DEFAULT true,
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wq_parameters_limits CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
);

INSERT INTO wq_parameters (code, label, unit, min_value, max_value, kind, basis, sort_order) VALUES
  ('ecoli', 'E. coli or faecal coliforms', 'CFU/100 mL', NULL, 0, 'health', 'WHO: must not be detectable in any 100 mL sample', 10),
  ('total_coliforms', 'Total coliforms', 'CFU/100 mL', NULL, NULL, 'info', 'WHO: indicator only, no health-based value', 20),
  ('fluoride', 'Fluoride', 'mg/L', NULL, 1.5, 'health', 'WHO guideline value', 30),
  ('nitrate', 'Nitrate (as NO3)', 'mg/L', NULL, 50, 'health', 'WHO guideline value', 40),
  ('nitrite', 'Nitrite (as NO2)', 'mg/L', NULL, 3, 'health', 'WHO guideline value', 50),
  ('arsenic', 'Arsenic', 'mg/L', NULL, 0.01, 'health', 'WHO provisional guideline value', 60),
  ('free_chlorine', 'Free residual chlorine', 'mg/L', NULL, 5, 'health', 'WHO guideline value (only where water is chlorinated)', 70),
  ('ph', 'pH', '', 6.5, 8.5, 'aesthetic', 'WHO: no health-based value; 6.5-8.5 is the usual operational range', 80),
  ('turbidity', 'Turbidity', 'NTU', NULL, 5, 'aesthetic', 'WHO: may be visible and unacceptable above 5 NTU', 90),
  ('tds', 'Total dissolved solids', 'mg/L', NULL, 1000, 'aesthetic', 'WHO: taste becomes unacceptable above about 1000 mg/L', 100),
  ('ec', 'Electrical conductivity', 'µS/cm', NULL, 1500, 'aesthetic', 'No WHO value; 1500 µS/cm is a commonly used limit. Confirm the national value', 110),
  ('chloride', 'Chloride', 'mg/L', NULL, 250, 'aesthetic', 'WHO: taste noticeable above 200-300 mg/L', 120),
  ('sulfate', 'Sulfate', 'mg/L', NULL, 500, 'aesthetic', 'WHO: taste affected; notify health authorities above 500 mg/L', 130),
  ('sodium', 'Sodium', 'mg/L', NULL, 200, 'aesthetic', 'WHO: taste threshold about 200 mg/L', 140),
  ('iron', 'Iron', 'mg/L', NULL, 0.3, 'aesthetic', 'WHO: staining and taste above about 0.3 mg/L', 150),
  ('hardness', 'Total hardness (as CaCO3)', 'mg/L', NULL, NULL, 'info', 'WHO: no health-based value; scaling above about 200 mg/L', 160),
  ('temperature', 'Temperature', '°C', NULL, NULL, 'info', NULL, 170);

CREATE TYPE wq_test_state AS ENUM ('requested', 'completed', 'cancelled');
CREATE TYPE wq_outcome AS ENUM ('meets', 'concern', 'unsafe');

-- A water sample and its laboratory analysis. Tests start as a request from the field or are
-- recorded directly by the lab. Results are final when saved; corrections are audited.
CREATE TABLE wq_tests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid NOT NULL REFERENCES water_sources (id) ON DELETE CASCADE,
  state             wq_test_state NOT NULL,
  requested_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  requested_at      timestamptz,
  request_note      text,
  sampled_on        date,
  sampled_by        text,
  sample_point      text,
  lab               text,
  analysed_on       date,
  recorded_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  recorded_at       timestamptz,
  outcome           wq_outcome,
  notes             text,
  cancelled_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wq_tests_source_idx ON wq_tests (source_id, sampled_on DESC);
CREATE INDEX wq_tests_state_idx ON wq_tests (state, requested_at);
-- At most one open request per source.
CREATE UNIQUE INDEX wq_tests_open_request_key ON wq_tests (source_id) WHERE state = 'requested';

-- Each result keeps the limit in force when it was recorded, so later changes to the
-- standards do not silently rewrite past judgements.
CREATE TABLE wq_results (
  test_id    uuid NOT NULL REFERENCES wq_tests (id) ON DELETE CASCADE,
  parameter  text NOT NULL REFERENCES wq_parameters (code),
  value      double precision NOT NULL,
  min_value  double precision,
  max_value  double precision,
  kind       text NOT NULL,
  flag       text NOT NULL CHECK (flag IN ('ok', 'low', 'high')),
  PRIMARY KEY (test_id, parameter)
);

CREATE TYPE work_order_status AS ENUM ('open', 'assigned', 'in_progress', 'completed', 'closed', 'cancelled');
CREATE TYPE work_order_priority AS ENUM ('urgent', 'high', 'normal', 'low');

-- A breakdown and its repair: reported, taken by a maintenance officer, completed with a work
-- report, then closed by the regional coordinator, which updates the source's status.
CREATE TABLE work_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no            serial UNIQUE,
  source_id         uuid NOT NULL REFERENCES water_sources (id) ON DELETE CASCADE,
  status            work_order_status NOT NULL DEFAULT 'open',
  priority          work_order_priority NOT NULL DEFAULT 'normal',
  category          text NOT NULL,
  title             text NOT NULL,
  description       text,
  inspection_id     uuid REFERENCES inspections (id) ON DELETE SET NULL,
  reported_by       uuid NOT NULL REFERENCES users (id),
  reported_at       timestamptz NOT NULL DEFAULT now(),
  assigned_to       uuid REFERENCES users (id) ON DELETE SET NULL,
  assigned_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  assigned_at       timestamptz,
  started_at        timestamptz,
  completed_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  completed_at      timestamptz,
  work_done         text,
  completed_on      date,
  parts_used        text,
  cost_usd          numeric(12, 2),
  performed_by      text,
  working_after     boolean,
  closed_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  closed_at         timestamptz,
  close_comment     text,
  intervention_id   uuid REFERENCES interventions (id) ON DELETE SET NULL,
  cancelled_reason  text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_orders_status_idx ON work_orders (status, reported_at DESC);
CREATE INDEX work_orders_source_idx ON work_orders (source_id, reported_at DESC);
CREATE INDEX work_orders_assignee_idx ON work_orders (assigned_to, status);
-- One active work order per source and problem type, so the same breakdown is not reported twice.
CREATE UNIQUE INDEX work_orders_active_key ON work_orders (source_id, category) WHERE status NOT IN ('closed', 'cancelled');
`;
