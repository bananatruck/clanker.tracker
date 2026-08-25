import type { Table } from 'dexie';
import { db } from './schema';
import {
  BACKUP_TABLES,
  createClankDbBackup,
  parseClankDbBackup,
  type BackupTables,
} from './backup';

const durableTables = (): Table[] => BACKUP_TABLES.map((name) => db.table(name));

export async function exportClankDb(): Promise<string> {
  const tables = {} as BackupTables;
  const dexieTables = durableTables();
  await db.transaction('r', dexieTables, async () => {
    for (const name of BACKUP_TABLES) {
      tables[name] = await db.table(name).toArray();
    }
  });
  return createClankDbBackup(tables);
}

export interface RestoreSummary {
  tables: number;
  rows: number;
}

/** Replace durable local data only after the entire file has validated. */
export async function restoreClankDb(text: string): Promise<RestoreSummary> {
  const backup = parseClankDbBackup(text);
  const dexieTables = durableTables();
  const rows = BACKUP_TABLES.reduce(
    (total, table) => total + backup.tables[table].length,
    0,
  );

  await db.transaction('rw', [...dexieTables, db.applicationSessions], async () => {
    for (const table of dexieTables) await table.clear();
    await db.applicationSessions.clear();
    for (const name of BACKUP_TABLES) {
      const records = backup.tables[name];
      if (records.length > 0) await db.table(name).bulkPut(records);
    }
  });

  return { tables: BACKUP_TABLES.length, rows };
}
