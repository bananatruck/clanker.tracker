import { describe, it, expect, beforeEach } from 'vitest';
import { isAboutSomeoneElse, matchLabel, matchOption, type FillContext } from '@/lib/fill/labels';
import { resolveFields, tierBreakdown } from '@/lib/fill/resolve';
import { diceSimilarity, resolveLexically } from '@/lib/fill/lexical';
import { autocompleteToken, autocompleteValue } from '@/lib/fill/autocomplete';
import { applyValue, highlight, clearHighlight } from '@/lib/fill/apply';
import { detectAts, knownFieldFor } from '@/lib/fill/adapters';
import { isCleanRun } from '@/lib/fill/autosubmit';
import { harvestForm, findApplicationForm } from '@/lib/fill/harvest';
import { emptyPreferences, type HarvestedField } from '@/lib/fill/types';
import { emptyContact, field, PRIMARY_PROFILE_ID, type ResumeProfile } from '@/types/profile';

function makeProfile(): ResumeProfile {
  const contact = emptyContact();
  contact.firstName = field('Ada', 'certain', 'regex');
  contact.lastName = field('Lovelace', 'certain', 'regex');
  contact.fullName = field('Ada Lovelace', 'certain', 'regex');
  contact.email = field('ada@example.com', 'certain', 'regex');
  contact.phone = field('+44 20 7946 0958', 'certain', 'regex');
  contact.linkedin = field('https://linkedin.com/in/ada', 'certain', 'regex');
  contact.location = field('London, UK', 'guessed', 'heuristic');

  return {
    id: PRIMARY_PROFILE_ID,
    contact,
    experience: [
      {
        id: 'exp-0',
        company: 'Acme Corp',
        title: 'Senior Engineer',
        location: '',
        start: { year: 2021, month: 1 },
        end: null,
        bullets: ['Built the billing pipeline'],
        confidence: 'certain',
      },
    ],
    education: [],
    skills: ['Go'],
    rawText: '',
    source: { fileName: 'a.txt', kind: 'txt', bytes: 1 },
    parsedAt: 0,
    updatedAt: 0,
  };
}

const ctx: FillContext = {
  profile: makeProfile(),
  preferences: { ...emptyPreferences(), workAuthorized: 'Yes', salaryExpectation: '£90,000' },
};

const textField = (over: Partial<HarvestedField> = {}): HarvestedField => ({
  id: 'f0',
  kind: 'text',
  name: '',
  label: '',
  required: false,
  options: [],
  placeholder: '',
  autocomplete: '',
  existingValue: '',
  ...over,
});

describe('tier 3 label matching', () => {
  it('answers the fields every application form asks for', () => {
    expect(matchLabel('First Name *', ctx)).toBe('Ada');
    expect(matchLabel('Surname', ctx)).toBe('Lovelace');
    expect(matchLabel('2. Email Address (required)', ctx)).toBe('ada@example.com');
    expect(matchLabel('LinkedIn Profile', ctx)).toBe('https://linkedin.com/in/ada');
    expect(matchLabel('Are you legally authorized to work?', ctx)).toBe('Yes');
    expect(matchLabel('Desired Salary', ctx)).toBe('£90,000');
  });

  it('does not let the bare name rule hijack a first-name field', () => {
    expect(matchLabel('First name', ctx)).toBe('Ada');
    expect(matchLabel('Full name', ctx)).toBe('Ada Lovelace');
  });

  it('reads the current role off the most recent job', () => {
    expect(matchLabel('Current Company', ctx)).toBe('Acme Corp');
    expect(matchLabel('Current Job Title', ctx)).toBe('Senior Engineer');
  });

  it('returns null rather than an empty answer, so the chain escalates', () => {
    expect(matchLabel('Pronouns', ctx)).toBeNull();
    expect(matchLabel('What is your favourite dinosaur?', ctx)).toBeNull();
    expect(matchLabel('', ctx)).toBeNull();
  });
});

