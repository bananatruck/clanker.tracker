/**
 * Writing values back into the page.
 *
 * The whole file exists because `el.value = x` does not work on the modern
 * web. Every ATS in our target list is React (or similar), and React tracks
 * the last value it set on each node; assigning `.value` directly updates the
 * DOM but leaves React's tracker unchanged, so React concludes nothing changed
 * and reverts the field on the next render. The fix is to call the *native*
 * value setter from the prototype, which bypasses React's own property
 * descriptor, then dispatch the events React listens for.
 *
 * Get this wrong and every field appears to fill and then silently empties on
 * submit — the worst possible failure, because the user has already left.
 */
import type { FieldElement } from './harvest';
import { matchOption } from './labels';
import type { FieldOption } from './types';

/** Grab the prototype's setter before any framework overwrites the instance. */
function nativeSetter(el: FieldElement): ((v: string) => void) | null {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  const setter = descriptor?.set;
  return setter ? (v: string) => setter.call(el, v) : null;
}

/** The event sequence a controlled component expects from a real user. */
function notify(el: FieldElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setValue(el: FieldElement, value: string): void {
  const setter = nativeSetter(el);
  if (setter) setter(value);
  else el.value = value;
  notify(el);
}

export interface ApplyResult {
  ok: boolean;
  /** What actually landed in the field, which may differ for selects. */
  applied: string;
  reason?: 'no-matching-option' | 'readonly' | 'unsupported';
}

/**
 * Apply one value to one element.
 *
 * Selects and radio groups resolve the value to a real option first: writing
 * "Yes" into a select whose option value is `1` would leave the field visually
 * unchanged and silently unanswered.
 */
export function applyValue(
  el: FieldElement,
  value: string,
  options: readonly FieldOption[] = [],
): ApplyResult {
  if (el.disabled || (el as HTMLInputElement).readOnly) {
    return { ok: false, applied: '', reason: 'readonly' };
  }

  if (el instanceof HTMLSelectElement) {
    const choice = matchOption(value, options.length > 0 ? options : optionsOfSelect(el));
    if (choice === null) return { ok: false, applied: '', reason: 'no-matching-option' };
    setValue(el, choice);
    return { ok: true, applied: choice };
  }

  if (el instanceof HTMLInputElement && el.type === 'radio') {
    const doc = el.ownerDocument;
    const group = [
      ...doc.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(el.name)}"]`,
      ),
    ];
    const choice = matchOption(
      value,
      group.map((r) => ({ value: r.value, label: r.labels?.[0]?.textContent?.trim() ?? r.value })),
    );
    if (choice === null) return { ok: false, applied: '', reason: 'no-matching-option' };

    const target = group.find((r) => r.value === choice);
    if (!target) return { ok: false, applied: '', reason: 'no-matching-option' };

    target.checked = true;
    notify(target);
    return { ok: true, applied: choice };
  }

  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    // Anything that is not an explicit negative reads as "tick it".
    const on = !/^(no|false|0|unchecked|decline)$/i.test(value.trim());
    el.checked = on;
    notify(el);
    return { ok: true, applied: on ? el.value || 'on' : '' };
  }

  if (el instanceof HTMLInputElement && el.type === 'file') {
    // A file input cannot be set programmatically without a real File and a
    // DataTransfer; resume upload is handled separately and deliberately.
    return { ok: false, applied: '', reason: 'unsupported' };
  }

  setValue(el, value);
  return { ok: true, applied: value };
}

function optionsOfSelect(el: HTMLSelectElement): FieldOption[] {
  return [...el.options]
    .filter((o) => o.value !== '')
    .map((o) => ({ value: o.value, label: (o.textContent ?? '').trim() || o.value }));
}

/**
 * Tint a field so the user can see at a glance what was deterministic and
 * what the model guessed. Uses an outline rather than a background so it can
 * never obscure the site's own validation styling.
 */
const HIGHLIGHT: Record<string, string> = {
  certain: '#4ec9b0',
  guessed: '#d7a75c',
  missing: '#d16969',
};

export function highlight(el: FieldElement, confidence: string): void {
  const colour = HIGHLIGHT[confidence];
  if (!colour) return;
  el.style.outline = `2px solid ${colour}`;
  el.style.outlineOffset = '1px';
}

export function clearHighlight(el: FieldElement): void {
  el.style.outline = '';
  el.style.outlineOffset = '';
}
