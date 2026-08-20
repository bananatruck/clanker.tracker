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
import type { AnswerElement, FieldElement } from './harvest';
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

function setChecked(el: HTMLInputElement, checked: boolean): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
  if (setter) setter.call(el, checked);
  else el.checked = checked;
  notify(el);
}

const rootOf = (el: Element): Document | ShadowRoot =>
  el.getRootNode() as Document | ShadowRoot;

export interface ApplyResult {
  ok: boolean;
  /** What actually landed in the field, which may differ for selects. */
  applied: string;
  reason?: 'no-matching-option' | 'readonly' | 'unsupported' | 'reverted';
}

export interface FileAttachment {
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

/** Attach a retained user-selected file to a native file input. */
export function applyFile(
  el: HTMLInputElement,
  attachment: FileAttachment,
): ApplyResult {
  if (el.type !== 'file' || el.disabled) {
    return { ok: false, applied: '', reason: 'unsupported' };
  }

  try {
    const file = new File([attachment.bytes], attachment.fileName, {
      type: attachment.mimeType || 'application/octet-stream',
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
    if (setter) setter.call(el, transfer.files);
    else Object.defineProperty(el, 'files', { configurable: true, value: transfer.files });
    notify(el);

    return el.files?.length === 1
      ? { ok: true, applied: file.name }
      : { ok: false, applied: '', reason: 'unsupported' };
  } catch {
    return { ok: false, applied: '', reason: 'unsupported' };
  }
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
    const root = rootOf(el);
    const group = [
      ...root.querySelectorAll<HTMLInputElement>(
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

    setChecked(target, true);
    return { ok: true, applied: choice };
  }

  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    // Anything that is not an explicit negative reads as "tick it".
    const on = !/^(no|false|0|unchecked|decline)$/i.test(value.trim());
    setChecked(el, on);
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function optionText(option: HTMLElement): string {
  return (option.textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function chooseCombobox(el: HTMLElement, value: string): Promise<ApplyResult> {
  if (el instanceof HTMLInputElement) setValue(el, value);
  el.focus();
  el.click();

  for (let attempt = 0; attempt < 20; attempt++) {
    const controlled = el.getAttribute('aria-controls');
    const root = rootOf(el);
    const scope = controlled
      ? root.querySelector<HTMLElement>(`#${CSS.escape(controlled)}`)
      : null;
    const options = [
      ...(scope?.querySelectorAll<HTMLElement>('[role="option"]') ?? []),
      ...root.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]'),
    ];
    const wanted = value.trim().toLowerCase();
    const choice =
      options.find((option) =>
        optionText(option).toLowerCase() === wanted ||
        (option.getAttribute('data-value') ?? option.getAttribute('value') ?? '').toLowerCase() === wanted,
      ) ??
      options.find((option) => optionText(option).toLowerCase().startsWith(wanted));
    if (choice) {
      choice.click();
      return { ok: true, applied: optionText(choice) };
    }
    await wait(50);
  }

  // An editable combobox is also a valid free-text input when it kept the
  // native value. Button-only pickers must select a real option.
  if (el instanceof HTMLInputElement && el.value === value) {
    return { ok: true, applied: value };
  }
  return { ok: false, applied: '', reason: 'no-matching-option' };
}

const negative = (value: string): boolean =>
  /^(no|false|0|unchecked|off|decline)$/i.test(value.trim());

function ariaChoiceValue(el: HTMLElement): string {
  return (
    el.getAttribute('data-value') ||
    el.getAttribute('value') ||
    el.getAttribute('aria-label') ||
    optionText(el)
  ).trim();
}

async function chooseRadioGroup(
  el: HTMLElement,
  value: string,
  options: readonly FieldOption[],
): Promise<ApplyResult> {
  const choices = [...el.querySelectorAll<HTMLElement>('[role="radio"], input[type="radio"]')];
  const available = options.length > 0
    ? options
    : choices.map((choice) => ({ value: ariaChoiceValue(choice), label: optionText(choice) }));
  const wanted = matchOption(value, available);
  if (wanted === null) return { ok: false, applied: '', reason: 'no-matching-option' };

  const selected = available.find((option) => option.value === wanted);
  const target = choices.find((choice) => {
    const actual = ariaChoiceValue(choice).toLowerCase();
    return actual === wanted.toLowerCase() || actual === selected?.label.toLowerCase();
  });
  if (!target) return { ok: false, applied: '', reason: 'no-matching-option' };

  target.focus();
  target.click();
  return { ok: true, applied: wanted };
}

function toggleAriaControl(el: HTMLElement, value: string): ApplyResult {
  const shouldCheck = !negative(value);
  const isChecked = el.getAttribute('aria-checked') === 'true';
  if (isChecked !== shouldCheck) {
    el.focus();
    el.click();
  }
  return { ok: true, applied: shouldCheck ? 'Yes' : 'No' };
}

/** `null` means the widget exposes no reliable readback signal. */
function valueStuck(el: AnswerElement, result: ApplyResult, intended: string): boolean | null {
  if (!result.ok) return false;
  // A framework can replace the node during reconciliation. The detached
  // node still holds our string, but the user is looking at its empty clone.
  if (!el.isConnected) return false;

  if (el instanceof HTMLInputElement) {
    if (el.type === 'file') return el.files?.[0]?.name === result.applied;
    if (el.type === 'radio') {
      const checked = rootOf(el).querySelector<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(el.name)}"]:checked`,
      );
      return checked?.value === result.applied;
    }
    if (el.type === 'checkbox') return el.checked === (result.applied !== '');
    return el.value === result.applied || el.value === intended;
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return el.value === result.applied || el.value === intended;
  }

  const role = el.getAttribute('role');
  if (role === 'radiogroup') {
    const checked = el.querySelector<HTMLElement>(
      '[role="radio"][aria-checked="true"], input[type="radio"]:checked',
    );
    return checked ? ariaChoiceValue(checked).toLowerCase() === result.applied.toLowerCase() : false;
  }
  if (role === 'switch' || role === 'checkbox') {
    return (el.getAttribute('aria-checked') === 'true') === !negative(result.applied);
  }
  if (role === 'combobox') {
    const reading = [
      el instanceof HTMLInputElement ? el.value : '',
      el.getAttribute('aria-valuetext'),
      el.getAttribute('data-value'),
      optionText(el),
    ].filter(Boolean).join(' ').toLowerCase();
    return reading
      ? reading.includes(result.applied.toLowerCase()) || reading.includes(intended.toLowerCase())
      : null;
  }
  if (el.isContentEditable || el.hasAttribute('contenteditable') || role === 'textbox') {
    return (el.textContent ?? '').trim() === result.applied.trim();
  }
  return null;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await wait(0);
}

/** Apply to either a native form control or an ARIA/contenteditable widget. */
export async function applyAnswer(
  el: AnswerElement,
  value: string,
  options: readonly FieldOption[] = [],
): Promise<ApplyResult> {
  const write = async (): Promise<ApplyResult> => {
    const role = el.getAttribute('role');
    if (role === 'combobox') return chooseCombobox(el, value);
    if (role === 'radiogroup') return chooseRadioGroup(el, value, options);
    if (role === 'switch' || (role === 'checkbox' && !(el instanceof HTMLInputElement))) {
      return toggleAriaControl(el, value);
    }

    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
      if (
        role === 'textbox' ||
        el.isContentEditable ||
        (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false')
      ) {
        el.focus();
        el.textContent = value;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, applied: value };
      }
      return { ok: false, applied: '', reason: 'unsupported' };
    }

    return applyValue(el, value, options);
  };

  let result = await write();
  if (!result.ok) return result;
  await settle();
  let stuck = valueStuck(el, result, value);
  if (stuck !== false) return result;

  // Controlled components occasionally reconcile once after the first event.
  // One retry catches that case without hammering an uncooperative widget.
  result = await write();
  if (!result.ok) return result;
  await settle();
  stuck = valueStuck(el, result, value);
  return stuck === false ? { ok: false, applied: '', reason: 'reverted' } : result;
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

export function highlight(el: HTMLElement, confidence: string): void {
  const colour = HIGHLIGHT[confidence];
  if (!colour) return;
  el.style.outline = `2px solid ${colour}`;
  el.style.outlineOffset = '1px';
}

export function clearHighlight(el: HTMLElement): void {
  el.style.outline = '';
  el.style.outlineOffset = '';
}
