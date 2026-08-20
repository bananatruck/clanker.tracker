/**
 * The `autocomplete` attribute — the highest-precision free signal on a form,
 * and one this resolver was harvesting and then ignoring entirely.
 *
 * When a site sets `autocomplete="given-name"` it has told us, in a
 * standardised vocabulary, exactly what the field is. There is nothing to
 * infer: no label to read, no synonym to guess, no call to spend. It beats
 * every other tier on both accuracy and speed, so it runs before all of them.
 *
 * Tokens are defined by the HTML standard's autofill detail vocabulary. A real
 * attribute may carry section and mode prefixes — `section-blue shipping
 * given-name` — so the *last* token is the one that names the field.
 */
import type { FillContext } from './labels';

/** `off`/`on` say nothing about what the field holds. */
const NON_FIELD = new Set(['off', 'on', '']);

/**
 * Standard token → the value it asks for.
 *
 * Address tokens use explicit setup facts. We never split a resume's
 * "Berlin, Germany" into a street or postcode: a blank is safer than invented
 * precision, and setup gives the applicant one durable place to add it.
 */
const TOKEN_VALUE: Record<string, (ctx: FillContext) => string> = {
  'given-name': (c) => c.profile.contact.firstName.value,
  'family-name': (c) => c.profile.contact.lastName.value,
  name: (c) => c.profile.contact.fullName.value,
  nickname: (c) => c.preferences.preferredName || c.profile.contact.firstName.value,
  username: (c) => c.profile.contact.email.value,

  email: (c) => c.profile.contact.email.value,
  tel: (c) => c.profile.contact.phone.value,
  'tel-national': (c) => c.profile.contact.phone.value,

  url: (c) => c.profile.contact.website.value,

  'address-line1': (c) => c.preferences.streetAddress,
  'street-address': (c) => c.preferences.streetAddress,
  'address-level1': (c) => c.preferences.region,
  'address-level2': (c) => c.preferences.city,
  'postal-code': (c) => c.preferences.postalCode,
  country: (c) => c.preferences.country,
  'country-name': (c) => c.preferences.country,

  organization: (c) => c.profile.experience[0]?.company ?? '',
  'organization-title': (c) => c.profile.experience[0]?.title ?? '',
};

/** The field-naming token from a raw attribute value, or null. */
export function autocompleteToken(raw: string): string | null {
  const parts = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const last = parts.at(-1) ?? '';
  if (NON_FIELD.has(last)) return null;
  return last;
}

/**
 * What this field wants, according to its own autocomplete attribute.
 *
 * Returns null when the attribute is absent, meaningless, or names something
 * we hold nothing for — in every case the chain simply carries on to the next
 * tier.
 */
export function autocompleteValue(raw: string, ctx: FillContext): string | null {
  const token = autocompleteToken(raw);
  if (!token) return null;

  const value = TOKEN_VALUE[token]?.(ctx).trim();
  return value ? value : null;
}
