// Users and sessions, approval requests for registry changes, and the audit log.
export const sql = /* sql */ `
CREATE TYPE user_role AS ENUM (
  'admin',
  'department_reviewer',
  'regional_coordinator',
  'field_officer',
  'lab_officer',
  'maintenance_officer',
  'viewer'
);
CREATE TYPE change_kind AS ENUM ('create', 'update');
CREATE TYPE change_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text NOT NULL,
  full_name             text NOT NULL,
  phone                 text,
  role                  user_role NOT NULL,
  department            text,
  -- Set for roles limited to one region (regional coordinators, field officers)
  region_id             smallint REFERENCES regions (id),
  password_hash         text NOT NULL,
  must_change_password  boolean NOT NULL DEFAULT false,
  is_active             boolean NOT NULL DEFAULT true,
  failed_logins         integer NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  created_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- Server-side sessions: the cookie holds a random token, the table holds its SHA-256 hash.
CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  ip          text,
  user_agent  text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Nothing in the registry changes directly: every new source or edit is a request
-- that a reviewer approves or rejects.
CREATE TABLE change_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             change_kind NOT NULL,
  status           change_status NOT NULL DEFAULT 'pending',
  source_id        uuid REFERENCES water_sources (id) ON DELETE CASCADE,
  source_type      source_type NOT NULL,
  region_id        smallint NOT NULL REFERENCES regions (id),
  -- Proposed values: { fields: {...}, details: {...} } (only changed values for updates)
  proposed         jsonb NOT NULL,
  -- Values before the change, same shape, for updates
  previous         jsonb,
  base_updated_at  timestamptz,
  comment          text,
  requested_by     uuid NOT NULL REFERENCES users (id),
  requested_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_by      uuid REFERENCES users (id),
  reviewed_at      timestamptz,
  review_comment   text
);
CREATE INDEX change_requests_status_idx ON change_requests (status, requested_at DESC);
CREATE INDEX change_requests_source_idx ON change_requests (source_id);
CREATE INDEX change_requests_requester_idx ON change_requests (requested_by, requested_at DESC);

CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  user_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity_type  text,
  entity_id    text,
  summary      text NOT NULL,
  changes      jsonb,
  ip           text
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, at DESC);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);

ALTER TABLE water_sources ADD COLUMN updated_by uuid REFERENCES users (id) ON DELETE SET NULL;
`;
