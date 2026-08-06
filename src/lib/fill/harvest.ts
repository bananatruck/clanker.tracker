/**
 * Form harvesting — turning a page into a list of questions.
 *
 * Everything the resolver does depends on getting the *label* right, because
 * the label is what tiers 2 through 5 match on. A field whose label we read as
 * "Input 4" cannot be answered by any tier and costs an LLM call to guess at.
 * So label resolution walks six strategies in descending reliability and stops
 * at the first that yields real text.
 *
 * Radio groups are collapsed to one field per `name`: a group asking "Are you
 * authorised to work?" is one question with two options, not two questions.
 */
import type { FieldKind, FieldOption, HarvestedField } from './types';

export type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Input types we never touch. Hidden and submit are not questions. */
const IGNORED_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password']);

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  // happy-dom does not lay out, so offsetParent is unreliable in tests; treat
  // explicit hiding as the signal instead.
  if (el.hidden) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!style) return true;
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function kindOf(el: FieldElement): FieldKind | null {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';

  const type = (el.type || 'text').toLowerCase();
  if (IGNORED_TYPES.has(type)) return null;

  switch (type) {
    case 'email':
      return 'email';
    case 'tel':
      return 'tel';
    case 'url':
      return 'url';
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'radio':
      return 'radio';
    case 'checkbox':
      return 'checkbox';
    case 'file':
      return 'file';
    default:
      return 'text';
  }
}

const clean = (s: string | null | undefined): string =>
  (s ?? '').replace(/\s+/g, ' ').trim();

/** Text of an element with nested inputs stripped out. */
function ownText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const nested of clone.querySelectorAll('input, textarea, select, button')) {
    nested.remove();
  }
  return clean(clone.textContent);
}

/**
 * Find the label a human would read for this field.
 *
 * Order matters: an explicit `label[for]` is authoritative, while a
 * placeholder is a hint the site may also be using as filler text. Falling
 * back to the `name` attribute is last because a humanised `name` is often
 * close enough for tier 2 to hash consistently, which is better than nothing.
 */
export function labelFor(el: FieldElement): string {
  const doc = el.ownerDocument;

  // 1. <label for="id">
  if (el.id) {
    const explicit = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const text = explicit ? ownText(explicit) : '';
    if (text) return text;
  }

  // 2. Wrapping <label>
  const wrapping = el.closest('label');
  if (wrapping) {
    const text = ownText(wrapping);
    if (text) return text;
  }

  // 3. aria-labelledby, then aria-label
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => clean(doc.getElementById(id)?.textContent))
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }
  const ariaLabel = clean(el.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;

  // 4. A preceding sibling that looks like a caption.
  let sibling = el.previousElementSibling;
  let hops = 0;
  while (sibling && hops < 3) {
    if (!sibling.matches('input, textarea, select, script, style')) {
      const text = ownText(sibling);
      if (text && text.length <= 200) return text;
    }
    sibling = sibling.previousElementSibling;
    hops++;
  }

  // 5. Placeholder.
  const placeholder = clean(el.getAttribute('placeholder'));
  if (placeholder) return placeholder;

  // 6. Humanised name attribute — "first_name" reads as "first name", which
  // hashes to the same tier-2 key as a site that spells the label out.
  const name = clean(el.getAttribute('name'));
  if (name) return name.replace(/[_\-.[\]]+/g, ' ').trim();

  return '';
}

function optionsOf(el: FieldElement, doc: Document): FieldOption[] {
  if (el instanceof HTMLSelectElement) {
    return [...el.options]
      .filter((o) => o.value !== '')
      .map((o) => ({ value: o.value, label: clean(o.textContent) || o.value }));
  }

  if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
    const group = doc.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${CSS.escape(el.name)}"]`,
    );
    return [...group].map((r) => ({ value: r.value, label: labelFor(r) || r.value }));
  }

  return [];
}

function currentValue(el: FieldElement): string {
  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
    return el.checked ? el.value : '';
  }
  return el.value ?? '';
}

/** A radio group's "current value" is whichever member is checked. */
function radioGroupValue(name: string, doc: Document): string {
  const checked = doc.querySelector<HTMLInputElement>(
    `input[type="radio"][name="${CSS.escape(name)}"]:checked`,
  );
  return checked?.value ?? '';
}

