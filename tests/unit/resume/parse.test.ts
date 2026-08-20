import { describe, it, expect } from 'vitest';
import { parseResumeDate, parseDateRange, durationMonths, formatRange } from '@/lib/resume/dates';
import { splitSections, classifyHeading, isHeading, preamble, linesOfKind } from '@/lib/resume/sections';
import { extractContact, looksLikeName } from '@/lib/resume/contact';
import { parseExperience, parseEducation, parseProjects, parseSkills } from '@/lib/resume/entries';
import { normalizeText } from '@/lib/resume/extract';
import { parseResume, reparse } from '@/lib/resume/parse';
import { normalizeProfile } from '@/types/profile';
import type { ExtractedText } from '@/lib/resume/extract';

describe('resume dates', () => {
  it('parses named, numeric and bare-year dates to month precision', () => {
    expect(parseResumeDate('March 2021')).toEqual({ year: 2021, month: 3 });
    expect(parseResumeDate('Mar. 2021')).toEqual({ year: 2021, month: 3 });
    expect(parseResumeDate('03/2021')).toEqual({ year: 2021, month: 3 });
    expect(parseResumeDate('2021')).toEqual({ year: 2021, month: null });
  });

  it('never invents a day the resume did not give', () => {
    const d = parseResumeDate('2019');
    expect(d).not.toBeNull();
    expect(d!.month).toBeNull();
  });

  it('reads an open range as still-employed', () => {
    const r = parseDateRange('Jan 2020 - Present');
    expect(r?.start).toEqual({ year: 2020, month: 1 });
    expect(r?.end).toBeNull();
    expect(r?.present).toBe(true);
  });

  it('reads a closed range across unicode dashes', () => {
    const r = parseDateRange('June 2018 – August 2021');
    expect(r?.start).toEqual({ year: 2018, month: 6 });
    expect(r?.end).toEqual({ year: 2021, month: 8 });
  });

  it('is not fooled by a dash inside a company name', () => {
    const r = parseDateRange('Hewlett-Packard | 2015 - 2019');
    expect(r?.start).toEqual({ year: 2015, month: null });
    expect(r?.end).toEqual({ year: 2019, month: null });
  });

  it('returns null for a line with no dates — the entry-header signal', () => {
    expect(parseDateRange('Led the payments rewrite')).toBeNull();
    expect(parseDateRange('')).toBeNull();
  });

  it('measures duration, counting an open range up to now', () => {
    expect(durationMonths({ year: 2020, month: 1 }, { year: 2020, month: 12 })).toBe(12);
    const now = new Date('2026-01-15T00:00:00Z');
    expect(durationMonths({ year: 2025, month: 1 }, null, now)).toBeGreaterThan(11);
  });

  it('formats an open range as Present', () => {
    expect(formatRange({ year: 2020, month: 1 }, null)).toBe('01/2020 — Present');
    expect(formatRange(null, null)).toBe('');
  });
});

describe('section segmentation', () => {
  it('recognises the common heading vocabularies', () => {
    expect(classifyHeading('WORK EXPERIENCE')).toBe('experience');
    expect(classifyHeading('Professional Experience')).toBe('experience');
    expect(classifyHeading('Education')).toBe('education');
    expect(classifyHeading('Technical Skills')).toBe('skills');
    expect(classifyHeading('Summary')).toBe('summary');
  });

  it('does not treat a bullet or a sentence as a heading', () => {
    expect(isHeading('• Built the thing')).toBe(false);
    expect(isHeading('I led a team of five engineers.')).toBe(false);
    expect(isHeading('Skills: Python, Go, Rust')).toBe(false);
  });

  it('keeps the contact block as the preamble', () => {
    const sections = splitSections(
      ['Ada Lovelace', 'ada@example.com', 'EXPERIENCE', 'Acme 2020 - 2022'].join('\n'),
    );
    expect(preamble(sections)).toEqual(['Ada Lovelace', 'ada@example.com']);
    expect(linesOfKind(sections, 'experience')).toEqual(['Acme 2020 - 2022']);
  });

  it('ends a section at an unrecognised heading instead of swallowing the rest', () => {
    const sections = splitSections(
      ['EXPERIENCE', 'Acme 2020', 'VOLUNTEERING', 'Soup kitchen'].join('\n'),
    );
    expect(linesOfKind(sections, 'experience')).toEqual(['Acme 2020']);
  });
});

