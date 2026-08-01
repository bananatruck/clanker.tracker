import { describe, it, expect } from 'vitest';
import { canonical, tokenize, keywords, extractYears } from '@/lib/ats/keywords';
import { extractRequirements } from '@/lib/ats/requirements';
import { buildEvidenceTable, scanJobDescription, topGaps, COVERED_THRESHOLD } from '@/lib/ats/evidence';
import { scanSummary } from '@/types/ats';
import { normalizeText } from '@/lib/resume/extract';
import { parseResume } from '@/lib/resume/parse';

describe('keyword folding', () => {
  it('collapses the synonyms that would otherwise report phantom gaps', () => {
    expect(canonical('JS')).toBe(canonical('JavaScript'));
    expect(canonical('k8s')).toBe(canonical('Kubernetes'));
    expect(canonical('postgres')).toBe(canonical('PostgreSQL'));
    expect(canonical('golang')).toBe(canonical('Go'));
  });

  it('folds multi-word aliases before splitting on spaces', () => {
    expect(tokenize('machine learning')).toContain('machinelearning');
    expect(tokenize('front-end development')).toContain('frontend');
  });

  it('keeps the punctuation that carries meaning', () => {
    expect(tokenize('C++ and C#')).toEqual(expect.arrayContaining(['cplusplus', 'csharp']));
    expect(tokenize('Node.js')).toContain('nodejs');
  });

  it('drops stopwords so scores are not diluted by filler', () => {
    expect(tokenize('strong experience with the ability to')).toEqual([]);
  });

  it('singularises so plurals match', () => {
    expect(canonical('microservices')).toBe(canonical('microservice'));
  });

  it('reads a stated year count', () => {
    expect(extractYears('5+ years of experience')).toBe(5);
    expect(extractYears('3-5 years')).toBe(3);
    expect(extractYears('no number here')).toBeNull();
  });

  it('deduplicates keywords', () => {
    expect(keywords('Go, Go, Go')).toEqual(['go']);
  });
});

const JD = `Senior Backend Engineer at Initech

Requirements:
• 5+ years of experience building backend services
• Strong proficiency in Go or Python
• Experience with Kubernetes and container orchestration
• Bachelor's degree in Computer Science or equivalent

Nice to have:
• Experience with Rust
• Familiarity with Terraform

We are a fast-growing company that values collaboration.`;

describe('requirement extraction', () => {
  const reqs = extractRequirements(JD);

  it('extracts every bullet the posting asks for', () => {
    expect(reqs).toHaveLength(6);
  });

  it('takes necessity from the enclosing section', () => {
    const rust = reqs.find((r) => /Rust/.test(r.text));
    expect(rust?.necessity).toBe('preferred');
    const go = reqs.find((r) => /Go or Python/.test(r.text));
    expect(go?.necessity).toBe('required');
  });

  it('lets an inline stem override the section', () => {
    const [req] = extractRequirements('Requirements:\n• Kubernetes is a nice to have');
    expect(req?.necessity).toBe('preferred');
  });

  it('classifies kind and pulls stated years', () => {
    const years = reqs.find((r) => r.years !== null);
    expect(years?.years).toBe(5);
    expect(years?.kind).toBe('experience');
    expect(reqs.find((r) => /Bachelor/.test(r.text))?.kind).toBe('education');
  });

  it('ignores marketing prose that is not a requirement', () => {
    expect(reqs.some((r) => /fast-growing/.test(r.text))).toBe(false);
  });

  it('does not emit the section heading itself as a requirement', () => {
    expect(reqs.some((r) => /^Requirements:?$/.test(r.text))).toBe(false);
  });

  it('deduplicates a requirement repeated in two sections', () => {
    const dupe = extractRequirements('Requirements:\n• Go\n\nQualifications:\n• Go');
    expect(dupe).toHaveLength(1);
  });
});

const RESUME = normalizeText(`Ada Lovelace
ada@example.com

WORK EXPERIENCE
Initech | Senior Engineer | Jan 2019 - Present
• Built backend services in Go handling 40k requests per second
• Migrated 200 services to Kubernetes and container orchestration

EDUCATION
MIT | B.S. Computer Science | 2014 - 2018

TECHNICAL SKILLS
Languages: Go, Python
Tools: Docker, Kubernetes`);

