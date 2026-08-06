/**
 * Reading the gate in front of the application.
 *
 * Before a board shows you a form it usually shows you a wall: create an
 * account, or sign in, or go and click a link in your email. The three look
 * almost identical in markup and need completely different responses, and
 * getting them the wrong way round is expensive — typing a new password into
 * a sign-in form fails the login, and typing an existing one into a signup
 * form burns the address.
 *
 * So this classifies rather than guesses, from structure first and wording
 * second. Structure is the reliable half: two password fields is a signup in
 * any language, and no password field at all on a page that mentions your
 * inbox is a confirmation wall.
 *
 * Nothing here submits anything. It reports what the page is; the flow decides.
 */

export type Gate =
  /** A form that makes a new account. */
  | 'signup'
  /** A form that signs an existing account in. */
  | 'login'
  /** "We sent you a link." Nothing on this page will move until you click it. */
  | 'confirm-email'
  /** No wall. The application itself is here. */
  | 'none';

export interface GateReading {
  gate: Gate;
  /** The form to act on, when there is one. */
  form: HTMLFormElement | null;
  email: HTMLInputElement | null;
  password: HTMLInputElement | null;
  /** The second password box on a signup, which must get the same value. */
  confirm: HTMLInputElement | null;
  /** The button that commits. Never pressed by the reader. */
  submit: HTMLElement | null;
}

const SIGNUP_WORDS =
  /\b(create (an? )?account|sign ?up|register|get started|join|new account)\b/i;
const LOGIN_WORDS = /\b(sign ?in|log ?in|continue with|welcome back|existing account)\b/i;

/**
 * The wording a board uses when it has sent you a link.
 *
 * Deliberately narrow. "Check your email" appears on plenty of pages that also
 * have a working form on them, so a match only counts when the page has no
 * password field at all — see `read` below.
 */