describe('third-party field detection', () => {
  it('recognises fields asking about somebody else', () => {
    for (const label of [
      "Referrer's email address",
      'Your manager’s first name',
      'Emergency contact phone',
      'Reference name',
      'Referee email',
      'Next of kin',
      'Recruiter name',
      'Supervisor email',
    ]) {
      expect(isAboutSomeoneElse(label), label).toBe(true);
    }
  });

  it('does not fire on the applicant’s own fields', () => {
    // "Preferred name" contains "referred", and "Preference" contains
    // "reference" — whole-word matching is what keeps both of these ours.
    for (const label of [
      'Preferred name',
      'First name',
      'Email address',
      'Pronoun preference',
      'Do you have a preferred pronoun?',
      'Phone number',
    ]) {
      expect(isAboutSomeoneElse(label), label).toBe(false);
    }
  });
});

describe('option matching', () => {
  const yesNo = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ];

  it('matches exactly and case-insensitively', () => {
    expect(matchOption('Yes', yesNo)).toBe('yes');
    expect(matchOption('no', yesNo)).toBe('no');
  });

  it('will not satisfy "No" with an option reading "Not right now"', () => {
    const options = [{ value: 'later', label: 'Not right now' }];
    expect(matchOption('No', options)).toBeNull();
  });

  it('refuses substring matching for one- and two-character answers', () => {
    const options = [{ value: 'maybe', label: 'Maybe someday' }];
    expect(matchOption('y', options)).toBeNull();
  });

  it('returns null when nothing fits, rather than guessing', () => {
    expect(matchOption('Purple', yesNo)).toBeNull();
    expect(matchOption('', yesNo)).toBeNull();
  });
});

describe('tier 4 fuzzy matching', () => {
  it('scores identical strings 1 and unrelated ones near 0', () => {
    expect(diceSimilarity('first name', 'first name')).toBe(1);
    expect(diceSimilarity('first name', 'zzzzzz')).toBe(0);
  });

  it('absorbs the typos and punctuation real forms are full of', () => {
    expect(resolveLexically('E-Mail Addres', ctx)?.value).toBe('ada@example.com');
    expect(resolveLexically('Frst Name', ctx)?.value).toBe('Ada');
    expect(resolveLexically('Phone No.', ctx)?.value).toBe('+44 20 7946 0958');
  });

  it('finds the phrase inside a wordier label', () => {
    expect(resolveLexically('What is your first name?', ctx)?.value).toBe('Ada');
  });

  it('escalates a transposition rather than guessing at it', () => {
    // Swapping two letters destroys four bigrams, so "emial" scores 0.25.
    // Being sure or silent is the contract; tier 5 can have this one.
    expect(resolveLexically('Emial', ctx)).toBeNull();
  });

  it('refuses to guess at a question it does not recognise', () => {
    // The tier that answers confidently and wrongly is worse than no tier:
    // the user is one click from submitting whatever it wrote.
    expect(resolveLexically('What is your favourite dinosaur?', ctx)).toBeNull();
    expect(resolveLexically('Describe a time you failed', ctx)).toBeNull();
    expect(resolveLexically('', ctx)).toBeNull();
  });

  it('keeps the closest confusable pair apart', () => {
    // "last name" ~ "first name" scores 0.667, the highest false pair there is.
    // If this ever starts matching, the threshold has been nudged too low.
    expect(resolveLexically('Last name', ctx)?.value).toBe('Lovelace');
    expect(resolveLexically('First name', ctx)?.value).toBe('Ada');
  });

  it('does not confuse two fields that share a word', () => {
    expect(resolveLexically('Company name', ctx)?.value).not.toBe('Ada');
    expect(resolveLexically('School name', ctx)?.value).not.toBe('Ada Lovelace');
  });

  it('skips candidates the profile has no value for', () => {
    // Pronouns are empty in this context, so the tier must not claim the field.
    expect(resolveLexically('Pronouns', ctx)).toBeNull();
  });
});

describe('tier 1 autocomplete', () => {
  it('reads the field-naming token past section and mode prefixes', () => {
    expect(autocompleteToken('section-blue shipping given-name')).toBe('given-name');
    expect(autocompleteToken('email')).toBe('email');
  });

  it('treats on/off as saying nothing about the field', () => {
    expect(autocompleteToken('off')).toBeNull();
    expect(autocompleteToken('on')).toBeNull();
    expect(autocompleteToken('  ')).toBeNull();
  });

  it('answers straight from the profile when the site states the field', () => {
    expect(autocompleteValue('given-name', ctx)).toBe('Ada');
    expect(autocompleteValue('family-name', ctx)).toBe('Lovelace');
    expect(autocompleteValue('tel', ctx)).toBe('+44 20 7946 0958');
    expect(autocompleteValue('organization', ctx)).toBe('Acme Corp');
  });

  it('returns null for a token we hold nothing for, so the chain carries on', () => {
    expect(autocompleteValue('cc-number', ctx)).toBeNull();
    expect(autocompleteValue('bday', ctx)).toBeNull();
  });
});

