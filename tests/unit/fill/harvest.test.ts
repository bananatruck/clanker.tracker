import { describe, it, expect, beforeEach } from 'vitest';
import { harvestForm, findApplicationForm, labelFor } from '@/lib/fill/harvest';
import type { FieldElement } from '@/lib/fill/harvest';

function mount(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('label resolution', () => {
  it('prefers an explicit label[for] over everything else', () => {
    mount(`
      <label for="a">Email Address</label>
      <input id="a" name="wrong_name" placeholder="also wrong" />
    `);
    const el = document.querySelector('input')!;
    expect(labelFor(el)).toBe('Email Address');
  });

  it('reads a wrapping label without swallowing the input', () => {
    mount(`<label>First Name <input name="fn" /></label>`);
    expect(labelFor(document.querySelector('input')!)).toBe('First Name');
  });

  it('falls back through aria-labelledby, aria-label, sibling, placeholder', () => {
    mount(`<span id="lbl">Phone Number</span><input aria-labelledby="lbl" />`);
    expect(labelFor(document.querySelector('input')!)).toBe('Phone Number');

    mount(`<input aria-label="LinkedIn URL" />`);
    expect(labelFor(document.querySelector('input')!)).toBe('LinkedIn URL');

    mount(`<div>Portfolio</div><input />`);
    expect(labelFor(document.querySelector('input')!)).toBe('Portfolio');

    mount(`<input placeholder="you@example.com" />`);
    expect(labelFor(document.querySelector('input')!)).toBe('you@example.com');
  });

  it('humanises the name attribute as a last resort so tier 2 can still hash it', () => {
    mount(`<input name="job_application[first_name]" />`);
    expect(labelFor(document.querySelector('input')!)).toBe('job application first name');
  });
});

describe('harvest', () => {
  it('collects answerable fields and skips hidden, submit and disabled ones', () => {
    mount(`
      <form>
        <label for="e">Email</label><input id="e" name="email" type="email" required />
        <input type="hidden" name="csrf" />
        <input type="submit" value="Apply" />
        <input name="disabled_one" disabled />
        <textarea name="cover" aria-label="Cover Letter"></textarea>
      </form>
    `);

    const { fields } = harvestForm(findApplicationForm(document));
    expect(fields.map((f) => f.name)).toEqual(['email', 'cover']);
    expect(fields[0]!.kind).toBe('email');
    expect(fields[0]!.required).toBe(true);
    expect(fields[1]!.kind).toBe('textarea');
  });

  it('collapses a radio group into one question with options', () => {
    mount(`
      <form>
        <fieldset>
          <legend>Are you authorized to work?</legend>
          <label for="y">Yes</label><input id="y" type="radio" name="auth" value="yes" />
          <label for="n">No</label><input id="n" type="radio" name="auth" value="no" />
        </fieldset>
      </form>
    `);

    const { fields } = harvestForm(findApplicationForm(document));
    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe('Are you authorized to work?');
    expect(fields[0]!.options.map((o) => o.value)).toEqual(['yes', 'no']);
  });

  it('captures select options and drops the empty placeholder option', () => {
    mount(`
      <form>
        <label for="s">Country</label>
        <select id="s" name="country">
          <option value="">Select…</option>
          <option value="uk">United Kingdom</option>
          <option value="us">United States</option>
        </select>
      </form>
    `);

    const { fields } = harvestForm(findApplicationForm(document));
    expect(fields[0]!.options).toEqual([
      { value: 'uk', label: 'United Kingdom' },
      { value: 'us', label: 'United States' },
    ]);
  });

  it('reports a prefilled value so the resolver can leave it alone', () => {
    mount(`<form><label for="e">Email</label><input id="e" value="taken@example.com" /></form>`);
    const { fields } = harvestForm(findApplicationForm(document));
    expect(fields[0]!.existingValue).toBe('taken@example.com');
  });

  it('reports which radio is already checked', () => {
    mount(`
      <form>
        <input type="radio" name="auth" value="yes" aria-label="Yes" />
        <input type="radio" name="auth" value="no" aria-label="No" checked />
      </form>
    `);
    const { fields } = harvestForm(findApplicationForm(document));
    expect(fields[0]!.existingValue).toBe('no');
  });

  it('keys live elements by field id', () => {
    mount(`<form><input name="a" aria-label="A" /><input name="b" aria-label="B" /></form>`);
    const { fields, elements } = harvestForm(findApplicationForm(document));
    for (const field of fields) {
      const el = elements.get(field.id) as FieldElement;
      expect(el.getAttribute('name')).toBe(field.name);
    }
  });
});

describe('finding the application form', () => {
  it('picks the biggest form, not the first', () => {
    mount(`
      <form id="newsletter"><input name="signup_email" aria-label="Email" /></form>
      <form id="apply">
        <input name="first" aria-label="First" />
        <input name="last" aria-label="Last" />
        <input name="email" aria-label="Email" />
      </form>
    `);
    expect((findApplicationForm(document) as HTMLFormElement).id).toBe('apply');
  });

  it('falls back to the document when the page uses no form element', () => {
    mount(`<div><input name="a" aria-label="A" /></div>`);
    const { fields } = harvestForm(findApplicationForm(document));
    expect(fields).toHaveLength(1);
  });
});
