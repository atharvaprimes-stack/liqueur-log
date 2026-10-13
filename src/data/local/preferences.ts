import { getDatabase } from './database';

export async function readPreference(key: string): Promise<string | null> {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [
      key,
    ]);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function writePreference(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO preferences (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
