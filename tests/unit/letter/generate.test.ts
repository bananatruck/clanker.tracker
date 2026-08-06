/**
 * The cover letter's one hard guarantee: it may only claim what the scan
 * found evidence for.
 *
 * A model handed a job description and a resume will write "I led the
 * migration to Kubernetes" because the posting asked for Kubernetes. That is a
 * lie the user signs their name to, so the prompt has to carry the covered
 * rows as the only permitted material and name the gaps as forbidden. Both
 * halves are asserted here.
 */
import { describe, expect, it } from 'vitest';
import { buildPrompt, gapClaims, groundingRows } from '@/lib/letter/generate';
import { emptyContact, field, PRIMARY_PROFILE_ID, type ResumeProfile } from '@/types/profile';
import type { EvidenceRow, ScanResult } from '@/types/ats';

const row = (
  text: string,
  coverage: EvidenceRow['coverage'],
  opts: { necessity?: 'required' | 'preferred'; evidence?: string; score?: number } = {},
): EvidenceRow => ({
  requirement: {
    id: text,
    text,
    necessity: opts.necessity ?? 'required',
    kind: 'skill',
    years: null,
    keywords: [],
  },
  coverage,
  evidence: opts.evidence
    ? [
        {
          experienceId: 'exp-0',
          company: 'Acme Corp',
          title: 'Senior Engineer',
          text: opts.evidence,
          score: opts.score ?? 0.8,
          matched: [],
        },
      ]
    : [],
  missing: coverage === 'gap' ? [text] : [],
});

function makeProfile(): ResumeProfile {
  const contact = emptyContact();
  contact.fullName = field('Ada Lovelace', 'certain', 'regex');
  return {
    id: PRIMARY_PROFILE_ID,
    contact,
    experience: [],
    education: [],
    skills: [],
    rawText: '',
    source: { fileName: 'a.txt', kind: 'txt', bytes: 1 },
    parsedAt: 0,
    updatedAt: 0,
  };
}

const scan = (rows: EvidenceRow[]): ScanResult => ({
  id: 'scan-1',
  jobTitle: 'Senior Engineer',
  company: 'Acme Corp',
  jdText: '',
  rows,
  scannedAt: 0,
});

describe('groundingRows', () => {
  it('excludes gaps, which have nothing behind them', () => {
    const rows = [
      row('Go', 'covered', { evidence: 'Built services in Go' }),
      row('Kubernetes', 'gap'),
    ];
    expect(groundingRows(rows).map((r) => r.requirement.text)).toEqual(['Go']);
  });

  it('excludes a row marked covered but carrying no evidence', () => {
    expect(groundingRows([row('Go', 'covered')])).toEqual([]);
  });

  it('puts required requirements before preferred ones', () => {
    const rows = [
      row('Nice to have', 'covered', { necessity: 'preferred', evidence: 'x', score: 0.99 }),
      row('Must have', 'covered', { necessity: 'required', evidence: 'y', score: 0.5 }),
    ];
    expect(groundingRows(rows)[0]?.requirement.text).toBe('Must have');
  });

  it('orders by evidence strength within the same necessity', () => {
    const rows = [
      row('Weak', 'covered', { evidence: 'x', score: 0.4 }),
      row('Strong', 'covered', { evidence: 'y', score: 0.9 }),
    ];
    expect(groundingRows(rows).map((r) => r.requirement.text)).toEqual(['Strong', 'Weak']);
  });

  it('keeps partial coverage, which is still real evidence', () => {
    expect(groundingRows([row('Go', 'partial', { evidence: 'Some Go' })])).toHaveLength(1);
  });
});

describe('gapClaims', () => {
  it('collects exactly the uncovered requirements', () => {
    const rows = [
      row('Go', 'covered', { evidence: 'Built services in Go' }),
      row('Kubernetes', 'gap'),
      row('Terraform', 'gap'),
    ];
    expect(gapClaims(rows)).toEqual(['Kubernetes', 'Terraform']);
  });
});

describe('buildPrompt', () => {
  const rows = [
    row('5 years of Go', 'covered', { evidence: 'Built the billing pipeline in Go' }),
    row('Kubernetes in production', 'gap'),
  ];

  const built = () =>
    buildPrompt({ scan: scan(rows), profile: makeProfile(), samples: [], notes: '' });

  it('carries the supporting bullet as the material to draw from', () => {
    expect(built().prompt).toContain('Built the billing pipeline in Go');
  });

  it('names the gap explicitly so it cannot be claimed', () => {
    const { prompt } = built();
    expect(prompt).toContain('GAPS');
    expect(prompt).toContain('Kubernetes in production');
  });

  it('forbids inventing material in the system prompt', () => {
    expect(built().system).toMatch(/may not invent/i);
  });

  it('passes writing samples through whole rather than describing them', () => {
    const { prompt } = buildPrompt({
      scan: scan(rows),
      profile: makeProfile(),
      samples: [
        { id: '1', label: 'old letter', text: 'I build things and then I fix them.', addedAt: 0 },
      ],
      notes: '',
    });
    expect(prompt).toContain('I build things and then I fix them.');
  });

  it('tells the model to claim nothing when there is no evidence at all', () => {
    const { prompt } = buildPrompt({
      scan: scan([row('Kubernetes', 'gap')]),
      profile: makeProfile(),
      samples: [],
    });
    expect(prompt).toMatch(/claim no experience/i);
  });

  it('includes the applicant note when one is given', () => {
    const { prompt } = buildPrompt({
      scan: scan(rows),
      profile: makeProfile(),
      samples: [],
      notes: 'I am relocating to Berlin in March.',
    });
    expect(prompt).toContain('relocating to Berlin');
  });

  it('leaves the note section out entirely when there is none', () => {
    expect(built().prompt).not.toContain('THE APPLICANT ALSO WANTS SAID');
  });
});