const profile = parseResume({ text: RESUME, kind: 'txt', fileName: 'a.txt', bytes: 1 }, 0);
const NOW = new Date('2026-01-01T00:00:00Z');

describe('evidence table', () => {
  const rows = buildEvidenceTable(extractRequirements(JD), profile, NOW);

  it('produces one row per requirement — the table is exhaustive', () => {
    expect(rows).toHaveLength(6);
  });

  it('covers a requirement the resume demonstrates, quoting the bullet', () => {
    const k8s = rows.find((r) => /Kubernetes and container/.test(r.requirement.text))!;
    expect(k8s.coverage).toBe('covered');
    expect(k8s.evidence[0]!.text).toMatch(/Migrated 200 services/);
    expect(k8s.evidence[0]!.score).toBeGreaterThanOrEqual(COVERED_THRESHOLD);
  });

  it('names the gap in the posting’s own keywords', () => {
    const rust = rows.find((r) => /Rust/.test(r.requirement.text))!;
    expect(rust.coverage).toBe('gap');
    expect(rust.missing).toContain('rust');
    expect(rust.evidence).toEqual([]);
  });

  it('does not invent evidence for a gap', () => {
    for (const row of rows) {
      if (row.coverage === 'gap') expect(row.evidence).toHaveLength(0);
    }
  });

  it('downgrades a keyword match the years do not back up', () => {
    const thin = parseResume(
      {
        text: normalizeText(
          'Ada\n\nWORK EXPERIENCE\nAcme | Engineer | Jan 2025 - Present\n• Built backend services in Go',
        ),
        kind: 'txt',
        fileName: 'a.txt',
        bytes: 1,
      },
      0,
    );
    const [row] = buildEvidenceTable(
      extractRequirements('Requirements:\n• 5+ years of experience building backend services'),
      thin,
      NOW,
    );
    expect(row!.coverage).toBe('partial');
  });

  it('treats a requirement with nothing concrete to match as partial, never a gap', () => {
    // Every token here is a stopword, so there is no keyword to judge on.
    // Calling that a gap would tell the user to go fix nothing in particular.
    const reqs = extractRequirements('Requirements:\n• You must be able to do the work');
    expect(reqs[0]!.keywords).toEqual([]);

    const [row] = buildEvidenceTable(reqs, profile, NOW);
    expect(row!.coverage).toBe('partial');
  });

  it('still reports a real gap when the soft requirement names something', () => {
    // "team" is a concrete word the resume never uses — that is worth flagging.
    const [row] = buildEvidenceTable(
      extractRequirements('Requirements:\n• Strong ability to work with the team'),
      profile,
      NOW,
    );
    expect(row!.coverage).toBe('gap');
    expect(row!.missing).toContain('team');
  });

  it('keeps a single-word bulleted requirement — skills lists are requirements too', () => {
    const reqs = extractRequirements('Requirements:\n• Go\n• Rust');
    expect(reqs.map((r) => r.text)).toEqual(['Go', 'Rust']);
  });

  it('counts a skills-list mention rather than claiming you never mention it', () => {
    const [row] = buildEvidenceTable(
      extractRequirements('Requirements:\n• Must have Docker'),
      profile,
      NOW,
    );
    expect(row!.coverage).not.toBe('gap');
  });
});

describe('scan result', () => {
  const scan = scanJobDescription(JD, profile, { now: NOW });

  it('summarises, counting required gaps separately', () => {
    const summary = scanSummary(scan.rows);
    expect(summary.total).toBe(6);
    expect(summary.gaps).toBeGreaterThan(0);
    expect(summary.requiredGaps).toBeLessThanOrEqual(summary.gaps);
  });

  it('ranks what to write next, weighting required rows higher', () => {
    const gaps = topGaps(scan.rows);
    expect(gaps).toContain('rust');
  });

  it('keeps the JD so a re-scan needs no re-paste', () => {
    expect(scan.jdText).toBe(JD);
  });

  it('survives an empty job description', () => {
    const empty = scanJobDescription('', profile, { now: NOW });
    expect(empty.rows).toEqual([]);
    expect(scanSummary(empty.rows).total).toBe(0);
  });
});
