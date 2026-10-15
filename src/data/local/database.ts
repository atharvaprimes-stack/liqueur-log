import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { LOCAL_SCHEMA_SQL } from './schema';

const DATABASE_NAME = 'liqueur-log.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabase();
  }
  return databasePromise;
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
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
  return database;
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
 * Runs inventory writes one at a time.
 * On a device, the write uses a separate connection so another statement cannot
 * join the same transaction. Parent rows are checked in the repository because
 * that connection does not inherit the foreign-key pragma from startup.
 * Web keeps the transaction on the connection that enabled foreign keys.
 * Reads use the same queue so they wait until a purchase has committed.
 */
export function withLockedTransaction<T>(
  task: (database: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  return enqueue(async () => {
    const database = await getDatabase();
    let value!: T;

    if (Platform.OS === 'web') {
      await database.withTransactionAsync(async () => {
        value = await task(database);
      });
      return value;
    }

    await database.withExclusiveTransactionAsync(async (transaction) => {
      value = await task(transaction);
    });
    return value;
  });
}

export function withDatabase<T>(task: (database: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  return enqueue(async () => task(await getDatabase()));
}
