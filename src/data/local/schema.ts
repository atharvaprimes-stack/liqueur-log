/**
 * Device schema. `tenants` and `users` mirror the Postgres tables.
 * Inventory, purchase ledger, and activity logs stay on the device.
 * `sessions` and `sync_queue` stay on the device for timeout checks and
 * offline staff writes that still need to reach Supabase.
 *
 * Every statement uses IF NOT EXISTS so opening the database on launch
 * can create missing tables without touching rows that are already there.
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

CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_mr TEXT NOT NULL,
  brand TEXT NOT NULL,
  liquor_type TEXT NOT NULL CHECK (liquor_type IN ('IMFL', 'Beer', 'Wine', 'Foreign', 'Country', 'Snacks')),
  sub_type TEXT NOT NULL CHECK (sub_type IN ('Strong', 'Mild')),
  volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
  purchase_price REAL NOT NULL CHECK (purchase_price >= 0),
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS items_tenant_item_code_idx
  ON items (tenant_id, item_code);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  purchase_date INTEGER NOT NULL,
  total_amount REAL NOT NULL CHECK (total_amount >= 0),
  paid_amount REAL NOT NULL CHECK (paid_amount >= 0),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('Cash', 'UPI', 'Credit')),
  created_by TEXT NOT NULL,
  CHECK (paid_amount <= total_amount),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS purchases_tenant_supplier_invoice_idx
  ON purchases (tenant_id, supplier_name COLLATE NOCASE, invoice_number COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS purchases_tenant_date_idx
  ON purchases (tenant_id, purchase_date DESC);

CREATE TRIGGER IF NOT EXISTS purchases_block_update
BEFORE UPDATE ON purchases
BEGIN
  SELECT RAISE(ABORT, 'purchase ledger entries cannot be changed');
END;

CREATE TRIGGER IF NOT EXISTS purchases_block_delete
BEFORE DELETE ON purchases
BEGIN
  SELECT RAISE(ABORT, 'purchase ledger entries cannot be changed');
END;

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
  unit_purchase_price REAL NOT NULL CHECK (unit_purchase_price >= 0),
  FOREIGN KEY (purchase_id) REFERENCES purchases (id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS purchase_items_purchase_id_idx
  ON purchase_items (purchase_id);

CREATE TRIGGER IF NOT EXISTS purchase_items_block_update
BEFORE UPDATE ON purchase_items
BEGIN
  SELECT RAISE(ABORT, 'purchase ledger entries cannot be changed');
END;

CREATE TRIGGER IF NOT EXISTS purchase_items_block_delete
BEFORE DELETE ON purchase_items
BEGIN
  SELECT RAISE(ABORT, 'purchase ledger entries cannot be changed');
END;

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS activity_logs_tenant_created_at_idx
  ON activity_logs (tenant_id, created_at DESC);
`;
