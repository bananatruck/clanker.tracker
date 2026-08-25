import { describe, expect, it } from 'vitest';
import {
  BACKUP_TABLES,
  backupFilename,
  createClankDbBackup,
  parseClankDbBackup,
  type BackupTables,
} from '@/lib/db/backup';

function emptyTables(): BackupTables {
  return Object.fromEntries(
    BACKUP_TABLES.map((table) => [table, []]),
  ) as unknown as BackupTables;
}

describe('.clankdb backup format', () => {
  it('round-trips every durable table and binary resume bytes', () => {
    const tables = emptyTables();
    tables.applications.push({ id: 'app-1', company: 'Acme' });
    tables.documents.push({
      id: 'primary-resume',
      bytes: new Uint8Array([0, 1, 127, 255]).buffer,
    });

    const text = createClankDbBackup(tables, Date.UTC(2026, 7, 24));
    const restored = parseClankDbBackup(text);

    expect(Object.keys(restored.tables).sort()).toEqual([...BACKUP_TABLES].sort());
    expect(restored.tables.applications).toEqual([{ id: 'app-1', company: 'Acme' }]);
    const document = restored.tables.documents[0] as { bytes: ArrayBuffer };
    expect([...new Uint8Array(document.bytes)]).toEqual([0, 1, 127, 255]);
  });

  it('rejects an incompatible format version', () => {
    const text = createClankDbBackup(emptyTables(), 0);
    const incompatible = text.replace('"version": 1', '"version": 99');
    expect(() => parseClankDbBackup(incompatible)).toThrow(/version/i);
  });

  it('rejects a missing table instead of partially restoring a file', () => {
    const parsed = JSON.parse(createClankDbBackup(emptyTables(), 0)) as {
      tables: Record<string, unknown>;
    };
    delete parsed.tables.applications;
    expect(() => parseClankDbBackup(JSON.stringify(parsed))).toThrow(/applications/i);
  });

  it('rejects malformed binary data', () => {
    const parsed = JSON.parse(createClankDbBackup(emptyTables(), 0)) as {
      tables: Record<string, unknown[]>;
    };
    parsed.tables.documents = [{ bytes: { $clankdb: 'array-buffer', base64: '!!!' } }];
    expect(() => parseClankDbBackup(JSON.stringify(parsed))).toThrow(/base64/i);
  });

  it('uses the portable extension and export date in the filename', () => {
    expect(backupFilename(Date.UTC(2026, 7, 24))).toBe('clanker-backup-2026-08-24.clankdb');
  });
});
