/**
 * The thing that appears in the corner when you open a job application.
 *
 * A side panel you have to remember to open is a side panel nobody opens. The
 * moment a page turns out to be an application, a small badge shows up in the
 * corner with Kh. Laude on it and a count of what is waiting — the account
 * wall, the fields, the letter — and pressing it starts the run.
 *
 * Built the same way as the review overlay and for the same reasons: a shadow
 * root with its own styles, so the board's CSS cannot reach in and wreck it
 * and ours cannot leak out and wreck their form. It is deliberately small,
 * draggable out of the way, and dismissible for the session — an extension
 * that plants something unmovable over a page you are trying to read has
 * earned being uninstalled.
 */
import type { Gate } from './account';

const HOST_ATTR = 'data-clanker-launcher';

/** Remembered for the tab, so dismissing it stays dismissed while you read. */
let dismissed = false;

export interface LauncherState {
  gate: Gate;
  /** Fields found on the page. Zero means there is nothing to offer yet. */
  fields: number;
  /** Whether a run has already been done here. */
  done: boolean;
}

const STYLE = `
:host { all: initial; }
.badge {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483646;
  display: flex; align-items: center; gap: 9px;
  padding: 8px 12px 8px 9px;
  background: #f2e3c0; color: #35240f;
  border: 3px solid #6d4a2b;
  box-shadow: inset 0 0 0 1px #a87b4a, inset 0 0 0 3px #4a3018, 0 3px 0 0 #16100a;
  font: 600 13px/1.3 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  cursor: pointer;
}
.badge:hover { background: #f9efd6; }
.badge:active { transform: translateY(2px); box-shadow: inset 0 0 0 1px #a87b4a, inset 0 0 0 3px #4a3018; }
.art { width: 34px; height: 34px; flex: none; image-rendering: pixelated; }
.lines { display: flex; flex-direction: column; text-align: left; }
.title { font-size: 13px; }
.sub { font-size: 11.5px; font-weight: 400; color: #6a5233; }
.close {
  all: unset; cursor: pointer; align-self: flex-start;
  width: 16px; height: 16px; line-height: 14px; text-align: center;
  border: 2px solid #6d4a2b; background: #e3cf9f; color: #35240f;
  font: 700 11px/1 system-ui, sans-serif;
}
.close:hover { background: #c9a86f; }
@media (prefers-reduced-motion: no-preference) {
  .badge { animation: rise 220ms steps(4, end); }
  @keyframes rise { from { transform: translateY(14px); opacity: 0; } }
}
`;

/**
 * What the badge says.
 *
 * One line for what this page is and one for what pressing it will do. The
 * account wall gets named explicitly, because "fill this application" on a
 * page that is actually a signup form is a lie the user finds out about
 * afterwards.
 */
export function launcherCopy(state: LauncherState): { title: string; sub: string } | null {
  if (state.done) return { title: 'Filled', sub: 'Review is on the page' };

  switch (state.gate) {
    case 'confirm-email':
      return { title: 'Waiting on your inbox', sub: 'Click their link, then reopen' };
    case 'signup':
      return { title: 'Account first', sub: 'Sign up, then fill the form' };
    case 'login':
      return { title: 'Sign in first', sub: 'Log in, then fill the form' };
    default:
      // Nothing to offer on a page with no form on it. Showing a badge there
      // is how an extension becomes furniture people learn to ignore.
      return state.fields > 0
        ? { title: 'Fill this application', sub: `${state.fields} fields found` }
        : null;
  }
}

export function removeLauncher(doc: Document = document): void {
  doc.querySelector(`[${HOST_ATTR}]`)?.remove();
}

/** Let a fresh navigation offer again after a dismissal. */
export function resetLauncher(): void {
  dismissed = false;
}

/**
 * Draw it, or take it away.
 *
 * Idempotent: called on every DOM change the observer reports, so it has to be
 * cheap and it has to not flicker. Re-rendering only when the copy changes is
 * what keeps it still while someone types into the form underneath it.
 */
export function renderLauncher(
  state: LauncherState,
  onStart: () => void,
  artUrl: string | null,
  doc: Document = document,
): void {
  const copy = launcherCopy(state);
  if (dismissed || !copy) {
    removeLauncher(doc);
    return;
  }

  const existing = doc.querySelector(`[${HOST_ATTR}]`);
  if (existing) {
    const shadow = (existing as HTMLElement).shadowRoot;
    const title = shadow?.querySelector('.title');
    if (title?.textContent === copy.title) return; // nothing changed
    existing.remove();
  }

  const host = doc.createElement('div');
  host.setAttribute(HOST_ATTR, '');
  const shadow = host.attachShadow({ mode: 'open' });

  const style = doc.createElement('style');
  style.textContent = STYLE;

  const badge = doc.createElement('div');
  badge.className = 'badge';
  badge.setAttribute('role', 'button');
  badge.setAttribute('tabindex', '0');
  badge.setAttribute('aria-label', `${copy.title}. ${copy.sub}.`);

  if (artUrl) {
    const art = doc.createElement('img');
    art.className = 'art';
    art.src = artUrl;
    art.alt = '';
    badge.append(art);
  }

  const lines = doc.createElement('div');
  lines.className = 'lines';
  const title = doc.createElement('span');
  title.className = 'title';
  title.textContent = copy.title;
  const sub = doc.createElement('span');
  sub.className = 'sub';
  sub.textContent = copy.sub;
  lines.append(title, sub);

  const close = doc.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Hide until the next page');
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissed = true;
    removeLauncher(doc);
  });

  badge.append(lines, close);
  badge.addEventListener('click', onStart);
  badge.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') onStart();
  });

  shadow.append(style, badge);
  doc.body.append(host);
}