describe('contact extraction', () => {
  const header = [
    'Ada Lovelace',
    'London, UK · ada@example.com · +44 20 7946 0958',
    'linkedin.com/in/adalovelace · github.com/ada · ada.dev',
  ];
  const contact = extractContact(header, header.join('\n'));

  it('pulls anchored fields with certainty', () => {
    expect(contact.email.value).toBe('ada@example.com');
    expect(contact.email.confidence).toBe('certain');
    expect(contact.linkedin.value).toBe('https://linkedin.com/in/adalovelace');
    expect(contact.github.value).toBe('https://github.com/ada');
  });

  it('takes the leading line as the name and splits it', () => {
    expect(contact.fullName.value).toBe('Ada Lovelace');
    expect(contact.firstName.value).toBe('Ada');
    expect(contact.lastName.value).toBe('Lovelace');
    expect(contact.fullName.confidence).toBe('certain');
  });

  it('marks positional guesses as guessed, not certain', () => {
    expect(contact.location.confidence).toBe('guessed');
  });

  it('refuses to read a job title as a name', () => {
    expect(looksLikeName('Senior Software Engineer')).toBe(false);
    expect(looksLikeName('ada@example.com')).toBe(false);
    expect(looksLikeName('Ada Lovelace')).toBe(true);
  });

  it('leaves absent fields missing rather than empty-but-confident', () => {
    const bare = extractContact(['Ada Lovelace'], 'Ada Lovelace');
    expect(bare.email.value).toBe('');
    expect(bare.email.confidence).toBe('missing');
  });
});

describe('experience entries', () => {
  const lines = [
    'Acme Corp | Senior Engineer | Jan 2021 - Present',
    '• Rebuilt the billing pipeline, cutting invoice errors by 40%',
    '• Led migration of 200 services to Kubernetes',
    'Globex Inc | Engineer | June 2018 - Dec 2020',
    '• Shipped the customer portal used by 12,000 accounts',
  ];
  const entries = parseExperience(lines);

  it('anchors one entry per date range', () => {
    expect(entries).toHaveLength(2);
  });

  it('assigns company and title by vocabulary, not position', () => {
    expect(entries[0]!.company).toBe('Acme Corp');
    expect(entries[0]!.title).toBe('Senior Engineer');
  });

  it('keeps bullets verbatim so the evidence table can quote them', () => {
    expect(entries[0]!.bullets).toContain('Led migration of 200 services to Kubernetes');
    expect(entries[1]!.bullets).toHaveLength(1);
  });

  it('marks a complete entry certain and a thin one guessed', () => {
    expect(entries[0]!.confidence).toBe('certain');
    expect(parseExperience(['Acme Corp | 2021 - 2022'])[0]!.confidence).toBe('guessed');
  });

  it('handles a company on the line above a date-only header', () => {
    const e = parseExperience(['Initech', '2019 - 2021', '• Did the thing']);
    expect(e[0]!.company).toBe('Initech');
    expect(e[0]!.start).toEqual({ year: 2019, month: null });
  });

  it('survives an empty section', () => {
    expect(parseExperience([])).toEqual([]);
  });
});

describe('education and skills', () => {
  it('pulls school and degree', () => {
    const [entry] = parseEducation(['MIT | B.S. Computer Science | 2014 - 2018']);
    expect(entry!.school).toBe('MIT');
    expect(entry!.degree).toMatch(/B\.S\./);
    expect(entry!.fieldOfStudy).toBe('Computer Science');
    expect(entry!.start).toEqual({ year: 2014, month: null });
    expect(entry!.end).toEqual({ year: 2018, month: null });
  });

  it('keeps education details applications ask for', () => {
    const [entry] = parseEducation([
      'Stanford University | M.S. in Computer Science | Stanford, CA | GPA 3.9/4.0 | 2018 - 2020',
    ]);
    expect(entry).toMatchObject({
      school: 'Stanford University',
      fieldOfStudy: 'Computer Science',
      location: 'Stanford, CA',
      gpa: '3.9/4.0',
    });
  });

  it('joins school, degree, dates, and GPA from a multi-line education block', () => {
    const [entry] = parseEducation([
      'Massachusetts Institute of Technology',
      'B.S. Computer Science',
      '2014 - 2018',
      '• GPA: 3.8/4.0',
    ]);
    expect(entry).toMatchObject({
      school: 'Massachusetts Institute of Technology',
      fieldOfStudy: 'Computer Science',
      start: { year: 2014, month: null },
      end: { year: 2018, month: null },
      gpa: '3.8/4.0',
    });
  });

  it('flattens a skills list and strips category labels', () => {
    const skills = parseSkills(['Languages: Python, Go, TypeScript', 'Tools: Docker | Kubernetes']);
    expect(skills).toContain('Python');
    expect(skills).toContain('Kubernetes');
    expect(skills).not.toContain('Languages');
  });

  it('drops prose that wandered into the skills section', () => {
    const skills = parseSkills([
      'I am a highly motivated engineer with a passion for scalable distributed systems',
    ]);
    expect(skills).toEqual([]);
  });
});

