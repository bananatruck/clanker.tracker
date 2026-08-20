/**
 * Field identification: what a box on a form is actually asking for.
 *
 * This is the tier-1 gate. A field that lands here with the right semantic
 * path is answered from the profile for free; one that does not is pushed
 * down the chain and, if nothing else claims it, costs an LLM call or lands
 * in review empty. Every case below is either a shape a real board ships or a
 * confident-but-wrong answer this module used to give.
 */
import { describe, expect, it } from 'vitest';
import { semanticReading, type SignalPart } from '@/lib/fill/semantic';

/** The reading as a path, which is what the resolver ultimately consumes. */
const read = (signal: string | readonly SignalPart[]): string => {
  const r = semanticReading(signal);
  return r.leaf ? `${r.section}.${r.leaf}` : r.section;
};

/** Field's own label, then progressively more distant ancestor context. */
const nested = (label: string, ...ancestors: string[]): SignalPart[] => [
  { text: label, weight: 1 },
  ...ancestors.map((text, i) => ({ text, weight: Math.max(0.35, 0.75 - i * 0.1) })),
];

describe('leaf terms that identify a section on their own', () => {
  // The bug the user reported: a form with a single flat education block
  // names its fields "Degree" and "Major" and never says "education"
  // anywhere. Gating leaf detection behind a section keyword meant every one
  // of these produced nothing at all.
  it.each([
    ['Major', 'education.fieldOfStudy'],
    ['Field of Study', 'education.fieldOfStudy'],
    ['Field of study', 'education.fieldOfStudy'],
    ['Discipline', 'education.fieldOfStudy'],
    ['Concentration', 'education.fieldOfStudy'],
    ['Course of Study', 'education.fieldOfStudy'],
    ['Area of study', 'education.fieldOfStudy'],
    ['Specialization', 'education.fieldOfStudy'],
    ['Degree', 'education.degree'],
    ['Degree Earned', 'education.degree'],
    ['Qualification', 'education.degree'],
    ['Diploma', 'education.degree'],
    ['School', 'education.school'],
    ['University Attended', 'education.school'],
    ['College', 'education.school'],
    ['Institution', 'education.school'],
    ['GPA', 'education.gpa'],
    ['Grade Point Average', 'education.gpa'],
  ])('reads %j as %s', (label, expected) => {
    expect(read(label)).toBe(expected);
  });

  it.each([
    ['Employer', 'experience.company'],
    ['Company', 'experience.company'],
    ['Company Name', 'experience.company'],
    ['Current company', 'experience.company'],
    ['Most Recent Employer', 'experience.company'],
    ['Organisation', 'experience.company'],
    ['Job Title', 'experience.title'],
    ['Position Title', 'experience.title'],
    ['Most recent title', 'experience.title'],
  ])('reads %j as %s', (label, expected) => {
    expect(read(label)).toBe(expected);
  });
});

describe('section words that used to be missed', () => {
  // The old section test demanded "work" or "employment" immediately followed
  // by "experience" or "history". A card headed with the bare word was never
  // recognised, so "Start date" inside it belonged to nothing.
  it.each([
    ['Experience'],
    ['Employment'],
    ['Work History'],
    ['Employment History'],
    ['Professional Experience'],
    ['Positions Held'],
  ])('%j puts an unlabelled date in the experience section', (heading) => {
    expect(read(nested('Start date', heading))).toBe('experience.start.date');
  });

  it.each([['Education'], ['Academic Background'], ['Schooling'], ['Qualifications']])(
    '%j puts an unlabelled date in the education section',
    (heading) => {
      expect(read(nested('Start date', heading))).toBe('education.start.date');
    },
  );
});

