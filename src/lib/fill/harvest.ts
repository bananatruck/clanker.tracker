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
import { SECTION_HINT_RE, semanticPath, semanticReading } from './semantic';

export type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
export type AnswerElement = FieldElement | HTMLElement;

/** Input types we never touch. Hidden and submit are not questions. */
const IGNORED_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password']);

/** Known bot-trap controls must never receive applicant data. */
function isHoneypot(el: Element): boolean {
  const signal = [
    el.getAttribute('data-automation-id'),
    el.getAttribute('data-testid'),
    el.getAttribute('name'),
    el.getAttribute('id'),
  ].filter(Boolean).join(' ');
  return (
    el.hasAttribute('data-honeypot') ||
    /\b(beecatcher|honey[\s_-]?pot|captcha[\s_-]?trap)\b/i.test(signal)
  );
}

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  // happy-dom does not lay out, so offsetParent is unreliable in tests; treat
  // explicit hiding as the signal instead.
  if (el.hidden) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!style) return true;
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function kindOf(el: AnswerElement): FieldKind | null {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (!(el instanceof HTMLInputElement)) {
    const role = el.getAttribute('role');
    if (role === 'combobox') return 'combobox';
    if (role === 'radiogroup') return 'radiogroup';
    if (role === 'switch' || role === 'checkbox') return 'switch';
    if (
      role === 'textbox' ||
      el.isContentEditable ||
      (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false')
    ) {
      return 'contenteditable';
    }
    return null;
  }

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

/** One piece of ancestor context, and how far up it was found. */
interface ContextPart {
  text: string;
  depth: number;
}

/**
 * Compact structural context; never include the entire application as a label.
 *
 * Depth is kept rather than flattened because the resolver weights this
 * evidence by proximity — see `SignalPart` in semantic.ts. A word on the card
 * a field sits in means far more than the same word on the page wrapper.
 */
function contextParts(el: Element): ContextPart[] {
  const parts: ContextPart[] = [];
  const seen = new Set<string>();
  let current: Element | null = el;

  const push = (value: string, depth: number) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    parts.push({ text: value, depth });
  };

  for (let depth = 0; current && depth < 7; depth++) {
    for (const attr of ['data-automation-id', 'data-testid', 'name', 'id', 'aria-label']) {
      const value = clean(current.getAttribute(attr));
      if (value && value.length <= 120) push(value, depth);
    }

    // Class names are the only structural signal some boards give. Greenhouse
    // wraps its education block in `.education--container` and nothing else on
    // the field or its ancestors says "education" at all, so without this the
    // Degree and Discipline selects have no section to belong to. Filtered to
    // section vocabulary: dumping every class would bury the real evidence in
    // `remix-css-b62m3t-container` noise.
    for (const token of (current.getAttribute('class') ?? '').split(/\s+/)) {
      if (token && token.length <= 40 && SECTION_HINT_RE.test(token)) push(token, depth);
    }

    // Real section headers are often neither a <legend> nor an <h*>. Greenhouse
    // renders "Education" as a <p> inside `.education--header`, so an element
    // whose class says it is a header counts as one.
    const heading = current.querySelector<HTMLElement>(
      ':scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [role="heading"],' +
        ':scope > [class*="header" i], :scope > [class*="heading" i], :scope > [class*="legend" i]',
    );
    const headingText = clean(heading?.textContent);
    if (headingText && headingText.length <= 160) push(headingText, depth);

    if (current.parentElement) {
      current = current.parentElement;
    } else {
      const root = current.getRootNode();
      current = 'host' in root && root.host instanceof Element ? root.host : null;
    }
  }

  return parts;
}

/**
 * Proximity weight for context found `depth` levels up.
 *
 * Starts just below the field's own label and flattens out, so distant
 * ancestors still contribute but can never outvote the field itself.
 */
const contextWeight = (depth: number): number => Math.max(0.35, 0.85 - depth * 0.1);

/** Compact structural context; never include the entire application as a label. */
function contextFor(el: Element): string {
  return contextParts(el)
    .map((p) => p.text)
    .join(' · ')
    .slice(0, 700);
}

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
export function labelFor(el: AnswerElement): string {
  const doc = el.ownerDocument;
  const root = el.getRootNode() as Document | ShadowRoot;
  const inRoot = (selector: string): Element | null =>
    root.querySelector(selector) ?? doc.querySelector(selector);

  // 1. <label for="id">
  if (el.id) {
    const explicit = inRoot(`label[for="${CSS.escape(el.id)}"]`);
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
      .map((id) => clean(inRoot(`#${CSS.escape(id)}`)?.textContent))
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

function optionsOf(el: AnswerElement, doc: Document): FieldOption[] {
  const root = el.getRootNode() as Document | ShadowRoot;
  if (el instanceof HTMLSelectElement) {
    return [...el.options]
      .filter((o) => o.value !== '')
      .map((o) => ({ value: o.value, label: clean(o.textContent) || o.value }));
  }

  if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
    const group = root.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${CSS.escape(el.name)}"]`,
    );
    return [...group].map((r) => ({ value: r.value, label: labelFor(r) || r.value }));
  }

  if (el.getAttribute('role') === 'combobox') {
    const controlled = el.getAttribute('aria-controls');
    const scope = controlled
      ? root.querySelector<HTMLElement>(`#${CSS.escape(controlled)}`)
      : root;
    return [...(scope?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
      .filter(isVisible)
      .map((option) => ({
        value: clean(option.getAttribute('data-value')) || clean(option.textContent),
        label: clean(option.textContent),
      }))
      .filter((option) => option.value);
  }

  if (el.getAttribute('role') === 'radiogroup') {
    return [...el.querySelectorAll<HTMLElement>('[role="radio"], input[type="radio"]')]
      .map((option) => ({
        value:
          clean(option.getAttribute('data-value')) ||
          clean(option.getAttribute('value')) ||
          clean(option.getAttribute('aria-label')) ||
          clean(option.textContent),
        label: labelFor(option) || clean(option.textContent),
      }))
      .filter((option) => option.value);
  }

  if (el.getAttribute('role') === 'switch' || el.getAttribute('role') === 'checkbox') {
    return [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }];
  }

  return [];
}

function currentValue(el: AnswerElement): string {
  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
    return el.checked ? el.value : '';
  }
  if ('value' in el) return String(el.value ?? '');
  if (el.getAttribute('role') === 'radiogroup') {
    const checked = el.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], input[type="radio"]:checked');
    return checked
      ? clean(checked.getAttribute('data-value')) ||
          clean(checked.getAttribute('value')) ||
          clean(checked.getAttribute('aria-label')) ||
          clean(checked.textContent)
      : '';
  }
  if (el.getAttribute('role') === 'switch' || el.getAttribute('role') === 'checkbox') {
    return el.getAttribute('aria-checked') === 'true' ? 'Yes' : '';
  }
  return clean(el.textContent);
}

