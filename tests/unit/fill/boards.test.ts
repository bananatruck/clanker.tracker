/**
 * End-to-end board coverage: real markup in, filled values out.
 *
 * Every other fill test exercises one stage. These run the whole pipeline —
 * detect the ATS, harvest the form, resolve every field, apply the values —
 * against fixtures shaped like the boards people actually apply through, and
 * assert what ends up in the inputs.
 *
 * The fixtures are hand-built from each vendor's published field naming. They
 * are not scraped captures, so they prove the pipeline handles that shape of
 * form; they cannot prove a vendor has not since changed it. That is the
 * standing trade with tier 1 and the reason a stale map degrades to tiers 2-4
 * rather than breaking a fill.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { detectAts, knownFieldFor, type AtsAdapter } from '@/lib/fill/adapters';
import { findApplicationForm, harvestForm } from '@/lib/fill/harvest';
import { resolveFields } from '@/lib/fill/resolve';
import { applyValue } from '@/lib/fill/apply';
import { emptyPreferences, type Preferences } from '@/lib/fill/types';
import type { FillContext } from '@/lib/fill/labels';
import { emptyContact, field, PRIMARY_PROFILE_ID, type ResumeProfile } from '@/types/profile';

function makeProfile(): ResumeProfile {
  const contact = emptyContact();
  contact.firstName = field('Ada', 'certain', 'regex');
  contact.lastName = field('Lovelace', 'certain', 'regex');
  contact.fullName = field('Ada Lovelace', 'certain', 'regex');
  contact.email = field('ada@example.com', 'certain', 'regex');
  contact.phone = field('+44 20 7946 0958', 'certain', 'regex');
  contact.location = field('London, UK', 'certain', 'user');
  contact.linkedin = field('https://linkedin.com/in/ada', 'certain', 'regex');
  contact.github = field('https://github.com/ada', 'certain', 'regex');
  contact.website = field('https://ada.dev', 'certain', 'regex');

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

const preferences: Preferences = {
  ...emptyPreferences(),
  workAuthorized: 'Yes',
  requiresSponsorship: 'No',
};

const ctx: FillContext = { profile: makeProfile(), preferences };

/**
 * Run the whole pipeline over the current document and report what landed in
 * each input, keyed by the element's name or id.
 */