export interface Harvest {
  fields: HarvestedField[];
  /** Live handles, kept out of the serialisable field list. */
  elements: Map<string, FieldElement>;
}

/** How deep to follow shadow roots. Guards against a pathological tree. */
const MAX_SHADOW_DEPTH = 8;

/**
 * Every field element under `root`, including those inside open shadow roots.
 *
 * `querySelectorAll` stops at a shadow boundary, so a form built from web
 * components returns zero fields and the page looks like it has no
 * application on it. Workday does this, and so does a good share of the
 * component-library careers pages that proprietary boards are built from.
 *
 * Closed shadow roots stay invisible, which is the point of them — nothing
 * here can or should work around that.
 */
export function collectFieldElements(
  root: ParentNode,
  depth = 0,
  seen = new Set<Element>(),
): FieldElement[] {
  const out: FieldElement[] = [];

  for (const el of root.querySelectorAll<FieldElement>('input, textarea, select')) {
    if (seen.has(el)) continue;
    seen.add(el);
    out.push(el);
  }

  if (depth >= MAX_SHADOW_DEPTH) return out;

  for (const host of root.querySelectorAll('*')) {
    const shadow = host.shadowRoot;
    if (shadow) out.push(...collectFieldElements(shadow, depth + 1, seen));
  }

  return out;
}

/**
 * Walk a form (or the whole document) and collect every answerable field.
 *
 * Prefilled fields are still reported — the review overlay shows them so the
 * user can see the form is already partly complete — but the resolver leaves
 * them alone rather than overwriting a value the site or the user set.
 */
export function harvestForm(root: ParentNode & { ownerDocument?: Document | null }): Harvest {
  const doc =
    (root as Element).ownerDocument ?? (root as unknown as Document) ?? globalThis.document;

  const fields: HarvestedField[] = [];
  const elements = new Map<string, FieldElement>();
  const seenRadioGroups = new Set<string>();

  const candidates = collectFieldElements(root);

  for (const el of candidates) {
    const kind = kindOf(el);
    if (!kind) continue;
    if (!isVisible(el)) continue;
    if (el.disabled) continue;

    // One question per radio group, not one per option.
    if (kind === 'radio') {
      const name = el.name;
      if (!name || seenRadioGroups.has(name)) continue;
      seenRadioGroups.add(name);
    }

    const id = `f${fields.length}`;
    const label = labelFor(el);

    // A radio group's label lives on its fieldset, not on the first option.
    const groupLabel =
      kind === 'radio'
        ? clean(
            el.closest('fieldset')?.querySelector('legend')?.textContent ??
              el.getAttribute('aria-label') ??
              '',
          ) || label
        : label;

    fields.push({
      id,
      kind,
      name: clean(el.getAttribute('name')),
      label: groupLabel,
      required: el.required || el.getAttribute('aria-required') === 'true',
      options: optionsOf(el, doc),
      placeholder: clean(el.getAttribute('placeholder')),
      autocomplete: clean(el.getAttribute('autocomplete')),
      existingValue:
        kind === 'radio' ? radioGroupValue(el.name, doc) : currentValue(el),
    });

    elements.set(id, el);
  }

  return { fields, elements };
}

/**
 * The form most likely to be the application.
 *
 * Picking the biggest form beats picking the first: sites routinely put a
 * newsletter signup or a search box above the thing you came to fill in.
 */
export function findApplicationForm(doc: Document): ParentNode {
  const forms = [...doc.querySelectorAll('form')];
  if (forms.length === 0) return doc;

  let best = forms[0]!;
  let bestCount = -1;

  for (const form of forms) {
    // Counted through shadow roots, for the same reason the harvest walks
    // them: a component-built form measures as empty otherwise, and would
    // lose to whatever newsletter box is sitting above it in plain HTML.
    const count = collectFieldElements(form).length;
    if (count > bestCount) {
      best = form;
      bestCount = count;
    }
  }

  // A proprietary page can render its application outside any <form> — React
  // handlers do not need one — and then the biggest form on the page is the
  // site search. Fall back to the whole document when no form holds anything.
  if (bestCount <= 1 && collectFieldElements(doc).length > bestCount) return doc;

  return best;
}
