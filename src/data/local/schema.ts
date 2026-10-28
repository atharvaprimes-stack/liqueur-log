/**
 * Device schema. The shop reads and writes this database first so billing
 * stays fast offline. Supabase receives the same rows later, matched by id,
 * so a sale or purchase is stored once on each side.
 *
 * `sessions`, `sync_queue`, and `sync_acks` stay on the device.
 * Every statement uses IF NOT EXISTS so opening the database on launch
 * can create missing tables without touching rows that are already there.
 */
export const LOCAL_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY NOT NULL,
  business_name TEXT NOT NULL,
  license_number TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'suspended', 'on-hold')),
  table_count INTEGER NOT NULL DEFAULT 10 CHECK (table_count BETWEEN 1 AND 200),
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
  serial_no INTEGER NOT NULL DEFAULT 0 CHECK (serial_no >= 0),
  item_code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_mr TEXT NOT NULL,
  brand TEXT NOT NULL,
  liquor_type TEXT NOT NULL,
  sub_type TEXT NOT NULL,
  service_station TEXT NOT NULL DEFAULT 'bar' CHECK (service_station IN ('bar', 'kitchen')),
  show_in_bar INTEGER NOT NULL DEFAULT 1 CHECK (show_in_bar IN (0, 1)),
  show_in_kitchen INTEGER NOT NULL DEFAULT 0 CHECK (show_in_kitchen IN (0, 1)),
  tracks_stock INTEGER NOT NULL DEFAULT 1 CHECK (tracks_stock IN (0, 1)),
  volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
  purchase_price REAL NOT NULL CHECK (purchase_price >= 0),
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  updated_at INTEGER NOT NULL DEFAULT 0,
  CHECK (show_in_bar + show_in_kitchen >= 1),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS items_tenant_item_code_idx
  ON items (tenant_id, item_code);

CREATE TABLE IF NOT EXISTS item_types (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS item_types_tenant_name_idx
  ON item_types (tenant_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS item_strengths (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS item_strengths_tenant_name_idx
  ON item_strengths (tenant_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_tenant_name_idx
  ON vendors (tenant_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  purchase_date INTEGER NOT NULL,
  total_amount REAL NOT NULL CHECK (total_amount >= 0),
  paid_amount REAL NOT NULL CHECK (paid_amount >= 0),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('Cash', 'Partial', 'Credit', 'UPI')),
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

CREATE TABLE IF NOT EXISTS order_sequences (
  tenant_id TEXT NOT NULL,
  sequence_date TEXT NOT NULL,
  last_value INTEGER NOT NULL CHECK (last_value >= 0),
  PRIMARY KEY (tenant_id, sequence_date),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  table_id TEXT,
  order_type TEXT NOT NULL CHECK (order_type IN ('TABLE', 'COUNTER')),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'PAID')),
  total_amount REAL NOT NULL CHECK (total_amount >= 0),
  paid_amount REAL NOT NULL CHECK (paid_amount >= 0),
  payment_method TEXT CHECK (payment_method IN ('Cash', 'UPI', 'Other')),
  is_credit INTEGER NOT NULL DEFAULT 0 CHECK (is_credit IN (0, 1)),
  order_sequence_string TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  CHECK (paid_amount <= total_amount),
  CHECK (
    (order_type = 'TABLE' AND table_id IS NOT NULL)
    OR (order_type = 'COUNTER' AND table_id IS NULL)
  ),
  CHECK (
    (
      status = 'OPEN'
      AND payment_method IS NULL
      AND paid_amount = 0
      AND closed_at IS NULL
      AND is_credit = 0
    )
    OR (
      status = 'PAID'
      AND payment_method IS NOT NULL
      AND closed_at IS NOT NULL
      AND is_credit = CASE WHEN paid_amount < total_amount THEN 1 ELSE 0 END
    )
  ),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_sequence_idx
  ON orders (tenant_id, order_sequence_string);

CREATE INDEX IF NOT EXISTS orders_tenant_status_closed_idx
  ON orders (tenant_id, status, closed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_open_table_idx
  ON orders (tenant_id, table_id)
  WHERE status = 'OPEN' AND order_type = 'TABLE';

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_open_counter_idx
  ON orders (tenant_id)
  WHERE status = 'OPEN' AND order_type = 'COUNTER';

CREATE TRIGGER IF NOT EXISTS orders_lock_identity
BEFORE UPDATE ON orders
WHEN NEW.order_type <> OLD.order_type
  OR IFNULL(NEW.table_id, '') <> IFNULL(OLD.table_id, '')
  OR NEW.tenant_id <> OLD.tenant_id
  OR NEW.order_sequence_string <> OLD.order_sequence_string
  OR NEW.created_at <> OLD.created_at
  OR NEW.created_by <> OLD.created_by
BEGIN
  SELECT RAISE(ABORT, 'order identity cannot change');
END;

CREATE TRIGGER IF NOT EXISTS orders_lock_paid
BEFORE UPDATE ON orders
WHEN OLD.status = 'PAID'
BEGIN
  SELECT RAISE(ABORT, 'closed orders are read-only');
END;

CREATE TRIGGER IF NOT EXISTS orders_block_delete
BEFORE DELETE ON orders
WHEN OLD.status <> 'OPEN'
  OR EXISTS (SELECT 1 FROM order_items WHERE order_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'closed orders are read-only');
END;

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_mr TEXT NOT NULL,
  liquor_type TEXT NOT NULL,
  service_station TEXT NOT NULL DEFAULT 'bar' CHECK (service_station IN ('bar', 'kitchen')),
  volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON order_items (order_id);

CREATE INDEX IF NOT EXISTS order_items_order_item_idx
  ON order_items (order_id, item_id);

CREATE TRIGGER IF NOT EXISTS order_items_lock_insert
BEFORE INSERT ON order_items
WHEN (SELECT status FROM orders WHERE id = NEW.order_id) IS NOT 'OPEN'
BEGIN
  SELECT RAISE(ABORT, 'closed orders are read-only');
END;

CREATE TRIGGER IF NOT EXISTS order_items_lock_update
BEFORE UPDATE ON order_items
WHEN (SELECT status FROM orders WHERE id = OLD.order_id) IS NOT 'OPEN'
BEGIN
  SELECT RAISE(ABORT, 'closed orders are read-only');
END;

CREATE TRIGGER IF NOT EXISTS order_items_lock_delete
BEFORE DELETE ON order_items
WHEN (SELECT status FROM orders WHERE id = OLD.order_id) IS NOT 'OPEN'
BEGIN
  SELECT RAISE(ABORT, 'closed orders are read-only');
END;

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS stock_movements_item_idx
  ON stock_movements (tenant_id, item_id);

CREATE TABLE IF NOT EXISTS sync_acks (
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY (entity, entity_id)
);
`;
