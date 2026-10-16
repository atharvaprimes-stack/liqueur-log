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
  await relaxPurchasePaymentTypes(database);
  await ensureSyncColumns(database);
  await assertSchemaReady(database);

  console.log('[sqlite] database ready', { path: database.databasePath });
  return database;
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

async function ensureColumn(
  database: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  statement: string,
): Promise<void> {
  const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (columns.some((entry) => entry.name === column)) {
    return;
  }
  await database.execAsync(statement);
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
        item_code TEXT NOT NULL,
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
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
      );
      INSERT INTO items_next (
        id, tenant_id, item_code, name_en, name_mr, brand, liquor_type, sub_type,
        volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold
      )
      SELECT
        id, tenant_id, item_code, name_en, name_mr, brand, liquor_type, sub_type,
        volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold
      FROM items;
      DROP TABLE items;
      ALTER TABLE items_next RENAME TO items;
      CREATE UNIQUE INDEX IF NOT EXISTS items_tenant_item_code_idx
        ON items (tenant_id, item_code);
    `);
  } finally {
    await database.execAsync('PRAGMA foreign_keys = ON');
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
