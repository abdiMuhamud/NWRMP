// Field collection: inspection assignments, inspections submitted from the field (extending
// the existing inspections table, which already holds imported visits), and their photos.
export const sql = /* sql */ `
CREATE TYPE inspection_state AS ENUM ('draft', 'submitted', 'approved', 'returned');
CREATE TYPE assignment_status AS ENUM ('open', 'submitted', 'completed', 'cancelled');

CREATE TABLE inspection_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      uuid NOT NULL REFERENCES water_sources (id) ON DELETE CASCADE,
  assigned_to    uuid NOT NULL REFERENCES users (id),
  assigned_by    uuid NOT NULL REFERENCES users (id),
  due_on         date,
  notes          text,
  status         assignment_status NOT NULL DEFAULT 'open',
  inspection_id  uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);
CREATE INDEX inspection_assignments_assignee_idx ON inspection_assignments (assigned_to, status);
-- At most one active assignment per source.
CREATE UNIQUE INDEX inspection_assignments_active_key ON inspection_assignments (source_id)
  WHERE status IN ('open', 'submitted');

-- Imported visits keep state 'approved'. Field inspections start as drafts while photos upload.
ALTER TABLE inspections
  ADD COLUMN state           inspection_state NOT NULL DEFAULT 'approved',
  ADD COLUMN client_id       uuid UNIQUE,
  ADD COLUMN assignment_id   uuid REFERENCES inspection_assignments (id) ON DELETE SET NULL,
  ADD COLUMN inspector_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN observed        jsonb,
  ADD COLUMN previous        jsonb,
  ADD COLUMN gps             geography (Point, 4326),
  ADD COLUMN gps_accuracy_m  double precision,
  ADD COLUMN submitted_at    timestamptz,
  ADD COLUMN reviewed_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at     timestamptz,
  ADD COLUMN review_comment  text,
  ADD COLUMN location_moved  boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_at      timestamptz NOT NULL DEFAULT now();

ALTER TABLE inspection_assignments
  ADD CONSTRAINT inspection_assignments_inspection_fk FOREIGN KEY (inspection_id) REFERENCES inspections (id) ON DELETE SET NULL;

CREATE INDEX inspections_state_idx ON inspections (state, submitted_at);
CREATE INDEX inspections_inspector_idx ON inspections (inspector_id, created_at DESC);

CREATE TABLE inspection_photos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  uuid NOT NULL REFERENCES inspections (id) ON DELETE CASCADE,
  client_id      uuid UNIQUE,
  -- 'blob' (Vercel Blob, private) or 'local' (disk, for development)
  storage        text NOT NULL CHECK (storage IN ('blob', 'local')),
  storage_key    text NOT NULL,
  content_type   text NOT NULL,
  size_bytes     integer NOT NULL,
  caption        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspection_photos_inspection_idx ON inspection_photos (inspection_id);
`;