async function fillPage(host: string): Promise<{
  adapter: AtsAdapter;
  values: Record<string, string>;
  llmCalls: number;
  unresolved: string[];
}> {
  const adapter = detectAts(host, document);
  const form = findApplicationForm(document);
  const { fields, elements } = harvestForm(form);

  const adapterHits = new Map<string, ReturnType<typeof knownFieldFor>>();
  for (const [id, el] of elements) {
    const known = knownFieldFor(adapter, el, document);
    if (known) adapterHits.set(id, known);
  }

  const plan = await resolveFields(fields, {
    ctx,
    adapterHits: adapterHits as Map<string, NonNullable<ReturnType<typeof knownFieldFor>>>,
    // No memory and no model: this asserts what the *deterministic* tiers do,
    // which is the number that matters. Anything these miss costs a call.
    model: null,
  });

  const byId = new Map(fields.map((f) => [f.id, f]));
  const values: Record<string, string> = {};

  for (const resolution of plan.resolutions) {
    const el = elements.get(resolution.fieldId);
    const harvested = byId.get(resolution.fieldId);
    if (!el || !harvested) continue;

    applyValue(el, resolution.value, harvested.options);
    values[el.getAttribute('name') || el.id] = el.value;
  }

  return {
    adapter,
    values,
    llmCalls: plan.llmCalls,
    unresolved: plan.unresolved.map((u) => {
      const el = elements.get(u.fieldId);
      return el?.getAttribute('name') || el?.id || u.fieldId;
    }),
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

/* ------------------------------------------------------------- greenhouse */

describe('Greenhouse — classic hosted board', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="application_form" action="/applications">
        <label for="first_name">First Name *</label>
        <input id="first_name" name="job_application[first_name]" required />

        <label for="last_name">Last Name *</label>
        <input id="last_name" name="job_application[last_name]" required />

        <label for="email">Email *</label>
        <input id="email" name="job_application[email]" type="email" required />

        <label for="phone">Phone</label>
        <input id="phone" name="job_application[phone]" type="tel" />

        <label for="job_application_location">Location (City)</label>
        <input id="job_application_location" name="job_application[location]" />

        <label for="resume">Resume/CV</label>
        <input id="resume" name="job_application[resume]" type="file" />

        <label for="q_linkedin">LinkedIn Profile</label>
        <input id="q_linkedin" name="job_application[answers_attributes][0][text_value]" />
      </form>`;
  });

  it('is detected by hostname', () => {
    expect(detectAts('boards.greenhouse.io', document).id).toBe('greenhouse');
    expect(detectAts('job-boards.greenhouse.io', document).id).toBe('greenhouse');
  });

  it('fills every identity field with no model call', async () => {
    const { values, llmCalls } = await fillPage('boards.greenhouse.io');

    expect(values['job_application[first_name]']).toBe('Ada');
    expect(values['job_application[last_name]']).toBe('Lovelace');
    expect(values['job_application[email]']).toBe('ada@example.com');
    expect(values['job_application[phone]']).toBe('+44 20 7946 0958');
    expect(values['job_application[location]']).toBe('London, UK');
    expect(llmCalls).toBe(0);
  });

  it('answers a custom question by its label, not its opaque name', async () => {
    // Greenhouse names custom questions answers_attributes[n] — meaningless.
    // The visible label is the only thing that identifies the field.
    const { values } = await fillPage('boards.greenhouse.io');
    expect(values['job_application[answers_attributes][0][text_value]']).toBe(
      'https://linkedin.com/in/ada',
    );
  });

  it('leaves the file input alone — a resume is not a value to type', async () => {
    const { values } = await fillPage('boards.greenhouse.io');
    expect(values['job_application[resume]']).toBeUndefined();
  });
});

describe('Greenhouse — current board field naming', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form>
        <label for="first_name">First Name</label>
        <input id="first_name" name="first_name" />
        <label for="last_name">Last Name</label>
        <input id="last_name" name="last_name" />
        <label for="email">Email</label>
        <input id="email" name="email" type="email" />
        <label for="phone">Phone</label>
        <input id="phone" name="phone" type="tel" />
      </form>`;
  });

  it('fills the newer naming scheme just as well', async () => {
    const { values, llmCalls } = await fillPage('job-boards.greenhouse.io');
    expect(values['first_name']).toBe('Ada');
    expect(values['last_name']).toBe('Lovelace');
    expect(values['email']).toBe('ada@example.com');
    expect(values['phone']).toBe('+44 20 7946 0958');
    expect(llmCalls).toBe(0);
  });
});

describe('Greenhouse — embedded inline on a company careers page', () => {
  beforeEach(() => {
    // The embed renders Greenhouse's own markup into the company's DOM, on
    // the company's domain. Hostname says nothing; the markup says everything.
    document.body.innerHTML = `
      <header><nav><input type="search" name="site_search" /></nav></header>
      <div id="grnhse_app">
        <form>
          <label for="first_name">First Name *</label>
          <input id="first_name" name="job_application[first_name]" required />
          <label for="email">Email *</label>
          <input id="email" name="job_application[email]" type="email" required />
        </form>
      </div>`;
  });

  it('is recognised as Greenhouse despite the company hostname', () => {
    expect(detectAts('careers.acme.com', document).id).toBe('greenhouse');
  });

  it('falls back to generic when the marker is absent', () => {
    document.body.innerHTML = '<form><input name="something" /></form>';
    expect(detectAts('careers.acme.com', document).id).toBe('generic');
  });

  it('fills it with the Greenhouse map', async () => {
    const { adapter, values } = await fillPage('careers.acme.com');
    expect(adapter.id).toBe('greenhouse');
    expect(values['job_application[first_name]']).toBe('Ada');
    expect(values['job_application[email]']).toBe('ada@example.com');
  });

  it('does not mistake the site search box for the application', async () => {
    const { values } = await fillPage('careers.acme.com');
    expect(values['site_search']).toBeUndefined();
  });
});

