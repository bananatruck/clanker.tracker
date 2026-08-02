import { describe, it, expect, vi } from 'vitest';
import { looksLikeSubmit, watchSubmission } from '@/lib/tracker/watch';

function button(text: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = text;
  return el;
}

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

describe('the submission watcher', () => {
  it('fires on a submit event from the watched form', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const onSubmit = vi.fn();
    watchSubmission(form, onSubmit);

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    form.remove();
  });

  it('ignores a submit from some other form on the page', () => {
    const form = document.createElement('form');
    const newsletter = document.createElement('form');
    document.body.append(form, newsletter);
    const onSubmit = vi.fn();
    watchSubmission(form, onSubmit);

    newsletter.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).not.toHaveBeenCalled();
    form.remove();
    newsletter.remove();
  });

  it('fires on a submit-looking click, for SPAs that never post a form', () => {
    const form = document.createElement('div');
    const btn = button('Submit application');
    form.append(btn);
    document.body.append(form);
    const onSubmit = vi.fn();
    watchSubmission(form, onSubmit);

    btn.click();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    form.remove();
  });

  /** One application per fill. A double-click is not two applications. */
  it('fires at most once', () => {
    const form = document.createElement('form');
    const btn = button('Submit');
    form.append(btn);
    document.body.append(form);
    const onSubmit = vi.fn();
    watchSubmission(form, onSubmit);

    btn.click();
    btn.click();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    form.remove();
  });

  it('stops listening once disarmed, so a stale watcher cannot log', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const onSubmit = vi.fn();
    const disarm = watchSubmission(form, onSubmit);

    disarm();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).not.toHaveBeenCalled();
    form.remove();
  });

  it('disarms itself after the timeout rather than watching a tab all night', () => {
    vi.useFakeTimers();
    const form = document.createElement('form');
    document.body.append(form);
    const onSubmit = vi.fn();
    watchSubmission(form, onSubmit, { timeoutMs: 1000 });

    vi.advanceTimersByTime(1001);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).not.toHaveBeenCalled();
    form.remove();
    vi.useRealTimers();
  });
});
