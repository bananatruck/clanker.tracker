import { describe, expect, it } from 'vitest';
import {
  acceptsTextAttachment,
  documentFieldKind,
} from '@/lib/fill/documents';
import type { HarvestedField } from '@/lib/fill/types';

function field(overrides: Partial<HarvestedField> = {}): HarvestedField {
  return {
    id: 'f0',
    kind: 'file',
    name: '',
    label: '',
    required: false,
    options: [],
    placeholder: '',
    autocomplete: '',
    existingValue: '',
    ...overrides,
  };
}

describe('application document fields', () => {
  it('distinguishes resume and cover-letter controls from page language', () => {
    expect(documentFieldKind(field({ label: 'Résumé / CV' }))).toBe('resume');
    expect(documentFieldKind(field({ name: 'cover_letter' }))).toBe('cover-letter');
    expect(documentFieldKind(field({
      kind: 'textarea',
      label: 'Supporting statement',
    }))).toBe('cover-letter');
  });

  it('lets an explicit cover-letter label override a broad resume adapter hit', () => {
    expect(documentFieldKind(field({ label: 'Upload cover letter' }), 'resume')).toBe(
      'cover-letter',
    );
  });

  it('uses a vendor resume mapping when the page exposes no readable label', () => {
    expect(documentFieldKind(field(), 'resume')).toBe('resume');
  });

  it('refuses an ambiguous combined upload control', () => {
    expect(documentFieldKind(field({ label: 'Upload resume or cover letter' }), 'resume')).toBeNull();
  });
});

describe('text attachment compatibility', () => {
  it('allows an unrestricted input or one that names plain text', () => {
    expect(acceptsTextAttachment('')).toBe(true);
    expect(acceptsTextAttachment('.pdf, .txt')).toBe(true);
    expect(acceptsTextAttachment('text/plain')).toBe(true);
    expect(acceptsTextAttachment('text/*')).toBe(true);
  });

  it('does not disguise text as a PDF or Word document', () => {
    expect(acceptsTextAttachment('.pdf,.doc,.docx')).toBe(false);
    expect(acceptsTextAttachment('application/pdf')).toBe(false);
  });
});
