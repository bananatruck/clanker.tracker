/** Cheap mutation gate for the page launcher. */

const FILL_SURFACE = [
  'form',
  'input',
  'textarea',
  'select',
  'option',
  '[contenteditable]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="radiogroup"]',
  '[role="switch"]',
  '[data-automation-id="adventureButton"]',
  '[data-automation-id="applyManually"]',
].join(',');

const touchesSurface = (node: Node): boolean =>
  node instanceof Element && (node.matches(FILL_SURFACE) || Boolean(node.querySelector(FILL_SURFACE)));

/** Ignore cosmetic page churn while still noticing new controls and label changes. */
export function mutationTouchesFillSurface(records: readonly MutationRecord[]): boolean {
  return records.some((record) => {
    if (record.type === 'attributes') return touchesSurface(record.target);
    if ([...record.addedNodes, ...record.removedNodes].some(touchesSurface)) return true;

    // Frameworks often update a label as a text node rather than replacing its
    // input. Only text churn within a form is relevant; animations elsewhere
    // on the posting page should not trigger a full shadow-aware harvest.
    return record.target instanceof Element && Boolean(record.target.closest('form'));
  });
}

export const OFFER_QUIET_MS = 300;
export const OFFER_MAX_WAIT_MS = 1200;

/** Trailing debounce with a maximum wait, so a busy SPA cannot starve launch. */
export function nextOfferDelay(firstMutationAt: number, now: number): number {
  const remaining = OFFER_MAX_WAIT_MS - Math.max(0, now - firstMutationAt);
  return Math.max(0, Math.min(OFFER_QUIET_MS, remaining));
}
