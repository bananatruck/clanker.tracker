import type { StoredDocument } from '@/lib/db/schema';

/** Convert a browser File into the serialisable row kept in IndexedDB. */
export async function resumeDocumentFromFile(
  file: File,
  now = Date.now(),
): Promise<StoredDocument> {
  return {
    id: 'primary-resume',
    kind: 'resume',
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    bytes: await file.arrayBuffer(),
    updatedAt: now,
  };
}
