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
}

/**
 * Arm a one-shot submission watcher. Returns a disarm function.
 *
 * Listeners are capture-phase so a form that calls `stopPropagation` in its
 * own handler — several do — cannot hide the submission from us.
 */
export function watchSubmission(
  form: ParentNode,
  onSubmit: () => void,
  opts: WatchOptions = {},
): () => void {
  const doc = opts.root ?? document;
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
  let fired = false;

  const disarm = () => {
    clearTimeout(timer);
    doc.removeEventListener('submit', onFormSubmit, true);
    doc.removeEventListener('click', onClick, true);
  };

  const fire = () => {
    if (fired) return;
    fired = true;
    disarm();
    onSubmit();
  };

  const onFormSubmit = (e: Event) => {
    // Only the form we filled. A newsletter signup in the footer is not it.
    if (e.target === form || (e.target instanceof Node && form.contains(e.target))) fire();
  };

  const onClick = (e: Event) => {
    const el = clickableFrom(e.target);
    if (el && looksLikeSubmit(el)) fire();
  };

  doc.addEventListener('submit', onFormSubmit, true);
  doc.addEventListener('click', onClick, true);
  const timer = setTimeout(disarm, timeoutMs);

  return disarm;
}
