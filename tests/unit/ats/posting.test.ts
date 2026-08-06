/**
 * Posting extraction runs on pages nobody here controls, so each fallback has
 * to be pinned independently — and, more importantly, the order between them.
 * JSON-LD is published by the site itself and beats anything scraped.
 */
import { describe, expect, it } from 'vitest';
import {
  extractPosting,
  htmlToText,
  normaliseWhitespace,
  titleFromDocument,
} from '@/lib/ats/posting';

/** Long enough to clear MIN_DESCRIPTION_CHARS, as a real posting would be. */
const LONG = [
  'We are looking for a senior engineer with strong TypeScript and Kubernetes experience',
  'to own our billing platform end to end and mentor the wider team.',
  'You will work closely with product and design, ship to production every week,',
  'and help us grow the service from thousands of customers to hundreds of thousands.',
].join(' ');

function docFrom(html: string): Document {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
}

describe('htmlToText', () => {
  it('keeps list items on separate lines', () => {
    // The requirement parser works line by line; a flattened <ul> reads as one
    // long sentence and yields a single bogus requirement.
    const text = htmlToText('<ul><li>5 years Go</li><li>Kubernetes</li></ul>');
    expect(text.split('\n')).toEqual(['5 years Go', 'Kubernetes']);
  });

  it('drops scripts and styles rather than reading them as prose', () => {
    const text = htmlToText('<p>Real text</p><script>var x = "hidden"</script>');
    expect(text).toBe('Real text');
    expect(text).not.toContain('hidden');
  });
});

describe('normaliseWhitespace', () => {
  it('collapses runs of blank lines but keeps paragraph breaks', () => {
    expect(normaliseWhitespace('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('replaces non-breaking spaces, which defeat exact keyword matching', () => {
    expect(normaliseWhitespace('Go and Rust')).toBe('Go and Rust');
  });
});

describe('extractPosting', () => {
  it('prefers JSON-LD, because the site published it deliberately', () => {
    const doc = docFrom(`
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'JobPosting',
        title: 'Senior Engineer',
        hiringOrganization: { name: 'Acme Corp' },
        description: `<ul><li>${LONG}</li></ul>`,
      })}</script>
      <div id="content">${LONG} scraped version that should lose</div>
    `);

    const posting = extractPosting(doc)!;
    expect(posting.source).toBe('json-ld');
    expect(posting.title).toBe('Senior Engineer');
    expect(posting.company).toBe('Acme Corp');
    expect(posting.description).not.toContain('should lose');
  });

  it('finds a JobPosting nested inside an @graph', () => {
    const doc = docFrom(`
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', name: 'Acme Corp' },
          { '@type': 'JobPosting', title: 'Staff Engineer', description: LONG },
        ],
      })}</script>
    `);
    expect(extractPosting(doc)?.title).toBe('Staff Engineer');
  });

  it('accepts an @type given as an array', () => {
    const doc = docFrom(`
      <script type="application/ld+json">${JSON.stringify({
        '@type': ['JobPosting', 'Thing'],
        title: 'Engineer',
        description: LONG,
      })}</script>
    `);
    expect(extractPosting(doc)?.source).toBe('json-ld');
  });

  it('skips a malformed block instead of giving up on the page', () => {
    const doc = docFrom(`
      <script type="application/ld+json">{ this is not json </script>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'JobPosting',
        title: 'Engineer',
        description: LONG,
      })}</script>
    `);
    expect(extractPosting(doc)?.title).toBe('Engineer');
  });

  it('falls back to a known ATS container when there is no JSON-LD', () => {
    const doc = docFrom(`<div data-qa="job-description">${LONG}</div>`);
    const posting = extractPosting(doc)!;
    expect(posting.source).toBe('selector');
    expect(posting.description).toContain('Kubernetes');
  });

  it('falls back to the densest block of prose on an unknown layout', () => {
    const doc = docFrom(`
      <nav><a>Jobs</a><a>About</a><a>Careers</a><a>Login</a></nav>
      <div class="mystery-cms-wrapper">${LONG}</div>
    `);
    const posting = extractPosting(doc)!;
    expect(posting.source).toBe('density');
    expect(posting.description).toContain('billing platform');
  });

  it('returns null on a page with no posting on it', () => {
    expect(extractPosting(docFrom('<p>Hello</p>'))).toBeNull();
  });

  it('ignores a JSON-LD stub too short to be a real description', () => {
    // Listing pages emit JobPosting entries with a one-line teaser.
    const doc = docFrom(`
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'JobPosting',
        title: 'Engineer',
        description: 'Come work with us!',
      })}</script>
      <div data-qa="job-description">${LONG}</div>
    `);
    expect(extractPosting(doc)?.source).toBe('selector');
  });

  it('labels a scraped posting from the document when the source gave no title', () => {
    const doc = docFrom(`<h1>Backend Engineer</h1><div id="content">${LONG}</div>`);
    expect(extractPosting(doc)?.title).toBe('Backend Engineer');
  });
});

describe('titleFromDocument', () => {
  it('prefers the h1 over the branded document title', () => {
    const doc = docFrom('<h1>Senior Engineer</h1>');
    doc.title = 'Senior Engineer - Acme Corp | Greenhouse';
    expect(titleFromDocument(doc)).toBe('Senior Engineer');
  });

  it('strips the site branding suffix when there is no h1', () => {
    const doc = docFrom('<p>no heading</p>');
    doc.title = 'Senior Engineer | Acme Careers';
    expect(titleFromDocument(doc)).toBe('Senior Engineer');
  });
});