describe('the resolver chain', () => {
  const memory = (answers: Record<string, string>) => ({
    async recall(question: string) {
      return answers[question] ?? null;
    },
  });

  it('escalates cheapest-first and stops at the first tier that answers', async () => {
    const plan = await resolveFields(
      [
        textField({ id: 'f0', label: 'First Name' }),
        textField({ id: 'f1', label: 'How did you hear about us?' }),
      ],
      {
        ctx,
        memory: memory({ 'How did you hear about us?': 'A friend' }),
      },
    );

    const byId = new Map(plan.resolutions.map((r) => [r.fieldId, r]));
    expect(byId.get('f1')!.tier).toBe(2); // answer memory beats everything below it
    expect(byId.get('f0')!.tier).toBe(3); // no adapter hit, not remembered
    expect(plan.llmCalls).toBe(0);
  });

  it('lets the site adapter win outright', async () => {
    const plan = await resolveFields([textField({ id: 'f0', label: 'First Name' })], {
      ctx,
      adapterHits: new Map([['f0', 'email']]),
    });
    expect(plan.resolutions[0]!.tier).toBe(1);
    expect(plan.resolutions[0]!.value).toBe('ada@example.com');
  });

  it('spends exactly one call for every remaining unknown, never one each', async () => {
    let calls = 0;
    const plan = await resolveFields(
      [
        textField({ id: 'f0', label: 'Why do you want this job?' }),
        textField({ id: 'f1', label: 'Describe a hard problem' }),
        textField({ id: 'f2', label: 'What motivates you?' }),
      ],
      {
        ctx,
        model: {
          async answer(fields) {
            calls++;
            return Object.fromEntries(fields.map((f) => [f.id, 'answer']));
          },
        },
      },
    );

    expect(calls).toBe(1);
    expect(plan.llmCalls).toBe(1);
    expect(plan.resolutions.filter((r) => r.tier === 5)).toHaveLength(3);
  });

  it('marks tier 5 answers guessed and everything cheaper certain', async () => {
    const plan = await resolveFields(
      [textField({ id: 'f0', label: 'Email' }), textField({ id: 'f1', label: 'Anything else?' })],
      {
        ctx,
        model: { async answer() { return { f1: 'Nope' }; } },
      },
    );

    const byId = new Map(plan.resolutions.map((r) => [r.fieldId, r]));
    expect(byId.get('f0')!.confidence).toBe('certain');
    expect(byId.get('f1')!.confidence).toBe('guessed');
  });

  it('degrades rather than failing when the budget is gone', async () => {
    const plan = await resolveFields(
      [textField({ id: 'f0', label: 'Email' }), textField({ id: 'f1', label: 'Anything else?' })],
      {
        ctx,
        model: {
          async answer() {
            throw new Error('Daily budget exhausted');
          },
        },
      },
    );

    // The deterministic field still got filled.
    expect(plan.resolutions.map((r) => r.fieldId)).toEqual(['f0']);
    expect(plan.unresolved).toEqual([{ fieldId: 'f1', reason: 'budget-exhausted' }]);
    expect(plan.llmCalls).toBe(0);
  });

  it('never overwrites a value already on the page', async () => {
    const plan = await resolveFields(
      [textField({ id: 'f0', label: 'Email', existingValue: 'someone@else.com' })],
      { ctx },
    );
    expect(plan.resolutions).toEqual([]);
    expect(plan.unresolved).toEqual([]);
  });

  it('will not answer a select with a value none of its options can hold', async () => {
    const plan = await resolveFields(
      [
        textField({
          id: 'f0',
          kind: 'select',
          label: 'Are you legally authorized to work?',
          options: [{ value: '1', label: 'Absolutely' }],
        }),
      ],
      { ctx },
    );
    expect(plan.resolutions).toEqual([]);
    expect(plan.unresolved[0]!.fieldId).toBe('f0');
  });

  it('reports the tier breakdown that backs the cost claim', async () => {
    const plan = await resolveFields(
      [textField({ id: 'f0', label: 'Email' }), textField({ id: 'f1', label: 'First Name' })],
      { ctx },
    );
    expect(tierBreakdown(plan)).toEqual({ 1: 0, 2: 0, 3: 2, 4: 0, 5: 0 });
  });
});

