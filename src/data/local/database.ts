import * as SQLite from 'expo-sqlite';
import { Alert, Platform } from 'react-native';

import { LOCAL_SCHEMA_SQL } from './schema';

const DATABASE_NAME = 'liqueur-log.db';

/** Core tables that must exist before any repository runs. */
const REQUIRED_TABLES = [
  'tenants',
  'users',
  'sessions',
  'preferences',
  'items',
  'item_types',
  'item_strengths',
  'vendors',
  'purchases',
  'purchase_items',
  'orders',
  'order_items',
  'stock_movements',
  'sync_queue',
  'sync_acks',
] as const;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let lastInitError: Error | null = null;
let initAlertShown = false;

/**
 * Native builds persist under expo-sqlite's default directory (app-private,
 * writable). Web ignores the directory argument and uses the WASM driver.
 */
function resolveDirectory(): string | undefined {
  if (Platform.OS === 'web') {
    return undefined;
  }
  const directory = SQLite.defaultDatabaseDirectory;
  if (typeof directory !== 'string' || directory.length === 0) {
    throw new Error(
      'expo-sqlite defaultDatabaseDirectory is unavailable. Rebuild the native app so the SQLite module is linked.',
    );
  }
  return directory;
}

async function configureConnection(database: SQLite.SQLiteDatabase): Promise<void> {
  // Must run before BEGIN — SQLite ignores foreign_keys changes inside a transaction.
  await database.execAsync('PRAGMA foreign_keys = ON');
  if (Platform.OS !== 'web') {
    try {
      await database.execAsync('PRAGMA journal_mode = WAL');
    } catch (error) {
      console.warn('[sqlite] WAL mode unavailable; continuing with default journal', error);
    }
  }
}

function reportInitFailure(error: unknown): Error {
  const normalized =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'SQLite initialization failed');
  lastInitError = normalized;
  console.error('[sqlite] database initialization failed', {
    message: normalized.message,
    stack: normalized.stack,
    platform: Platform.OS,
    databaseName: DATABASE_NAME,
    directory: Platform.OS === 'web' ? '(web/wasm)' : SQLite.defaultDatabaseDirectory,
  });

  if (!initAlertShown && Platform.OS !== 'web') {
    initAlertShown = true;
    Alert.alert(
      'Database error',
      `Local storage failed to start.\n\n${normalized.message}\n\nReinstall the app if this keeps happening.`,
    );
  }

  return normalized;
}

export function getDatabaseInitError(): Error | null {
  return lastInitError;
}

/**
 * Opens the DB, applies schema/migrations, and verifies tables exist.
 * Safe to call repeatedly; shares one in-flight promise.
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error) => {
      databasePromise = null;
      throw reportInitFailure(error);
    });
  }
  return databasePromise;
}

/** Explicit startup hook so UI can wait before any query. */
export function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  return getDatabase();
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  lastInitError = null;

  const directory = resolveDirectory();
  console.log('[sqlite] opening database', {
    platform: Platform.OS,
    databaseName: DATABASE_NAME,
    directory: directory ?? '(web default)',
  });

  const database =
    directory === undefined
      ? await SQLite.openDatabaseAsync(DATABASE_NAME)
      : await SQLite.openDatabaseAsync(DATABASE_NAME, undefined, directory);

  await configureConnection(database);
  await database.execAsync(LOCAL_SCHEMA_SQL);
  await allowDuplicateOrderItemLines(database);
  await ensureTenantColumn(database, 'address', `ALTER TABLE tenants ADD COLUMN address TEXT NOT NULL DEFAULT ''`);
  await ensureTenantColumn(
    database,
    'subscription_status',
    `ALTER TABLE tenants ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'active'`,
  );
  await ensureTenantColumn(
    database,
    'table_count',
    'ALTER TABLE tenants ADD COLUMN table_count INTEGER NOT NULL DEFAULT 10',
  );
  await relaxItemTypeChecks(database);
  await dropItemCodeColumns(database);
  await relaxPurchasePaymentTypes(database);
  await ensureSyncColumns(database);
  // After any items-table rebuilds: add + backfill serial numbers.
  await ensureItemSerialNumbers(database);
  await ensureServiceStations(database);
  await ensureStationVisibility(database);
  await assertSchemaReady(database);
  await maybeResetLocalLedger(database);

  console.log('[sqlite] database ready', { path: database.databasePath });
  return database;
}

