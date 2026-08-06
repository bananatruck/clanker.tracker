/**
 * The PDF path's only real logic is regrouping positioned runs into lines.
 * Get it wrong and every heuristic downstream — headings, date anchoring,
 * bullets — collapses silently, so it is worth pinning down directly.
 */
import { describe, expect, it } from 'vitest';
import {
  detectKind,
  fromPastedText,
  groupRunsIntoLines,
  normalizeText,
  type PositionedRun,
} from '@/lib/resume/extract';

describe('groupRunsIntoLines', () => {
  it('reads down the page, not up, because PDF y grows upward', () => {
    const runs: PositionedRun[] = [
      { x: 0, y: 700, text: 'KESHAV' },
      { x: 0, y: 680, text: 'Engineer' },
      { x: 0, y: 660, text: 'EXPERIENCE' },
    ];
    expect(groupRunsIntoLines(runs)).toBe('KESHAV\nEngineer\nEXPERIENCE');
  });

  it('orders runs on the same line left to right regardless of emission order', () => {
    // pdf.js emits in content-stream order, which is not reading order.
    const runs: PositionedRun[] = [
      { x: 300, y: 500, text: 'Jan 2024 - Present' },
      { x: 0, y: 500, text: 'Senior Engineer' },
      { x: 150, y: 500, text: 'Acme Corp' },
    ];
    expect(groupRunsIntoLines(runs)).toBe('Senior Engineer Acme Corp Jan 2024 - Present');
  });

  it('treats runs within the tolerance as one line', () => {
    // Superscripts and mixed font sizes shift the baseline by a point or two.
    const runs: PositionedRun[] = [
      { x: 0, y: 500, text: 'Reduced latency by 40' },
      { x: 120, y: 501.5, text: '%' },
    ];
    expect(groupRunsIntoLines(runs)).toBe('Reduced latency by 40 %');
  });

  it('keeps runs beyond the tolerance on separate lines', () => {
    const runs: PositionedRun[] = [
      { x: 0, y: 500, text: 'first' },
      { x: 0, y: 495, text: 'second' },
    ];
    expect(groupRunsIntoLines(runs)).toBe('first\nsecond');
  });

  it('survives a page with no text at all', () => {
    expect(groupRunsIntoLines([])).toBe('');
  });
});

describe('normalizeText', () => {
  it('expands ligatures, which otherwise defeat exact keyword matching', () => {
    // "workflow" typed with an fl ligature is not the same string as the one
    // in the job description, and the ATS scan compares them literally.
    expect(normalizeText('workﬂow and eﬃciency')).toBe('workflow and efficiency');
  });

  it('rejoins words hyphenated across a line break', () => {
    expect(normalizeText('micro-\nservices')).toBe('microservices');
  });

  it('normalises smart quotes and dashes', () => {
    expect(normalizeText('“don’t” — really')).toBe('"don\'t" - really');
  });
});

describe('detectKind', () => {
  it('identifies by extension', () => {
    expect(detectKind('resume.pdf')).toBe('pdf');
    expect(detectKind('resume.docx')).toBe('docx');
    expect(detectKind('resume.txt')).toBe('txt');
    expect(detectKind('resume.md')).toBe('txt');
  });

  it('falls back to the MIME type when the name has no extension', () => {
    expect(detectKind('download', 'application/pdf')).toBe('pdf');
  });

  it('returns null for anything it cannot read', () => {
    expect(detectKind('resume.pages')).toBeNull();
  });
});

describe('fromPastedText', () => {
  it('accepts a pasted resume and normalises it', () => {
    const out = fromPastedText('Keshav\nSenior Engineer at Acme Corp since Jan 2024\nSkills: TypeScript');
    expect(out.kind).toBe('txt');
    expect(out.text).toContain('Senior Engineer');
  });

  it('refuses a fragment too short to be a resume', () => {
    expect(() => fromPastedText('hi')).toThrow(/too short/i);
  });
});