/* ------------------------------------------------- proprietary / generic */

describe('a proprietary company careers page', () => {
  beforeEach(() => {
    // No vendor, no conventions beyond HTML's own. Names invented by whoever
    // built it, which is the realistic case.
    document.body.innerHTML = `
      <form class="careers-application">
        <label for="applicant-first-name">Given name</label>
        <input id="applicant-first-name" name="applicant_first_name" />

        <label for="applicant-last-name">Family name</label>
        <input id="applicant-last-name" name="applicant_last_name" />

        <label for="contact-email">Email address</label>
        <input id="contact-email" name="contact_email" type="email" />

        <label for="contact-phone">Telephone</label>
        <input id="contact-phone" name="contact_phone" type="tel" />

        <label for="city">Which city are you based in?</label>
        <input id="city" name="city" />

        <label for="li">LinkedIn</label>
        <input id="li" name="linkedin_url" />

        <label for="auth">Are you legally authorized to work?</label>
        <select id="auth" name="work_auth">
          <option value=""></option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </form>`;
  });

  it('is handled by the generic adapter', () => {
    expect(detectAts('www.acme-industries.com', document).id).toBe('generic');
  });

  it('fills the whole form without a single model call', async () => {
    const { values, llmCalls, unresolved } = await fillPage('www.acme-industries.com');

    expect(values['applicant_first_name']).toBe('Ada');
    expect(values['applicant_last_name']).toBe('Lovelace');
    expect(values['contact_email']).toBe('ada@example.com');
    expect(values['contact_phone']).toBe('+44 20 7946 0958');
    expect(values['city']).toBe('London, UK');
    expect(values['linkedin_url']).toBe('https://linkedin.com/in/ada');
    expect(llmCalls).toBe(0);
    expect(unresolved).toEqual([]);
  });

  it('picks the right option in a select rather than typing into it', async () => {
    const { values } = await fillPage('www.acme-industries.com');
    expect(values['work_auth']).toBe('yes');
  });

  it('never fills a field the page already filled', async () => {
    const email = document.querySelector<HTMLInputElement>('#contact-email')!;
    email.value = 'someone.else@corp.com';

    await fillPage('www.acme-industries.com');
    expect(email.value).toBe('someone.else@corp.com');
  });
});

describe('a proprietary page with no <form> element', () => {
  beforeEach(() => {
    // React handlers do not need a form, and plenty of boards do not use one.
    // The only <form> on the page is then the site search.
    document.body.innerHTML = `
      <form role="search"><input name="q" type="search" /></form>
      <div class="application">
        <label for="fn">First name</label><input id="fn" name="fn" />
        <label for="ln">Last name</label><input id="ln" name="ln" />
        <label for="em">Email</label><input id="em" name="em" type="email" />
      </div>`;
  });

  it('does not settle for the search form', async () => {
    const { values } = await fillPage('careers.acme.com');
    expect(values['fn']).toBe('Ada');
    expect(values['ln']).toBe('Lovelace');
    expect(values['em']).toBe('ada@example.com');
  });
});