/**
 * One-shot local wipe after a server-side test-data reset.
 * Sync only upserts remote rows and applies tombstones; it does not remove
 * orphan local ledger rows, so devices keep showing old catalog/orders until
 * this clears them. Bump LEDGER_EPOCH when you need devices to wipe again.
 */
const LEDGER_EPOCH_KEY = 'ledger_epoch';
const LEDGER_EPOCH = '2026-10-29-excel-price-stock';

/**
 * Clears stale local ledger rows once after a server reset. Safe to call often.
 * @returns true when operational tables were wiped and a full sync is required before UI reads.
 */
export async function ensureLocalLedgerReset(): Promise<boolean> {
  const database = await getDatabase();
  return maybeResetLocalLedger(database);
}

async function maybeResetLocalLedger(database: SQLite.SQLiteDatabase): Promise<boolean> {
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM preferences WHERE key = ?',
    [LEDGER_EPOCH_KEY],
  );
  if (row?.value === LEDGER_EPOCH) {
    return false;
  }

  console.log('[sqlite] wiping local ledger for epoch', LEDGER_EPOCH);
  await wipeOperationalTables(database);
  await database.runAsync(
    `INSERT INTO preferences (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [LEDGER_EPOCH_KEY, LEDGER_EPOCH],
  );
  return true;
}

async function wipeOperationalTables(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await database.execAsync(`
      DROP TRIGGER IF EXISTS order_items_lock_delete;
      DROP TRIGGER IF EXISTS orders_block_delete;
      DROP TRIGGER IF EXISTS purchase_items_block_delete;
      DROP TRIGGER IF EXISTS purchases_block_delete;
    `);

    await database.execAsync(`
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM purchase_items;
      DELETE FROM purchases;
      DELETE FROM stock_movements;
      DELETE FROM activity_logs;
      DELETE FROM order_sequences;
      DELETE FROM items;
      DELETE FROM item_types;
      DELETE FROM item_strengths;
      DELETE FROM vendors;
      DELETE FROM sync_queue;
      DELETE FROM sync_acks;
    `);

    await database.execAsync(`
      CREATE TRIGGER IF NOT EXISTS purchases_block_delete
      BEFORE DELETE ON purchases
      BEGIN
        SELECT RAISE(ABORT, 'purchase ledger entries cannot be changed');
      END;

      CREATE TRIGGER IF NOT EXISTS purchase_items_block_delete
      BEFORE DELETE ON purchase_items
      BEGIN
        SELECT RAISE(ABORT, 'purchase ledger entries cannot be changed');
      END;

      CREATE TRIGGER IF NOT EXISTS orders_block_delete
      BEFORE DELETE ON orders
      WHEN OLD.status <> 'OPEN'
        OR EXISTS (SELECT 1 FROM order_items WHERE order_id = OLD.id)
      BEGIN
        SELECT RAISE(ABORT, 'closed orders are read-only');
      END;

      CREATE TRIGGER IF NOT EXISTS order_items_lock_delete
      BEFORE DELETE ON order_items
      WHEN (SELECT status FROM orders WHERE id = OLD.order_id) IS NOT 'OPEN'
      BEGIN
        SELECT RAISE(ABORT, 'closed orders are read-only');
      END;
    `);
  } finally {
    await database.execAsync('PRAGMA foreign_keys = ON');
  }
}

async function assertSchemaReady(database: SQLite.SQLiteDatabase): Promise<void> {
  const missing: string[] = [];
  for (const table of REQUIRED_TABLES) {
    const row = await database.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [table],
    );
    if (!row?.name) {
      missing.push(table);
    }
  }
  if (missing.length > 0) {
    throw new Error(`SQLite schema incomplete; missing tables: ${missing.join(', ')}`);
  }

  const foreignKeys = await database.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  if (!foreignKeys || foreignKeys.foreign_keys !== 1) {
    throw new Error('SQLite foreign_keys pragma is not enabled on the main connection');
  }
}

async function ensureSyncColumns(database: SQLite.SQLiteDatabase): Promise<void> {
  await ensureColumn(database, 'items', 'updated_at', 'ALTER TABLE items ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(
    database,
    'item_types',
    'updated_at',
    'ALTER TABLE item_types ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0',
  );
  await ensureColumn(
    database,
    'item_strengths',
    'updated_at',
    'ALTER TABLE item_strengths ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0',
  );
  await ensureColumn(database, 'vendors', 'updated_at', 'ALTER TABLE vendors ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(database, 'orders', 'updated_at', 'ALTER TABLE orders ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
}

/** Assign stable per-tenant serial numbers (1, 2, 3…) used in catalog search. */
async function ensureItemSerialNumbers(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync('DROP INDEX IF EXISTS items_tenant_serial_no_idx');

  if (!(await hasTableColumn(database, 'items', 'serial_no'))) {
    // Prefer runAsync on web/WASM — execAsync has been flaky for single ALTERs.
    await database.runAsync('ALTER TABLE items ADD COLUMN serial_no INTEGER NOT NULL DEFAULT 0');
  }

  if (!(await hasTableColumn(database, 'items', 'serial_no'))) {
    throw new Error('SQLite migration failed: items.serial_no column is missing');
  }

  const needsBackfill = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM items WHERE serial_no <= 0 LIMIT 1',
  );
  if (needsBackfill) {
    const tenants = await database.getAllAsync<{ tenant_id: string }>(
      'SELECT DISTINCT tenant_id FROM items',
    );
    for (const tenant of tenants) {
      const maxRow = await database.getFirstAsync<{ max_serial: number }>(
        'SELECT COALESCE(MAX(serial_no), 0) AS max_serial FROM items WHERE tenant_id = ?',
        [tenant.tenant_id],
      );
      let next = Number(maxRow?.max_serial ?? 0);
      const rows = await database.getAllAsync<{ id: string }>(
        `SELECT id FROM items
         WHERE tenant_id = ? AND serial_no <= 0
         ORDER BY id ASC`,
        [tenant.tenant_id],
      );
      for (const row of rows) {
        next += 1;
        await database.runAsync('UPDATE items SET serial_no = ? WHERE id = ?', [next, row.id]);
      }
    }
  }

  await database.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS items_tenant_serial_no_idx ON items (tenant_id, serial_no) WHERE serial_no > 0',
  );
}

/** Bar vs kitchen station on catalog items and bill line snapshots. */
async function ensureServiceStations(database: SQLite.SQLiteDatabase): Promise<void> {
  await ensureColumn(
    database,
    'items',
    'service_station',
    `ALTER TABLE items ADD COLUMN service_station TEXT NOT NULL DEFAULT 'bar'`,
  );
  await ensureColumn(
    database,
    'order_items',
    'service_station',
    `ALTER TABLE order_items ADD COLUMN service_station TEXT NOT NULL DEFAULT 'bar'`,
  );

  await database.runAsync(
    `UPDATE items
     SET service_station = 'kitchen'
     WHERE liquor_type = 'Snacks' AND service_station <> 'kitchen'`,
  );

  // Only touch OPEN orders. Updating PAID/closed lines hits order_items_lock_update
  // ("closed orders are read-only") and aborts DB init — leave historical snapshots alone.
  await database.runAsync(
    `UPDATE order_items
     SET service_station = 'kitchen'
     WHERE service_station <> 'kitchen'
       AND order_id IN (SELECT id FROM orders WHERE status = 'OPEN')
       AND (
         liquor_type = 'Snacks'
         OR item_id IN (SELECT id FROM items WHERE service_station = 'kitchen')
       )`,
  );
}

/** Dual-station visibility + explicit stock tracking (shared inventory). */
async function ensureStationVisibility(database: SQLite.SQLiteDatabase): Promise<void> {
  const needsBackfill =
    !(await hasTableColumn(database, 'items', 'show_in_bar')) ||
    !(await hasTableColumn(database, 'items', 'show_in_kitchen')) ||
    !(await hasTableColumn(database, 'items', 'tracks_stock'));

  await ensureColumn(
    database,
    'items',
    'show_in_bar',
    `ALTER TABLE items ADD COLUMN show_in_bar INTEGER NOT NULL DEFAULT 1`,
  );
  await ensureColumn(
    database,
    'items',
    'show_in_kitchen',
    `ALTER TABLE items ADD COLUMN show_in_kitchen INTEGER NOT NULL DEFAULT 0`,
  );
  await ensureColumn(
    database,
    'items',
    'tracks_stock',
    `ALTER TABLE items ADD COLUMN tracks_stock INTEGER NOT NULL DEFAULT 1`,
  );

  if (needsBackfill) {
    await database.runAsync(
      `UPDATE items
       SET
         show_in_bar = CASE WHEN service_station = 'kitchen' THEN 0 ELSE 1 END,
         show_in_kitchen = CASE WHEN service_station = 'kitchen' THEN 1 ELSE 0 END,
         tracks_stock = CASE WHEN service_station = 'kitchen' THEN 0 ELSE 1 END`,
    );
  }

  // Collapse any legacy dual-visibility rows to exclusive prep station (never delete items).
  await database.runAsync(
    `UPDATE items
     SET
       show_in_bar = CASE WHEN service_station = 'kitchen' THEN 0 ELSE 1 END,
       show_in_kitchen = CASE WHEN service_station = 'kitchen' THEN 1 ELSE 0 END
     WHERE show_in_bar = 1 AND show_in_kitchen = 1`,
  );
}

async function hasTableColumn(
  database: SQLite.SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return columns.some((entry) => entry.name === column);
}

async function ensureColumn(
  database: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  statement: string,
): Promise<void> {
  if (await hasTableColumn(database, table, column)) {
    return;
  }
  await database.runAsync(statement);
}

/** Existing DBs had a unique (order_id, item_id) index that merged serves; drop it. */
async function allowDuplicateOrderItemLines(database: SQLite.SQLiteDatabase): Promise<void> {
  const unique = await database.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'index' AND name = 'order_items_order_item_idx' AND sql LIKE '%UNIQUE%'`,
  );
  if (unique?.name) {
    await database.execAsync('DROP INDEX IF EXISTS order_items_order_item_idx');
  }
  await database.execAsync(
    'CREATE INDEX IF NOT EXISTS order_items_order_item_idx ON order_items (order_id, item_id)',
  );
}

