/**
 * The review overlay, on its own, for the screenshot set.
 *
 * The overlay normally only exists inside a content script on a live job
 * board, which makes it the one screen that cannot be photographed by opening
 * a URL — and it is the most important screen in the product, because it is
 * the step between a resolver guess and a submitted application.
 *
 * Reached at `sidepanel.html#/demo/overlay`. It calls the real `showReview`
 * with fixture rows, so what is photographed is the shipping component.
 */
import { showReview, type ReviewRow } from '@/lib/fill/overlay';
import { resolutionConfidence, type FieldKind, type ResolverTier } from '@/lib/fill/types';

/** A row as the resolver would hand it over: a field, and who answered it. */
function row(
  id: string,
  label: string,
  value: string,
  tier: ResolverTier | null,
  { kind = 'text' as FieldKind, required = false } = {},
): ReviewRow {
  return {
    field: {
      id,
      kind,
      name: id,
      label,
      required,
      options: [],
      placeholder: '',
      autocomplete: '',
      existingValue: '',
    },
    resolution:
      tier === null
        ? null
        : { fieldId: id, value, tier, confidence: resolutionConfidence(tier) },
  };
}

/**
 * A Greenhouse application, mid-review.
 *
 * Chosen to show the cost story rather than a flattering one: most fields come
 * from tiers 1–3 and cost nothing, one paraphrased question lands on the fuzzy
 * matcher, one genuinely novel question reaches the model, and one is left
 * blank because guessing at it would be worse than asking.
 */
const ROWS: ReviewRow[] = [
  row('first_name', 'First name', 'Ada', 1, { required: true }),
  row('last_name', 'Last name', 'Okafor', 1, { required: true }),
  row('email', 'Email', 'ada.okafor@example.com', 1, { required: true }),
  row('phone', 'Phone', '+44 7700 900412', 1, { required: true }),
  row('location', 'Current location', 'London, UK', 3),
  row('linkedin', 'LinkedIn profile', 'https://linkedin.com/in/adaokafor', 2),
  row('github', 'GitHub / portfolio', 'https://github.com/adaokafor', 2),
  row('work_auth', 'Are you legally authorised to work in the UK?', 'Yes', 2),
  row('sponsorship', 'Will you now or in future require visa sponsorship?', 'No', 2),
  row('notice', 'What is your notice period?', '1 month', 2),
  row('start', 'Earliest date you could join us', '1 month', 4),
  row('salary', 'Salary expectations', '', null, { required: true }),
  row(
    'why_us',
    'What draws you to working on settlement infrastructure?',
    'I have spent three years on a ledger that had to close every day, and I would rather do that than anything with a nicer demo.',
    5,
    { kind: 'textarea' },
  ),
  row('referrer', 'Who referred you? (optional)', '', null),
];

export async function showDemoOverlay(): Promise<void> {
  document.body.style.background = '#050a24';
  await showReview(ROWS, 1, 'The King is pleased. He has not said so.');
}
