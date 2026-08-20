import { describe, expect, it } from 'vitest';
import {
  mutationTouchesFillSurface,
  nextOfferDelay,
  OFFER_MAX_WAIT_MS,
  OFFER_QUIET_MS,
} from '@/lib/fill/mutations';

function recordsFor(change: () => void): Promise<MutationRecord[]> {
  return new Promise((resolve) => {
    const observer = new MutationObserver((records) => {
      observer.disconnect();
      resolve(records);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    change();
  });
}

describe('launcher mutation gating', () => {
  it('ignores cosmetic churn outside application surfaces', async () => {
    document.body.innerHTML = '<main><div id="ticker"></div></main>';
    const records = await recordsFor(() => {
      document.querySelector('#ticker')!.append(document.createElement('span'));
    });
    expect(mutationTouchesFillSurface(records)).toBe(false);
  });

  it('notices a newly rendered form and changes inside an existing form', async () => {
    document.body.innerHTML = '<main id="root"></main>';
    const added = await recordsFor(() => {
      document.querySelector('#root')!.insertAdjacentHTML(
        'beforeend',
        '<form><label>Email<input type="email"></label></form>',
      );
    });
    expect(mutationTouchesFillSurface(added)).toBe(true);

    const relabelled = await recordsFor(() => {
      document.querySelector('label')!.append(' address');
    });
    expect(mutationTouchesFillSurface(relabelled)).toBe(true);
  });

  it('debounces ordinary bursts but never waits forever on a busy SPA', () => {
    expect(nextOfferDelay(1_000, 1_100)).toBe(OFFER_QUIET_MS);
    expect(nextOfferDelay(1_000, 1_000 + OFFER_MAX_WAIT_MS - 50)).toBe(50);
    expect(nextOfferDelay(1_000, 1_000 + OFFER_MAX_WAIT_MS + 50)).toBe(0);
  });
});
