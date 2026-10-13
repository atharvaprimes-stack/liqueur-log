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
  return database;
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
