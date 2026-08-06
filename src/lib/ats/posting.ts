/**
 * Reading the job posting off the page.
 *
 * Three strategies, best first, and the first one is unreasonably good:
 * almost every job board emits `JobPosting` JSON-LD so that Google Jobs will
 * index it. That is a structured, versioned, machine-readable copy of the
 * title, the company and the full description, published by the site itself.
 * Scraping the DOM when that is sitting in the page would be choosing the
 * worse source.
 *
 * Everything here is deterministic and local. The scan it feeds is free, which
 * is the whole reason it is reasonable to run on a posting you are merely
 * considering rather than one you have committed to.
 */

export type PostingSource = 'json-ld' | 'selector' | 'density';

export interface ExtractedPosting {
  title: string;
  company: string;
  description: string;
  source: PostingSource;
}

/** Below this there is no posting worth scanning — usually a listing page. */
const MIN_DESCRIPTION_CHARS = 200;

/** HTML → text, preserving the line breaks the requirement parser needs. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of doc.querySelectorAll('script, style, noscript')) el.remove();

  // Block boundaries have to survive: the requirement parser works line by
  // line, and a <li> list flattened into one line reads as a single sentence.
  for (const el of doc.querySelectorAll('li, p, br, div, h1, h2, h3, h4, tr')) {
    el.append(doc.createTextNode('\n'));
  }

  return normaliseWhitespace(doc.body?.textContent ?? '');
}

export function normaliseWhitespace(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Every object in a JSON-LD payload, flattened through arrays and @graph. */
function flattenLd(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) flattenLd(item, out);
    return out;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    out.push(obj);
    if ('@graph' in obj) flattenLd(obj['@graph'], out);
  }
  return out;
}

const isJobPosting = (obj: Record<string, unknown>): boolean => {
  const type = obj['@type'];
  return Array.isArray(type) ? type.includes('JobPosting') : type === 'JobPosting';
};

const asText = (v: unknown): string => (typeof v === 'string' ? v : '');

function fromJsonLd(doc: Document): ExtractedPosting | null {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      // A single malformed block is common and is not a reason to give up on
      // the others in the page.
      continue;
    }

    for (const obj of flattenLd(parsed)) {
      if (!isJobPosting(obj)) continue;

      const org = obj['hiringOrganization'];
      const company =
        org && typeof org === 'object' ? asText((org as Record<string, unknown>)['name']) : '';

      // `description` is HTML in practice, whatever the schema says.
      const description = htmlToText(asText(obj['description']));
      if (description.length < MIN_DESCRIPTION_CHARS) continue;

      return {
        title: normaliseWhitespace(asText(obj['title'])),
        company: normaliseWhitespace(company),
        description,
        source: 'json-ld',
      };
    }
  }

  return null;
}

/**
 * Containers the major ATSs put the description in.
 *
 * Ordered most specific first. These are a fallback for boards that do not
 * publish JSON-LD, and they rot — which is why the density pass below exists
 * and why nothing depends on this list being complete.
 */
const DESCRIPTION_SELECTORS = [
  '[data-automation-id="jobPostingDescription"]', // Workday
  '[data-ui="job-description"]', // Workable
  '[data-qa="job-description"]', // Lever
  '.posting-description', // Lever
  '.job__description', // Greenhouse
  '#job-details', // LinkedIn
  '.show-more-less-html__markup', // LinkedIn
  '.description__text', // LinkedIn
  '[class*="jobDescription"]',
  '[class*="job-description"]',
  '[id*="job-description"]',
  '#content',
  'article',
];

function fromSelectors(doc: Document): ExtractedPosting | null {
  for (const selector of DESCRIPTION_SELECTORS) {
    const el = doc.querySelector(selector);
    if (!el) continue;

    const description = htmlToText(el.innerHTML);
    if (description.length >= MIN_DESCRIPTION_CHARS) {
      return { title: '', company: '', description, source: 'selector' };
    }
  }
  return null;
}

/**
 * Last resort: the densest block of text on the page.
 *
 * Scored by text length divided by descendant element count, which favours
 * prose over navigation — a footer of eighty links has plenty of characters
 * and no paragraphs.
 */
function fromDensity(doc: Document): ExtractedPosting | null {
  let best: { el: Element; score: number } | null = null;

  for (const el of doc.querySelectorAll('main, article, section, div')) {
    const text = el.textContent ?? '';
    if (text.length < MIN_DESCRIPTION_CHARS) continue;

    const elements = el.querySelectorAll('*').length + 1;
    const score = text.length / elements;
    if (!best || score > best.score) best = { el, score };
  }

  if (!best) return null;

  const description = htmlToText(best.el.innerHTML);
  if (description.length < MIN_DESCRIPTION_CHARS) return null;

  return { title: '', company: '', description, source: 'density' };
}

/** Page title, cleaned of the site's own branding suffix. */
export function titleFromDocument(doc: Document): string {
  const heading = doc.querySelector('h1')?.textContent;
  if (heading?.trim()) return normaliseWhitespace(heading);

  // "Senior Engineer - Acme Corp | Greenhouse" -> "Senior Engineer"
  const title = doc.title.split(/\s+[|·—–]\s+/)[0] ?? '';
  return normaliseWhitespace(title.replace(/\s+-\s+.*$/, ''));
}

/**
 * Pull the posting out of a rendered page, or null when there is not one.
 *
 * Title and company fall back to the document when the winning strategy did
 * not supply them, so a selector or density hit is still labelled rather than
 * arriving as an anonymous wall of text.
 */
export function extractPosting(doc: Document): ExtractedPosting | null {
  const found = fromJsonLd(doc) ?? fromSelectors(doc) ?? fromDensity(doc);
  if (!found) return null;

  return {
    ...found,
    title: found.title || titleFromDocument(doc),
    company: found.company || companyFromDocument(doc),
  };
}

/** Best guess at the employer from the page's own metadata. */
export function companyFromDocument(doc: Document): string {
  const meta =
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ??
    doc.querySelector('meta[name="author"]')?.getAttribute('content') ??
    '';
  return normaliseWhitespace(meta);
}
