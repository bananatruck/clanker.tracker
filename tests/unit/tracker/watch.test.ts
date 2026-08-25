import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  hasSubmissionConfirmation,
  looksLikeSubmit,
  watchSubmission,
} from '@/lib/tracker/watch';

function button(text: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = text;
  return el;
}

beforeEach(() => document.body.replaceChildren());

describe('telling a submit from a step', () => {
  it.each(['Submit', 'Submit application', 'Apply now', 'Send application'])(
    '%s sends the application',
    (text) => expect(looksLikeSubmit(button(text))).toBe(true),
  );

  /**
   * Workday's multi-page flow is the reason this list exists: "Save and
   * Continue" appears on every step and submits nothing.
   */
  it.each(['Save and Continue', 'Next', 'Back', 'Upload resume', 'Preview'])(
    '%s does not',
    (text) => expect(looksLikeSubmit(button(text))).toBe(false),
  );

  it('reads an aria-label when the button has no text', () => {
    const el = document.createElement('button');
    el.setAttribute('aria-label', 'Submit application');
    expect(looksLikeSubmit(el)).toBe(true);
  });
});

describe('submission confirmation evidence', () => {
  it('accepts explicit ATS success evidence', () => {
    document.body.innerHTML = '<main><h1>Thank you for applying</h1></main>';
    expect(hasSubmissionConfirmation(document, 'https://jobs.test/42')).toBe(true);
  });

  it('does not treat a submit control as evidence that the server accepted it', () => {
    document.body.innerHTML = '<form><button>Submit application</button></form>';
    expect(hasSubmissionConfirmation(document, 'https://jobs.test/42')).toBe(false);
  });

  it('accepts a dedicated confirmation route without depending on vendor markup', () => {
    document.body.innerHTML = '';
    expect(hasSubmissionConfirmation(document, 'https://jobs.test/application-submitted')).toBe(true);
  });
});

describe('the submission watcher', () => {
  it('records a form submission attempt but waits for acceptance evidence', async () => {
    const form = document.createElement('form');
    document.body.append(form);
    const onConfirmed = vi.fn();
    const onAttempt = vi.fn();
    watchSubmission(form, onConfirmed, { onAttempt });

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onConfirmed).not.toHaveBeenCalled();

    const heading = document.createElement('h1');
    heading.textContent = 'Application successfully submitted';
    document.body.append(heading);
    await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
  });

  it('ignores a submit from some other form on the page', () => {
    const form = document.createElement('form');
    const newsletter = document.createElement('form');
    document.body.append(form, newsletter);
    const onConfirmed = vi.fn();
    const onAttempt = vi.fn();
    watchSubmission(form, onConfirmed, { onAttempt });

    newsletter.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onAttempt).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('waits for SPA confirmation after a submit-looking click', async () => {
    const form = document.createElement('div');
    const btn = button('Submit application');
    form.append(btn);
    document.body.append(form);
    const onConfirmed = vi.fn();
    const onAttempt = vi.fn();
    watchSubmission(form, onConfirmed, { onAttempt });

    btn.click();
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onConfirmed).not.toHaveBeenCalled();

    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.textContent = "We've received your application";
    document.body.append(status);
    await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
  });

  /** One application per fill. A double-click is not two applications. */
  it('fires at most once', async () => {
    const form = document.createElement('form');
    const btn = button('Submit');
    form.append(btn);
    document.body.append(form);
    const onConfirmed = vi.fn();
    watchSubmission(form, onConfirmed);

    btn.click();
    btn.click();
    const heading = document.createElement('h1');
    heading.textContent = 'Thank you for applying';
    document.body.append(heading);
    await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it('ignores a submit-looking control outside the filled surface', () => {
    const form = document.createElement('form');
    const other = button('Submit application');
    document.body.append(form, other);
    const onAttempt = vi.fn();
    watchSubmission(form, vi.fn(), { onAttempt });

    other.click();
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it('stops listening once disarmed, so a stale watcher cannot log', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const onSubmit = vi.fn();
    const disarm = watchSubmission(form, onSubmit);

    disarm();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disarms itself after the timeout rather than watching a tab all night', async () => {
    vi.useFakeTimers();
    const form = document.createElement('form');
    document.body.append(form);
    const onSubmit = vi.fn();
    watchSubmission(form, onSubmit, { timeoutMs: 1000 });

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(1001);
    const heading = document.createElement('h1');
    heading.textContent = 'Application successfully submitted';
    document.body.append(heading);
    await Promise.resolve();
    expect(onSubmit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