async function relaxItemTypeChecks(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'",
  );
  if (!row?.sql?.includes('liquor_type IN')) {
    return;
  }

  await database.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await database.execAsync(`
      CREATE TABLE items_next (
        id TEXT PRIMARY KEY NOT NULL,
        tenant_id TEXT NOT NULL,
        serial_no INTEGER NOT NULL DEFAULT 0,
        name_en TEXT NOT NULL,
        name_mr TEXT NOT NULL,
        brand TEXT NOT NULL,
        liquor_type TEXT NOT NULL,
        sub_type TEXT NOT NULL,
        volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
        purchase_price REAL NOT NULL CHECK (purchase_price >= 0),
        selling_price REAL NOT NULL CHECK (selling_price >= 0),
        current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
        low_stock_threshold INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
        updated_at INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
      );
      INSERT INTO items_next (
        id, tenant_id, serial_no, name_en, name_mr, brand, liquor_type, sub_type,
        volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold, updated_at
      )
      SELECT
        id, tenant_id, 0, name_en, name_mr, brand, liquor_type, sub_type,
        volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold, 0
      FROM items;
      DROP TABLE items;
      ALTER TABLE items_next RENAME TO items;
    `);
  } finally {
    await database.execAsync('PRAGMA foreign_keys = ON');
  }
}

