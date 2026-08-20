import { beforeEach, describe, expect, it } from 'vitest';
import { findAddControl, prepareRepeaters } from '@/lib/fill/repeaters';
import { findApplicationForm, harvestForm } from '@/lib/fill/harvest';
import { emptyContact, PRIMARY_PROFILE_ID, type ResumeProfile } from '@/types/profile';

function profile(): ResumeProfile {
  return {
    id: PRIMARY_PROFILE_ID,
    contact: emptyContact(),
    experience: [
      {
        id: 'exp-0', company: 'Acme', title: 'Engineer', location: '',
        start: { year: 2020, month: 1 }, end: null, bullets: [], confidence: 'certain',
      },
      {
        id: 'exp-1', company: 'Globex', title: 'Lead', location: '',
        start: { year: 2018, month: 1 }, end: { year: 2019, month: 12 },
        bullets: [], confidence: 'certain',
      },
    ],
    education: [],
    projects: [],
    skills: [],
    rawText: '',
    source: { fileName: 'resume.txt', kind: 'txt', bytes: 0 },
    parsedAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('repeatable resume sections', () => {
  it('adds only missing cards and then exposes stable semantic paths', async () => {
    document.body.innerHTML = `
      <form>
        <div id="records">
          <section aria-label="Work Experience" data-automation-id="workExperience-0">
            <label>Company<input name="company-0" /></label>
          </section>
        </div>
        <button id="add" type="button">Add another work experience</button>
      </form>`;
    const add = document.querySelector<HTMLButtonElement>('#add')!;
    add.addEventListener('click', () => {
      const section = document.createElement('section');
      section.setAttribute('aria-label', 'Work Experience');
      section.setAttribute('data-automation-id', 'workExperience-1');
      section.innerHTML = '<label>Company<input name="company-1" /></label>';
      document.querySelector('#records')!.append(section);
    });

    const report = await prepareRepeaters(document, profile());
    const paths = harvestForm(findApplicationForm(document)).fields.map(
      (field) => field.semanticPath,
    );

    expect(report).toMatchObject({ clicked: 1, sections: { experience: 1 } });
    expect(paths).toEqual(['experience[0].company', 'experience[1].company']);
  });

  it('does not mistake a generic add or submit control for a record expander', () => {
    document.body.innerHTML = `
      <form><button>Add attachment</button><button type="submit">Submit application</button></form>`;
    expect(findAddControl(document, 'experience')).toBeNull();
    expect(findAddControl(document, 'education')).toBeNull();
  });

  it('finds an enabled expander inside an open shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<button type="button" aria-label="Add another education"></button>';
    expect(findAddControl(document, 'education')).not.toBeNull();
  });
});
