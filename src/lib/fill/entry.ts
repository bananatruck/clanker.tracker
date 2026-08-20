/** Safe transition from a Workday posting into its application flow. */
import type { AtsId } from './records';

const enabled = (element: HTMLElement): boolean => {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return !element.hidden &&
    !element.hasAttribute('disabled') &&
    element.getAttribute('aria-disabled') !== 'true' &&
    element.getAttribute('aria-hidden') !== 'true' &&
    (!style || (style.display !== 'none' && style.visibility !== 'hidden'));
};

export function applicationEntry(doc: Document, ats: AtsId): HTMLElement | null {
  if (ats !== 'workday') return null;
  const entry = doc.querySelector<HTMLElement>('[data-automation-id="adventureButton"]');
  return entry && enabled(entry) ? entry : null;
}

function waitForManualRoute(doc: Document, timeoutMs = 6000): Promise<HTMLElement | null> {
  const current = doc.querySelector<HTMLElement>('[data-automation-id="applyManually"]');
  if (current && enabled(current)) return Promise.resolve(current);

  return new Promise((resolve) => {
    const finish = (element: HTMLElement | null) => {
      observer.disconnect();
      clearTimeout(timeout);
      resolve(element);
    };
    const observer = new MutationObserver(() => {
      const manual = doc.querySelector<HTMLElement>('[data-automation-id="applyManually"]');
      if (manual && enabled(manual)) finish(manual);
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
    const timeout = setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Open Workday and choose its manual/local-profile route. This never signs in,
 * creates an account, presses Next, or submits; it runs only after an explicit
 * Clanker action so a posting with zero fields is not a dead end.
 */
export async function beginApplication(doc: Document, ats: AtsId): Promise<boolean> {
  const entry = applicationEntry(doc, ats);
  if (!entry) return false;

  entry.click();
  const manual = await waitForManualRoute(doc);
  if (!manual) return false;
  manual.click();
  return true;
}