describe('project entries', () => {
  it('turns a Projects section into reusable application records', () => {
    const entries = parseProjects([
      'Clanker Tracker | Lead Developer | https://clanker.dev | TypeScript, React | 2024 - Present',
      '• Built a local-first application assistant used across five ATS families',
      'Compiler Lab | Python, LLVM | 2022',
      '• Compiled a small language to WebAssembly',
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      name: 'Clanker Tracker',
      role: 'Lead Developer',
      url: 'https://clanker.dev',
      technologies: ['TypeScript', 'React'],
    });
    expect(entries[0]!.bullets[0]).toContain('local-first');
    expect(entries[1]!.name).toBe('Compiler Lab');
  });

  it('reads role and technology lines under a project header', () => {
    const [project] = parseProjects([
      'Portfolio Engine | https://example.dev',
      'Role: Maintainer',
      'Technologies: TypeScript, WebAssembly',
      '• Rendered application evidence locally',
    ]);
    expect(project).toMatchObject({
      name: 'Portfolio Engine',
      role: 'Maintainer',
      technologies: ['TypeScript', 'WebAssembly'],
    });
  });
});

describe('text normalisation', () => {
  it('folds ligatures and unicode punctuation that would break keyword matching', () => {
    expect(normalizeText('workﬂow')).toBe('workflow');
    expect(normalizeText('“quoted”')).toBe('"quoted"');
  });

  it('rejoins words hyphenated across a line break', () => {
    expect(normalizeText('micro-\nservices')).toBe('microservices');
  });
});

const RESUME = `Ada Lovelace
London, UK · ada@example.com · linkedin.com/in/adalovelace

SUMMARY
Backend engineer focused on payments infrastructure.

WORK EXPERIENCE
Acme Corp | Senior Engineer | Jan 2021 - Present
• Rebuilt the billing pipeline in Go, cutting invoice errors by 40%
• Led migration of 200 services to Kubernetes

Globex Inc | Engineer | June 2018 - Dec 2020
• Shipped a customer portal in React used by 12,000 accounts

EDUCATION
MIT | B.S. Computer Science | 2014 - 2018

PROJECTS
Clanker Tracker | Lead Developer | https://clanker.dev | TypeScript, React | 2023 - Present
• Built a local-first application assistant for Workday forms

TECHNICAL SKILLS
Languages: Go, Python, TypeScript
Tools: Docker, Kubernetes, PostgreSQL`;

const source: ExtractedText = {
  text: normalizeText(RESUME),
  kind: 'txt',
  fileName: 'ada.txt',
  bytes: RESUME.length,
};

describe('full parse', () => {
  const profile = parseResume(source, 1000);

  it('produces a complete profile from one pass, with no LLM call', () => {
    expect(profile.contact.email.value).toBe('ada@example.com');
    expect(profile.experience).toHaveLength(2);
    expect(profile.education).toHaveLength(1);
    expect(profile.projects).toHaveLength(1);
    expect(profile.skills).toContain('Go');
  });

  it('mines skills out of bullets so a resume with no skills section still scans', () => {
    const noSkills = parseResume({ ...source, text: normalizeText(RESUME.split('TECHNICAL SKILLS')[0]!) });
    expect(noSkills.skills.some((s) => /kubernetes/i.test(s))).toBe(true);
  });

  it('keeps raw text so a better parser can be shipped later', () => {
    expect(profile.rawText).toContain('Acme Corp');
  });

  it('reparse preserves fields the user corrected', () => {
    const edited = structuredClone(profile);
    edited.contact.phone = { value: '+44 7700 900000', confidence: 'certain', source: 'user' };
    edited.contact.email = { value: 'wrong@example.com', confidence: 'guessed', source: 'llm' };

    const again = reparse(edited, 2000);
    expect(again.contact.phone.value).toBe('+44 7700 900000');
    // A non-user field is free to be re-derived from the raw text.
    expect(again.contact.email.value).toBe('ada@example.com');
  });

  it('reparse preserves structured entries corrected by the user', () => {
    const edited = structuredClone(profile);
    edited.projects[0] = {
      ...edited.projects[0]!,
      role: 'Creator',
      confidence: 'certain',
      source: 'user',
    };
    expect(reparse(edited, 2000).projects[0]!.role).toBe('Creator');
  });

  it('normalises profiles written before structured projects shipped', () => {
    const legacy = structuredClone(profile) as Partial<typeof profile>;
    delete legacy.projects;

    expect(normalizeProfile(legacy as typeof profile).projects).toEqual([]);
  });
});
