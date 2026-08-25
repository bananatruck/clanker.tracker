import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_TABLES,
  createClankDbBackup,
  parseClankDbBackup,
  type BackupTables,
} from '@/lib/db/backup';

const state = vi.hoisted(() => ({
  rows: new Map<string, unknown[]>(),
  clears: 0,
}));

vi.mock('@/lib/db/schema', () => {
  const table = (name: string) => ({
    toArray: async () => [...(state.rows.get(name) ?? [])],
    clear: async () => {
      state.clears++;
      state.rows.set(name, []);
    },
    bulkPut: async (records: unknown[]) => {
      state.rows.set(name, [...records]);
    },
  });
  return {
    db: {
      table,
      applicationSessions: table('applicationSessions'),
      transaction: async (...args: unknown[]) => {
        const work = args.at(-1) as () => Promise<unknown>;
        return work();
      },
    },
  };
});

import { exportClankDb, restoreClankDb } from '@/lib/db/portable';

function emptyTables(): BackupTables {
  return Object.fromEntries(
    BACKUP_TABLES.map((name) => [name, []]),
  ) as unknown as BackupTables;
}

beforeEach(() => {
  state.rows.clear();
  state.clears = 0;
  for (const name of [...BACKUP_TABLES, 'applicationSessions']) state.rows.set(name, []);
});

describe('portable database transactions', () => {
  it('exports the durable database tables', async () => {
    state.rows.set('applications', [{ id: 'app-1', company: 'Acme' }]);
    const backup = parseClankDbBackup(await exportClankDb());
    expect(backup.tables.applications).toEqual([{ id: 'app-1', company: 'Acme' }]);
    expect(Object.keys(backup.tables)).not.toContain('applicationSessions');
  });

  it('restores every durable table and clears transient tab sessions', async () => {
    state.rows.set('applications', [{ id: 'old' }]);
    state.rows.set('applicationSessions', [{ id: 'tab-4' }]);
    const tables = emptyTables();
    tables.applications = [{ id: 'new', company: 'Acme' }];

    const summary = await restoreClankDb(createClankDbBackup(tables));

    expect(state.rows.get('applications')).toEqual([{ id: 'new', company: 'Acme' }]);
    expect(state.rows.get('applicationSessions')).toEqual([]);
    expect(summary).toEqual({ tables: BACKUP_TABLES.length, rows: 1 });
  });

  it('does not clear current data when validation fails', async () => {
    state.rows.set('applications', [{ id: 'keep-me' }]);

    await expect(restoreClankDb('{"not":"a backup"}')).rejects.toThrow();

    expect(state.rows.get('applications')).toEqual([{ id: 'keep-me' }]);
    expect(state.clears).toBe(0);
  });
});