const CONFIRM_WORDS =
  /\b(check your (e-?mail|inbox)|confirm(ing)? your (e-?mail|address)|verification (e-?mail|link)|we(?:'ve| have)? sent you|verify your (e-?mail|account))/i;

const CONFIRM_ONLY = /\b(resend|didn'?t (get|receive) (it|the e-?mail))\b/i;

const visible = (el: HTMLElement): boolean => {
  if (el.hidden) return false;
  const input = el as HTMLInputElement;
  if (input.type === 'hidden') return false;
  // happy-dom has no layout, so this is a structural check rather than a
  // geometric one: a field inside `display: none` still reports offsetParent
  // null in a real browser and we fall back to the attribute in tests.
  return el.getAttribute('aria-hidden') !== 'true';
};

const inputsOf = (root: ParentNode, selector: string): HTMLInputElement[] =>
  [...root.querySelectorAll<HTMLInputElement>(selector)].filter(visible);

/** Text a human would read off the form, for the wording checks. */
function wordingOf(scope: ParentNode): string {
  const el = scope as HTMLElement;
  const parts = [
    el.textContent ?? '',
    ...[...scope.querySelectorAll('input,button')].map(
      (n) =>
        `${n.getAttribute('value') ?? ''} ${n.getAttribute('name') ?? ''} ${n.getAttribute('id') ?? ''} ${n.getAttribute('aria-label') ?? ''}`,
    ),
  ];
  return parts.join(' ');
}

/**
 * The page as a reader sees it.
 *
 * `textContent` welds block elements together — a heading followed by a
 * paragraph comes back as "Check your emailWe sent you a link" — which
 * silently breaks any word-boundary match across the join. Walking the text
 * nodes and joining on a space is the difference between a phrase matching
 * and not.
 */
function readableText(root: HTMLElement | null): string {
  if (!root) return '';
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.trim();
    if (text) parts.push(text);
  }
  return parts.join(' ');
}

function submitOf(form: ParentNode): HTMLElement | null {
  return (
    form.querySelector<HTMLElement>('button[type="submit"], input[type="submit"]') ??
    form.querySelector<HTMLElement>('button') ??
    null
  );
}

/**
 * Which of the two password boxes is the confirmation.
 *
 * Position is the wrong answer: plenty of forms put "confirm" first, and some
 * put the two in separate fieldsets. The name and the label are right, and
 * when neither says anything, document order is the fallback everyone expects.
 */
function splitPasswords(boxes: HTMLInputElement[]): {
  password: HTMLInputElement | null;
  confirm: HTMLInputElement | null;
} {
  if (boxes.length === 0) return { password: null, confirm: null };
  if (boxes.length === 1) return { password: boxes[0]!, confirm: null };

  const looksConfirm = (el: HTMLInputElement) =>
    /confirm|repeat|verify|again|retype|re-?enter/i.test(
      `${el.name} ${el.id} ${el.getAttribute('aria-label') ?? ''} ${el.placeholder}`,
    );

  const confirm = boxes.find(looksConfirm);
  if (confirm) return { password: boxes.find((b) => b !== confirm) ?? null, confirm };

  return { password: boxes[0]!, confirm: boxes[1]! };
}

/**
 * Read the gate on a document.
 *
 * Order matters and is the whole design:
 *
 *   1. Two password boxes → signup. Nothing else produces that.
 *   2. No password box, but the page says it emailed you → confirmation wall.
 *   3. One password box → wording decides, and **login is the default**,
 *      because signing in with an account you do not have fails harmlessly
 *      while signing up with an address you already used does not.
 */
export function readGate(doc: Document = document): GateReading {
  const forms = [...doc.querySelectorAll('form')];
  const scopes: ParentNode[] = forms.length > 0 ? forms : [doc.body ?? doc];

  for (const scope of scopes) {
    const passwords = inputsOf(scope, 'input[type="password"]');
    const email =
      inputsOf(scope, 'input[type="email"]')[0] ??
      inputsOf(scope, 'input[name*="email" i], input[id*="email" i]')[0] ??
      null;

    const base = {
      form: scope instanceof HTMLFormElement ? scope : null,
      email,
      submit: submitOf(scope),
    };

    if (passwords.length >= 2) {
      const { password, confirm } = splitPasswords(passwords);
      return { gate: 'signup', ...base, password, confirm };
    }

    if (passwords.length === 1) {
      const words = wordingOf(scope);
      // A page that says both — "Sign in / Create account" tabs — is read as a
      // login, per the asymmetry above.
      const gate: Gate =
        SIGNUP_WORDS.test(words) && !LOGIN_WORDS.test(words) ? 'signup' : 'login';
      return { gate, ...base, password: passwords[0]!, confirm: null };
    }
  }

  // No password anywhere. The only interesting thing left is a wall that is
  // waiting on an email, and it has to be saying so about itself.
  const page = readableText(doc.body);
  if (CONFIRM_WORDS.test(page) || CONFIRM_ONLY.test(page)) {
    return { gate: 'confirm-email', form: null, email: null, password: null, confirm: null, submit: null };
  }

  return { gate: 'none', form: null, email: null, password: null, confirm: null, submit: null };
}

/**
 * Put the credentials in, and stop.
 *
 * Returns what it filled so the caller can report it. It does not press the
 * button: pressing it is an account being created, and that is the flow's
 * decision to make with the user's consent, not a side effect of reading a
 * page.
 */
export function fillGate(
  reading: GateReading,
  credentials: { email: string; password: string },
  set: (el: HTMLInputElement, value: string) => void,
): Array<'email' | 'password' | 'confirm'> {
  const done: Array<'email' | 'password' | 'confirm'> = [];

  if (reading.email && credentials.email) {
    set(reading.email, credentials.email);
    done.push('email');
  }
  if (reading.password && credentials.password) {
    set(reading.password, credentials.password);
    done.push('password');
  }
  // The confirmation box gets the same value by definition — a signup form
  // that wants two different passwords does not exist.
  if (reading.confirm && credentials.password) {
    set(reading.confirm, credentials.password);
    done.push('confirm');
  }

  return done;
}
