/** Stable identity for one posting across tracking links and repeated visits. */

const TRACKING_PARAM = /^(utm_.+|gh_src|source|ref|refid|trackingid|trk|lever-source)$/i;

export function canonicalJobUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return value.replace(/#.*$/, '');
  }
}

const fold = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function jobDedupeKey(job: { url: string; company: string; role: string }): string {
  const url = canonicalJobUrl(job.url);
  return url ? `url:${url}` : `text:${fold(job.company)}\u001f${fold(job.role)}`;
}