/** A radio group's "current value" is whichever member is checked. */
function radioGroupValue(name: string, root: ParentNode): string {
  const checked = root.querySelector<HTMLInputElement>(
    `input[type="radio"][name="${CSS.escape(name)}"]:checked`,
  );
  return checked?.value ?? '';
}

export interface Harvest {
  fields: HarvestedField[];
  /** Live handles, kept out of the serialisable field list. */
  elements: Map<string, AnswerElement>;
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
): AnswerElement[] {
  const out: AnswerElement[] = [];

  for (const el of root.querySelectorAll<AnswerElement>(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="radiogroup"], [role="switch"], [role="checkbox"]',
  )) {
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
  const elements = new Map<string, AnswerElement>();
  const seenRadioGroups = new Set<string>();
  const occurrence = new Map<string, number>();
  const explicitBase = new Map<string, number>();

  const candidates = collectFieldElements(root);

  for (const el of candidates) {
    const kind = kindOf(el);
    if (!kind) continue;
    if (isHoneypot(el)) continue;
    // Native file controls are commonly hidden behind a styled upload button.
    // Attaching to that real control is still the correct, event-producing
    // path; every other invisible input remains out of scope.
    if (!isVisible(el) && kind !== 'file') continue;
    if ('disabled' in el && el.disabled) continue;
    if (el.getAttribute('aria-disabled') === 'true') continue;

    // A custom radiogroup is the question. Native radios nested inside it are
    // implementation details and must not become a duplicate second field.
    if (
      kind === 'radio' &&
      el instanceof HTMLInputElement &&
      el.closest('[role="radiogroup"]')
    ) continue;

    // One question per radio group, not one per option.
    if (kind === 'radio') {
      const name = el instanceof HTMLInputElement ? el.name : '';
      if (!name || seenRadioGroups.has(name)) continue;
      seenRadioGroups.add(name);
    }

    const id = `f${fields.length}`;
    const label = labelFor(el);
    const ancestry = contextParts(el);
    const context = ancestry.map((p) => p.text).join(' · ').slice(0, 700);

    // A radio group's label lives on its fieldset, not on the first option.
    const groupLabel =
      kind === 'radio' || kind === 'radiogroup'
        ? clean(
            el.closest('fieldset')?.querySelector('legend')?.textContent ??
              el.querySelector<HTMLElement>(':scope > legend, :scope > [role="heading"]')?.textContent ??
              el.getAttribute('aria-label') ??
              '',
          ) || label
        : label;

    const name = clean(el.getAttribute('name'));
    const placeholder = clean(el.getAttribute('placeholder'));
    const autocomplete = clean(el.getAttribute('autocomplete'));
    // Ordered by how much each signal is worth: the label a human reads is the
    // field's own account of itself, the attributes it carries come next, and
    // the DOM around it decays with distance.
    const semantic = semanticReading([
      { text: groupLabel, weight: 1 },
      { text: name, weight: 0.95 },
      { text: placeholder, weight: 0.9 },
      { text: autocomplete, weight: 0.9 },
      ...ancestry.map((p) => ({ text: p.text, weight: contextWeight(p.depth) })),
    ]);
    const occurrenceKey = `${semantic.section}:${semantic.leaf ?? ''}`;
    const seen = occurrence.get(occurrenceKey) ?? 0;
    if (semantic.explicitIndex !== null && !explicitBase.has(semantic.section)) {
      explicitBase.set(semantic.section, semantic.explicitIndex === 0 ? 0 : 1);
    }
    const base = explicitBase.get(semantic.section) ?? 0;
    const groupIndex = semantic.explicitIndex === null
      ? seen
      : Math.max(0, semantic.explicitIndex - base);
    if (semantic.leaf) occurrence.set(occurrenceKey, Math.max(seen + 1, groupIndex + 1));

    fields.push({
      id,
      kind,
      name,
      label: groupLabel,
      required:
        ('required' in el && Boolean(el.required)) || el.getAttribute('aria-required') === 'true',
      options: optionsOf(el, doc),
      placeholder,
      autocomplete,
      existingValue:
        kind === 'radio' && el instanceof HTMLInputElement
          ? radioGroupValue(el.name, el.getRootNode() as ParentNode)
          : currentValue(el),
      section: semantic.section,
      sectionLabel: context,
      groupIndex: semantic.leaf ? groupIndex : undefined,
      semanticPath: semantic.leaf
        ? semanticPath(semantic.section, groupIndex, semantic.leaf)
        : undefined,
      context,
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