describe('a board built from web components', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';

    // querySelectorAll stops at a shadow boundary, so before the harvest
    // walked shadow roots this page reported zero fields and looked like it
    // had no application on it at all.
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <label for="e">Email</label><input id="e" name="email" type="email" />
      <label for="p">Phone</label><input id="p" name="phone" type="tel" />`;
    document.getElementById('app')!.append(host);
  });

  it('finds and fills fields inside an open shadow root', async () => {
    const { values } = await fillPage('careers.acme.com');
    expect(values['email']).toBe('ada@example.com');
    expect(values['phone']).toBe('+44 20 7946 0958');
  });
});

/* ------------------------------------------------------ other named ATSs */

describe('other hosted boards', () => {
  it('detects each vendor by hostname', () => {
    expect(detectAts('jobs.smartrecruiters.com').id).toBe('smartrecruiters');
    expect(detectAts('careers-acme.icims.com').id).toBe('icims');
    expect(detectAts('jobs.jobvite.com').id).toBe('jobvite');
    expect(detectAts('acme.wd1.myworkdayjobs.com').id).toBe('workday');
  });

  it('fills a SmartRecruiters form', async () => {
    document.body.innerHTML = `
      <form>
        <label for="firstName">First name</label><input id="firstName" name="firstName" />
        <label for="lastName">Last name</label><input id="lastName" name="lastName" />
        <label for="email">Email</label><input id="email" name="email" type="email" />
      </form>`;

    const { adapter, values, llmCalls } = await fillPage('jobs.smartrecruiters.com');
    expect(adapter.id).toBe('smartrecruiters');
    expect(values['firstName']).toBe('Ada');
    expect(values['lastName']).toBe('Lovelace');
    expect(values['email']).toBe('ada@example.com');
    expect(llmCalls).toBe(0);
  });

  it('fills a Lever form, which asks for one name field rather than two', async () => {
    document.body.innerHTML = `
      <form>
        <label for="n">Full name</label><input id="n" name="name" />
        <label for="e">Email</label><input id="e" name="email" type="email" />
        <label for="li">LinkedIn URL</label><input id="li" name="urls[LinkedIn]" />
        <label for="gh">GitHub URL</label><input id="gh" name="urls[GitHub]" />
      </form>`;

    const { values } = await fillPage('jobs.lever.co');
    expect(values['name']).toBe('Ada Lovelace');
    expect(values['urls[LinkedIn]']).toBe('https://linkedin.com/in/ada');
    expect(values['urls[GitHub]']).toBe('https://github.com/ada');
  });
});

/* -------------------------------------------------------------- safety */

describe('what the adapters must never do', () => {
  it('leaves a third party’s details to the user rather than filling its own', async () => {
    // Every deterministic tier sees "email", or "first" and "name", and would
    // otherwise claim these confidently. Putting the applicant's own address
    // where a referrer's belongs is worse than an empty box: it looks resolved
    // in the review and is exactly the row someone scrolls past on a long form.
    document.body.innerHTML = `
      <form>
        <label for="ref">Referrer's email address</label>
        <input id="ref" name="referrer_email" type="email" />
        <label for="mgr">Your manager's first name</label>
        <input id="mgr" name="manager_first_name" />
        <label for="ec">Emergency contact phone</label>
        <input id="ec" name="emergency_phone" type="tel" />
      </form>`;

    const { values } = await fillPage('careers.acme.com');

    expect(values['referrer_email']).toBeUndefined();
    expect(values['manager_first_name']).toBeUndefined();
    expect(values['emergency_phone']).toBeUndefined();
  });

  it('still fills the applicant’s own fields on the same form', async () => {
    // The guard must be narrow. "Preferred name" contains "referred" as a
    // substring and is the applicant's own field.
    document.body.innerHTML = `
      <form>
        <label for="pn">Preferred name</label><input id="pn" name="preferred_name" />
        <label for="e">Email address</label><input id="e" name="email" type="email" />
        <label for="ref">Referee email</label><input id="ref" name="referee_email" />
      </form>`;

    const { values } = await fillPage('careers.acme.com');

    expect(values['preferred_name']).toBe('Ada');
    expect(values['email']).toBe('ada@example.com');
    expect(values['referee_email']).toBeUndefined();
  });

  it('does not touch a disabled or hidden field', async () => {
    document.body.innerHTML = `
      <form>
        <label for="e">Email</label><input id="e" name="email" type="email" disabled />
        <input type="hidden" name="csrf_token" />
        <label for="p">Phone</label><input id="p" name="phone" type="tel" />
      </form>`;

    const { values } = await fillPage('careers.acme.com');
    expect(values['email']).toBeUndefined();
    expect(values['csrf_token']).toBeUndefined();
    expect(values['phone']).toBe('+44 20 7946 0958');
  });

  it('never types into a password field', async () => {
    document.body.innerHTML = `
      <form>
        <label for="e">Email</label><input id="e" name="email" type="email" />
        <label for="pw">Create a password</label><input id="pw" name="password" type="password" />
      </form>`;

    const { values } = await fillPage('careers.acme.com');
    expect(values['password']).toBeUndefined();
  });
});
