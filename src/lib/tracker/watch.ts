/**
 * Detecting that an application was actually *sent*.
 *
 * This distinction is the whole integrity of the tracker. The review overlay's
 * "Fill" button means the user accepted our values — it does not mean the
 * employer received anything. Logging there would inflate the count, and an
 * economy where DP comes from a real action cannot be built on a number that
 * counts intentions.
 *
 * So the fill run arms a watcher instead, and the application is logged when
 * the page is genuinely submitted:
 *
 *   - a `submit` event on the form, for the many ATSs that still post a form;
 *   - a click on a button whose text reads like a submit, for the SPAs that
 *     never fire one.
 *
 * It fires at most once, and disarms itself if nothing happens — a watcher
 * left on a tab overnight would log the next thing the user clicked.
 */

/** Button text that means "send it", as opposed to "save" or "next". */
const SUBMIT_TEXT =
  /\b(submit|send application|apply now|submit application|finish|complete application)\b/i;

/** Text that looks like submitting but isn't. Checked first. */
const NOT_SUBMIT_TEXT = /\b(save|next|continue|back|cancel|preview|upload|autofill)\b/i;

const CONFIRMATION_ROUTE =
  /(?:^|[\/#_-])(?:application[-_]?)(?:submitted|received|complete)(?:$|[\/#?_-])|(?:^|[\/#_-])(?:thank[-_]?you|confirmation)(?:$|[\/#?_-])/i;

const CONFIRMATION_TEXT =
  /\b(?:thank you for (?:applying|your application)|application (?:has been |was |is |successfully )?(?:submitted|received|complete)|we(?:'ve| have) received your application|your application (?:has been |was |is )?(?:submitted|received|complete))\b/i;

const CONFIRMATION_SELECTORS = [
  '[data-automation-id*="submitted"]',
  '[data-automation-id*="confirmation"]',
  '[data-testid*="submitted"]',
  '[data-testid*="confirmation"]',
  '[class*="application-submitted"]',
  '[class*="application-confirmation"]',
  '[role="alert"]',
  '[role="status"]',
  'main h1',
  'main h2',
  'h1',
  'h2',
] as const;

/** High-confidence evidence that the ATS accepted an application. */
export function hasSubmissionConfirmation(doc: Document, currentUrl: string): boolean {
  try {
    const url = new URL(currentUrl);
    if (CONFIRMATION_ROUTE.test(`${url.pathname}${url.hash}`)) return true;
  } catch {
    if (CONFIRMATION_ROUTE.test(currentUrl)) return true;
  }

  const candidates: string[] = [doc.title];
  for (const selector of CONFIRMATION_SELECTORS) {
    for (const element of doc.querySelectorAll<HTMLElement>(selector)) {
      candidates.push(
        element.textContent ?? '',
        element.getAttribute('aria-label') ?? '',
        element.getAttribute('data-automation-id') ?? '',
        element.getAttribute('data-testid') ?? '',
      );
    }
  }
  return CONFIRMATION_TEXT.test(candidates.join(' ').replace(/\s+/g, ' '));
}

export function looksLikeSubmit(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;

  const text = [
    el.textContent ?? '',
    el.getAttribute('aria-label') ?? '',
    el.getAttribute('value') ?? '',
    el.getAttribute('data-automation-id') ?? '',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // "Save and continue" on a Workday page is a step, not a submission.
  if (NOT_SUBMIT_TEXT.test(text)) return false;
  return SUBMIT_TEXT.test(text);
}

/** The clickable ancestor of an event target, if there is one. */
function clickableFrom(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest('button, input[type="submit"], a[role="button"], [role="button"]');
}

export interface WatchOptions {
  /** Auto-disarm after this long. Default 30 minutes. */
  timeoutMs?: number;
  root?: Document;
  currentUrl?: () => string;
  /** Called once when the user attempts the final submission. */
  onAttempt?: () => void;
}

/**
 * Arm a one-shot submission watcher. Returns a disarm function.
 *
 * Listeners are capture-phase so a form that calls `stopPropagation` in its
 * own handler — several do — cannot hide the submission from us.
 */
export function watchSubmission(
  form: ParentNode,
  onConfirmed: () => void,
  opts: WatchOptions = {},
): () => void {
  const doc = opts.root ?? document;
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
  const currentUrl = opts.currentUrl ?? (() => doc.location?.href ?? '');
  const view = doc.defaultView;
  let fired = false;
  let attempted = false;
  let active = true;

  const observer = new MutationObserver(() => checkConfirmation());

  const disarm = () => {
    active = false;
    clearTimeout(timer);
    observer.disconnect();
    doc.removeEventListener('submit', onFormSubmit, true);
    doc.removeEventListener('click', onClick, true);
    view?.removeEventListener('popstate', checkConfirmation);
    view?.removeEventListener('hashchange', checkConfirmation);
  };

  const fire = () => {
    if (fired) return;
    fired = true;
    disarm();
    onConfirmed();
  };

  function checkConfirmation(): void {
    if (active && attempted && hasSubmissionConfirmation(doc, currentUrl())) fire();
  }

  const attempt = () => {
    if (!attempted) {
      attempted = true;
      opts.onAttempt?.();
    }
    queueMicrotask(checkConfirmation);
  };

  const onFormSubmit = (e: Event) => {
    // Only the form we filled. A newsletter signup in the footer is not it.
    if (e.target === form || (e.target instanceof Node && form.contains(e.target))) attempt();
  };

  const onClick = (e: Event) => {
    const el = clickableFrom(e.target);
    if (el && form.contains(el) && looksLikeSubmit(el)) attempt();
  };

  doc.addEventListener('submit', onFormSubmit, true);
  doc.addEventListener('click', onClick, true);
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'data-automation-id', 'data-testid', 'role'],
  });
  view?.addEventListener('popstate', checkConfirmation);
  view?.addEventListener('hashchange', checkConfirmation);
  const timer = setTimeout(disarm, timeoutMs);

  return disarm;
}