describe('proximity beats distance', () => {
  /**
   * Workday's second application page is headed "My Experience" and contains
   * the education cards as well as the employment ones. Scanning a flat
   * concatenation meant that banner won every time, so every education field
   * was filed under `experience` — a section with no `school` leaf — and fell
   * out of the resolver entirely. This is the case the rewrite exists for.
   */
  it('reads an education card nested under a "My Experience" page banner', () => {
    const signal = nested(
      'School or University',
      'schoolItem',
      'formField-school',
      'education-1',
      'My Experience',
      'workExperienceSection',
    );
    expect(read(signal)).toBe('education.school');
  });

  it('keeps the sibling degree and field-of-study boxes in the same card', () => {
    expect(read(nested('Degree', 'education-1', 'My Experience'))).toBe('education.degree');
    expect(read(nested('Field of Study', 'education-1', 'My Experience'))).toBe(
      'education.fieldOfStudy',
    );
  });

  it('still files genuine employment fields under experience', () => {
    expect(read(nested('Job Title', 'workExperience-1', 'My Experience'))).toBe(
      'experience.title',
    );
    expect(read(nested('Company', 'workExperience-1', 'My Experience'))).toBe(
      'experience.company',
    );
  });

  it('lets a nearer card outrank a further one', () => {
    // An ambiguous leaf with an education card close by and a work banner far
    // away belongs to the card it sits in.
    expect(read(nested('Location', 'education-1', 'Work Experience'))).toBe(
      'education.location',
    );
  });
});

describe('ambiguous leaves need a section', () => {
  // These appear in contact blocks and screening questions as often as in
  // records. Claiming them without a section is how a contact "Location"
  // field ends up holding a previous employer's city.
  it.each([['Location'], ['City'], ['Start date'], ['Description'], ['Title']])(
    '%j alone resolves to no section',
    (label) => {
      expect(read(label)).toBe('unknown');
    },
  );
});

describe('order within a section', () => {
  it('reads "School location" as the location, not the school', () => {
    expect(read('School location')).toBe('education.location');
  });

  it('reads "Company location" as the location, not the company', () => {
    expect(read('Company Location')).toBe('experience.location');
  });

  it('separates month and year controls from a whole-date control', () => {
    expect(read(nested('Start Month', 'Education'))).toBe('education.start.month');
    expect(read(nested('Start Year', 'Education'))).toBe('education.start.year');
    expect(read(nested('Graduation Year', 'Education'))).toBe('education.end.year');
    expect(read(nested('End Month', 'Work Experience'))).toBe('experience.end.month');
  });
});

describe('fields that must not be claimed', () => {
  /**
   * Greenhouse's standard eligibility question ends "...for any employer?".
   * That matched the decisive `company` leaf, so the resolver filled a
   * work-authorization dropdown with the user's current employer — the exact
   * confidently-wrong failure the whole chain is built to avoid.
   */
  it('does not read a work-authorization question as an employer field', () => {
    expect(
      read('Are you legally authorized to work in the United States for any employer?'),
    ).toBe('unknown');
  });

  it.each([
    ['Will you now or in the future require visa sponsorship?'],
    ['Palantir Technologies has my consent to contact me about future opportunities'],
    ['I agree to the terms and privacy policy'],
    ['How did you hear about this job?'],
  ])('leaves %j to the rest of the chain', (label) => {
    expect(read(label)).toBe('unknown');
  });

  it('does not read "Portfolio URL" as a project link', () => {
    // It is a contact field on nearly every board; tier 3 maps it to website.
    expect(read('Portfolio URL')).toBe('unknown');
  });

  it('does not read "Major accomplishment" as a field of study', () => {
    expect(read('What was your major accomplishment last year?')).toBe('unknown');
  });

  it('does not read a projected date as a project record', () => {
    // `\bprojects?` without a closing boundary matched "projected".
    expect(read('Projected start date')).toBe('unknown');
  });
});

describe('record index', () => {
  it.each([
    ['education[1].school', 1],
    ['workExperience-2', 2],
    ['school--0', 0],
    ['degree--1', 1],
  ])('reads %j as index %i', (signal, expected) => {
    expect(semanticReading(signal).explicitIndex).toBe(expected);
  });

  it('does not mistake a long Greenhouse question id for a card number', () => {
    expect(semanticReading('question_37494965002').explicitIndex).toBeNull();
  });
});

describe('skills', () => {
  it('claims a short skills field', () => {
    expect(read('Skills')).toBe('skills.skills');
  });

  it('leaves a long question that merely mentions skills alone', () => {
    expect(
      read('Please elaborate on your experience building security skills across a team'),
    ).toBe('unknown');
  });
});