/** Existing DBs carry a NOT NULL item_code (and unique index); new writes no longer supply it. */
async function dropItemCodeColumns(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync('DROP INDEX IF EXISTS items_tenant_item_code_idx');
  if (await hasTableColumn(database, 'items', 'item_code')) {
    await database.runAsync('ALTER TABLE items DROP COLUMN item_code');
  }
  if (await hasTableColumn(database, 'order_items', 'item_code')) {
    await database.runAsync('ALTER TABLE order_items DROP COLUMN item_code');
  }
}

async function relaxPurchasePaymentTypes(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'purchases'",
  );
  if (!row?.sql || row.sql.includes("'Partial'")) {
    return;
  }

  await database.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await database.execAsync(`
      CREATE TABLE purchases_next (
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
      INSERT INTO purchases_next (
        id, tenant_id, invoice_number, supplier_name, purchase_date,
        total_amount, paid_amount, payment_type, created_by
      )
      SELECT
        id, tenant_id, invoice_number, supplier_name, purchase_date,
        total_amount, paid_amount, payment_type, created_by
      FROM purchases;
      DROP TABLE purchases;
      ALTER TABLE purchases_next RENAME TO purchases;
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
    `);
  } finally {
    await database.execAsync('PRAGMA foreign_keys = ON');
  }
}

