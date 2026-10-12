/**
 * Device schema. `tenants` and `users` mirror the Postgres tables.
 * `sessions` and `sync_queue` stay on the device for timeout checks and
 * offline staff writes that still need to reach Supabase.
 */
export const LOCAL_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY NOT NULL,
  business_name TEXT NOT NULL,
  license_number TEXT NOT NULL,
  inactivity_timeout_minutes INTEGER NOT NULL DEFAULT 60
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  mpin_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_id_mobile_number_idx
  ON users (tenant_id, mobile_number);

CREATE INDEX IF NOT EXISTS users_mobile_number_idx
  ON users (mobile_number);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  last_interaction_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sync_queue_created_at_idx
  ON sync_queue (created_at);
`;
