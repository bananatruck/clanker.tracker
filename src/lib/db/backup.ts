export const BACKUP_TABLES = [
  'profiles',
  'questions',
  'scans',
  'applications',
  'runs',
  'deeds',
  'settings',
  'writingSamples',
  'letters',
  'documents',
  'applicationEvents',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupTables = { [Table in BackupTable]: unknown[] };

export interface ClankDbBackup {
  format: 'clanker.tracker.clankdb';
  version: 1;
  schemaVersion: 8;
  exportedAt: string;
  tables: BackupTables;
}

const FORMAT = 'clanker.tracker.clankdb';
const FORMAT_VERSION = 1;
const SCHEMA_VERSION = 8;
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const MAX_ROWS_PER_TABLE = 100_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

type TaggedBuffer = {
  $clankdb: 'array-buffer';
  base64: string;
};

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const valid = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  if (base64.length % 4 !== 0 || !valid.test(base64)) {
    throw new Error('Invalid base64 data in .clankdb backup.');
  }
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error('Invalid base64 data in .clankdb backup.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function encodeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('A .clankdb backup cannot contain non-finite numbers.');
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return { $clankdb: 'array-buffer', base64: bufferToBase64(value) } satisfies TaggedBuffer;
  }
  if (typeof value !== 'object') {
    if (value === undefined) return undefined;
    throw new Error(`Unsupported value in .clankdb backup: ${typeof value}.`);
  }
  if (seen.has(value)) throw new Error('A .clankdb backup cannot contain circular data.');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => encodeValue(item, seen) ?? null);
    }
    const encoded: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new Error(`Unsafe key in .clankdb backup: ${key}.`);
      const next = encodeValue(item, seen);
      if (next !== undefined) encoded[key] = next;
    }
    return encoded;
  } finally {
    seen.delete(value);
  }
}

function decodeValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid number in .clankdb backup.');
    return value;
  }
  if (Array.isArray(value)) return value.map(decodeValue);
  if (!value || typeof value !== 'object') throw new Error('Invalid value in .clankdb backup.');

  const record = value as Record<string, unknown>;
  if (record.$clankdb === 'array-buffer') {
    if (typeof record.base64 !== 'string' || Object.keys(record).length !== 2) {
      throw new Error('Invalid ArrayBuffer marker in .clankdb backup.');
    }
    return base64ToBuffer(record.base64);
  }

  const decoded: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Unsafe key in .clankdb backup: ${key}.`);
    decoded[key] = decodeValue(item);
  }
  return decoded;
}

export function createClankDbBackup(
  tables: BackupTables,
  now = Date.now(),
): string {
  const encodedTables = Object.fromEntries(
    BACKUP_TABLES.map((table) => [table, encodeValue(tables[table], new WeakSet())]),
  );
  const text = JSON.stringify({
    format: FORMAT,
    version: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    tables: encodedTables,
  }, null, 2);
  if (new Blob([text]).size > MAX_BACKUP_BYTES) {
    throw new Error('The database is larger than the supported 64 MB backup limit.');
  }
  return text;
}

export function parseClankDbBackup(text: string): ClankDbBackup {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) {
    throw new Error('This .clankdb backup is larger than the supported 64 MB limit.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This is not valid .clankdb JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid .clankdb backup root.');
  }

  const root = parsed as Record<string, unknown>;
  if (root.format !== FORMAT) throw new Error('This file is not a Clanker database backup.');
  if (root.version !== FORMAT_VERSION) throw new Error('Unsupported .clankdb format version.');
  if (root.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Incompatible .clankdb database schema version.');
  }
  if (typeof root.exportedAt !== 'string' || Number.isNaN(Date.parse(root.exportedAt))) {
    throw new Error('Invalid .clankdb export timestamp.');
  }
  if (!root.tables || typeof root.tables !== 'object' || Array.isArray(root.tables)) {
    throw new Error('Invalid .clankdb table collection.');
  }

  const source = root.tables as Record<string, unknown>;
  const unknownTables = Object.keys(source).filter(
    (table) => !BACKUP_TABLES.includes(table as BackupTable),
  );
  if (unknownTables.length > 0) {
    throw new Error(`Unsupported .clankdb table: ${unknownTables[0]}.`);
  }

  const tables = {} as BackupTables;
  for (const table of BACKUP_TABLES) {
    const rows = source[table];
    if (!Array.isArray(rows)) throw new Error(`Missing or invalid ${table} table.`);
    if (rows.length > MAX_ROWS_PER_TABLE) throw new Error(`Too many rows in ${table} table.`);
    tables[table] = rows.map(decodeValue);
  }

  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: root.exportedAt,
    tables,
  };
}

export function backupFilename(now = Date.now()): string {
  return `clanker-backup-${new Date(now).toISOString().slice(0, 10)}.clankdb`;
}
