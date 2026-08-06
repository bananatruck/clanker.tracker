/**
 * The application, as a sequence.
 *
 * An application is not one action, it is a queue of them: get past the
 * account wall, fill the form, write the letter if it wants one, and then —
 * only then, and only with a yes — send it. Before this, the extension knew
 * how to do the middle step and nothing about the shape around it, so every
 * other step was the user's job to remember.
 *
 * Kept as a pure function of (what the page is, what you have) → (what to do
 * next). No DOM, no storage, no side effects, so the order of an application
 * is something a test can assert rather than something you have to click
 * through a job board to check.
 */
import type { Gate } from './account';

export type Stage =
  /** Nothing has happened yet. */
  | 'idle'
  /** An account wall, and we have credentials for it. */
  | 'account'
  /** The board says it has emailed you. Only you can clear this one. */
  | 'confirm-email'
  /** The form itself. */
  | 'filling'
  /** It wants a cover letter and there isn't one yet. */
  | 'letter'
  /** Everything is in. Waiting on the one confirmation that matters. */
  | 'ready'
  /** Sent, logged, banked. */
  | 'done'
  /** Something needs the user and the flow cannot proceed past it. */
  | 'blocked';

export interface FlowState {
  /** What the page is showing right now. */
  gate: Gate;
  /** Whether sign-in details are stored at all. */
  hasCredentials: boolean;
  /** Whether the user has agreed to accounts being made for them. */
  autoAccount: boolean;
  /** Whether the account step has already been done this run. */
  accountDone: boolean;
  /** Whether the form has been filled. */
  filled: boolean;
  /** Fields the fill handed back. A submit over these would be a bad submit. */
  needsYou: number;
  /** Whether the posting asks for a cover letter. */
  wantsLetter: boolean;
  /** Whether a letter has been generated and attached. */
  letterReady: boolean;
  /** Whether the user has confirmed the send. */
  confirmed: boolean;
  /** Whether the application has been logged. */
  logged: boolean;
}

export const initialFlow = (): FlowState => ({
  gate: 'none',
  hasCredentials: false,
  autoAccount: false,
  accountDone: false,
  filled: false,
  needsYou: 0,
  wantsLetter: false,
  letterReady: false,
  confirmed: false,
  logged: false,
});

/**
 * What happens next.
 *
 * The order is the design, and two of the edges are load-bearing:
 *
 *   - **`confirm-email` outranks everything.** Nothing on a page waiting for
 *     you to click a link in your inbox can be advanced by filling it in, and
 *     hammering a form behind that wall is how an address gets rate-limited.
 *   - **`needsYou > 0` blocks `ready`.** The tool refusing to invent a salary
 *     expectation is the tool working; sending the form anyway with that box
 *     empty would throw the refusal away and submit a worse application than
 *     the user would have.
 */
export function nextStage(state: FlowState): Stage {
  if (state.logged) return 'done';

  if (state.gate === 'confirm-email') return 'confirm-email';

  if (!state.accountDone && (state.gate === 'signup' || state.gate === 'login')) {
    // An account wall with nothing to answer it is where the flow stops and
    // says so, rather than filling half a form behind a login it cannot pass.
    if (!state.hasCredentials || !state.autoAccount) return 'blocked';
    return 'account';
  }

  if (!state.filled) return 'filling';
  if (state.wantsLetter && !state.letterReady) return 'letter';
  if (state.needsYou > 0) return 'blocked';
  if (!state.confirmed) return 'ready';

  return 'done';
}

/** What to say about the current stage. One line, no jargon, no blame. */
export function stageMessage(state: FlowState): string {
  switch (nextStage(state)) {
    case 'confirm-email':
      return 'This board has emailed you a link. Click it, then come back — nothing here can do that step for you.';
    case 'account':
      return 'This board wants an account first. Making one.';
    case 'filling':
      return 'Filling the application.';
    case 'letter':
      return 'This one asks for a cover letter. Generate it and it gets attached.';
    case 'ready':
      return 'Everything is in. Nothing is sent until you say so.';
    case 'done':
      return 'Sent, and logged.';
    case 'blocked':
      if (state.needsYou > 0) {
        return `${state.needsYou} ${state.needsYou === 1 ? 'field needs' : 'fields need'} you — the ones it would have had to make up.`;
      }
      if (!state.hasCredentials) {
        return 'This board wants an account, and there are no sign-in details saved. Add them in Settings.';
      }
      return 'This board wants an account. Turn on automatic sign-up in Settings, or make one yourself.';
    default:
      return '';
  }
}

/** Whether the flow can move without the user doing something first. */
export const canProceed = (state: FlowState): boolean => {
  const stage = nextStage(state);
  return stage === 'account' || stage === 'filling';
};

/**
 * The steps, for the progress rail.
 *
 * `letter` is conditional, so the rail only ever shows steps this particular
 * application actually has — a checklist with a permanently greyed row on it
 * teaches the reader to ignore the rail.
 */
export function stepsFor(state: FlowState): Array<{ stage: Stage; label: string; done: boolean }> {
  const stage = nextStage(state);
  const order: Stage[] = ['account', 'filling', 'letter', 'ready', 'done'];
  const reached = order.indexOf(stage);

  const steps: Array<{ stage: Stage; label: string; done: boolean }> = [];
  const push = (s: Stage, label: string) =>
    steps.push({ stage: s, label, done: reached === -1 || order.indexOf(s) < reached });

  if (state.gate === 'signup' || state.gate === 'login' || state.accountDone) {
    push('account', 'Account');
  }
  push('filling', 'Fill');
  if (state.wantsLetter) push('letter', 'Cover letter');
  push('ready', 'Confirm');
  push('done', 'Sent');

  return steps;
}