async function ensureTenantColumn(
  database: SQLite.SQLiteDatabase,
  column: string,
  statement: string,
): Promise<void> {
  const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(tenants)');
  if (columns.some((entry) => entry.name === column)) {
    return;
  }
  await database.execAsync(statement);
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Opens a dedicated write connection, enables PRAGMAs, then runs a transaction.
 * expo-sqlite's withExclusiveTransactionAsync also uses a new connection, but
 * it BEGIN's before the caller runs — so foreign_keys cannot be enabled there.
 */
async function withNativeExclusiveWrite<T>(
  task: (database: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const directory = resolveDirectory();
  if (directory === undefined) {
    throw new Error('Native exclusive write requires a SQLite directory');
  }

  const writeDb = await SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: true }, directory);
  try {
    await configureConnection(writeDb);
    let value!: T;
    await writeDb.withTransactionAsync(async () => {
      value = await task(writeDb);
    });
    return value;
  } catch (error) {
    console.error('[sqlite] exclusive write failed', error);
    throw error;
  } finally {
    try {
      await writeDb.closeAsync();
    } catch (closeError) {
      console.warn('[sqlite] failed to close exclusive write connection', closeError);
    }
  }
}

/**
 * Runs inventory writes one at a time.
 * Native uses a separate connection with PRAGMAs applied before BEGIN so
 * foreign keys enforce correctly (unlike withExclusiveTransactionAsync).
 * Web keeps the transaction on the connection that enabled foreign keys.
 * Reads use the same queue so they wait until a purchase has committed.
 */
export function withLockedTransaction<T>(
  task: (database: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  return enqueue(async () => {
    await getDatabase();

    if (Platform.OS === 'web') {
      const database = await getDatabase();
      let value!: T;
      await database.withTransactionAsync(async () => {
        value = await task(database);
      });
      return value;
    }

    return withNativeExclusiveWrite(task);
  });
}

export function withDatabase<T>(task: (database: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  return enqueue(async () => {
    try {
      return await task(await getDatabase());
    } catch (error) {
      console.error('[sqlite] query failed', error);
      throw error;
    }
  });
}
