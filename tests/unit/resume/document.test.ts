import { describe, expect, it } from 'vitest';
import { resumeDocumentFromFile } from '@/lib/resume/document';

describe('retained resume documents', () => {
  it('keeps the exact bytes and metadata selected by the user', async () => {
    const file = new File([new Uint8Array([37, 80, 68, 70])], 'ada-resume.pdf', {
      type: 'application/pdf',
    });

    const stored = await resumeDocumentFromFile(file, 1234);

    expect(stored).toMatchObject({
      id: 'primary-resume',
      kind: 'resume',
      fileName: 'ada-resume.pdf',
      mimeType: 'application/pdf',
      size: 4,
      updatedAt: 1234,
    });
    expect([...new Uint8Array(stored.bytes)]).toEqual([37, 80, 68, 70]);
  });

  it('uses a safe binary MIME type when the browser supplies none', async () => {
    const stored = await resumeDocumentFromFile(new File(['resume'], 'resume.bin'), 1);
    expect(stored.mimeType).toBe('application/octet-stream');
  });
});