describe('applying values to the page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('writes text through the native setter and fires input + change', () => {
    document.body.innerHTML = `<input id="a" />`;
    const el = document.querySelector('input')!;

    const events: string[] = [];
    el.addEventListener('input', () => events.push('input'));
    el.addEventListener('change', () => events.push('change'));

    expect(applyValue(el, 'ada@example.com').ok).toBe(true);
    expect(el.value).toBe('ada@example.com');
    expect(events).toEqual(['input', 'change']);
  });

  it('resolves a select answer to a real option value', () => {
    document.body.innerHTML = `
      <select><option value="">-</option><option value="uk">United Kingdom</option></select>`;
    const el = document.querySelector('select')!;
    const result = applyValue(el, 'United Kingdom');
    expect(result.ok).toBe(true);
    expect(el.value).toBe('uk');
  });

  it('reports a select it cannot satisfy instead of silently doing nothing', () => {
    document.body.innerHTML = `<select><option value="uk">United Kingdom</option></select>`;
    const result = applyValue(document.querySelector('select')!, 'Atlantis');
    expect(result).toMatchObject({ ok: false, reason: 'no-matching-option' });
  });

  it('checks the right radio in a group', () => {
    document.body.innerHTML = `
      <input type="radio" name="auth" value="yes" aria-label="Yes" />
      <input type="radio" name="auth" value="no" aria-label="No" />`;
    const first = document.querySelector<HTMLInputElement>('input')!;
    applyValue(first, 'no', [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ]);
    expect(document.querySelector<HTMLInputElement>('[value="no"]')!.checked).toBe(true);
  });

  it('treats an explicit negative as unticking a checkbox', () => {
    document.body.innerHTML = `<input type="checkbox" />`;
    const el = document.querySelector<HTMLInputElement>('input')!;
    applyValue(el, 'yes');
    expect(el.checked).toBe(true);
    applyValue(el, 'no');
    expect(el.checked).toBe(false);
  });

  it('refuses readonly and file inputs rather than pretending', () => {
    document.body.innerHTML = `<input readonly /><input type="file" />`;
    const [ro, file] = [...document.querySelectorAll('input')] as HTMLInputElement[];
    expect(applyValue(ro!, 'x').reason).toBe('readonly');
    expect(applyValue(file!, 'x').reason).toBe('unsupported');
  });

  it('highlights and clears without touching anything else', () => {
    document.body.innerHTML = `<input />`;
    const el = document.querySelector('input')!;
    highlight(el, 'guessed');
    expect(el.style.outline).toContain('#d7a75c');
    clearHighlight(el);
    expect(el.style.outline).toBe('');
  });
});

describe('ATS adapters', () => {
  it('detects each supported host and falls back to generic', () => {
    expect(detectAts('boards.greenhouse.io').id).toBe('greenhouse');
    expect(detectAts('jobs.lever.co').id).toBe('lever');
    expect(detectAts('jobs.ashbyhq.com').id).toBe('ashby');
    expect(detectAts('apply.workable.com').id).toBe('workable');
    expect(detectAts('careers.example.com').id).toBe('generic');
  });

  it('maps a Greenhouse form onto known profile fields', () => {
    document.body.innerHTML = `
      <form>
        <label for="first_name">First</label><input id="first_name" />
        <label for="email">Email</label><input id="email" />
      </form>`;

    const adapter = detectAts('boards.greenhouse.io');
    const { fields, elements } = harvestForm(findApplicationForm(document));
    const mapped = fields.map((f) => knownFieldFor(adapter, elements.get(f.id)!, document));

    expect(mapped).toEqual(['firstName', 'email']);
  });

  it('still refuses the generic adapter auto-submit, map or no map', () => {
    // Generic now carries convention-based selectors so proprietary boards
    // work. Convention is strong evidence, not a verified mapping, so the
    // auto-submit gate must not soften because tier 1 started answering.
    expect(
      isCleanRun({
        ats: 'generic',
        totalFields: 6,
        certainFields: 6,
        correctedFields: 0,
        unfilledRequired: 0,
        at: Date.now(),
      }),
    ).toBe(false);
  });
});
