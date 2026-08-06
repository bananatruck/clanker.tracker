/**
 * The badge is the first thing the extension ever says on a page it was not
 * invited onto, so what it says has to be true. Two failures matter: offering
 * to "fill this application" on a page that is actually a signup wall, and
 * appearing at all on a page with no form on it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  launcherCopy,
  removeLauncher,
  renderLauncher,
  resetLauncher,
  type LauncherState,
} from '@/lib/fill/launcher';

const state = (over: Partial<LauncherState> = {}): LauncherState => ({
  gate: 'none',
  fields: 12,
  done: false,
  ...over,
});

beforeEach(() => {
  document.body.innerHTML = '';
  resetLauncher();
});

describe('launcherCopy', () => {
  it('names the account wall instead of promising to fill a form', () => {
    // "Fill this application" on a signup page is a lie the user only finds
    // out about after pressing it.
    expect(launcherCopy(state({ gate: 'signup' }))!.title).toBe('Account first');
    expect(launcherCopy(state({ gate: 'login' }))!.title).toBe('Sign in first');
  });

  it('says the inbox is the blocker when it is', () => {
    expect(launcherCopy(state({ gate: 'confirm-email' }))!.title).toMatch(/inbox/i);
  });

  it('offers nothing on a page with no form on it', () => {
    // A badge that shows up everywhere is furniture people learn to ignore.
    expect(launcherCopy(state({ fields: 0 }))).toBeNull();
  });

  it('counts the fields it found', () => {
    expect(launcherCopy(state({ fields: 24 }))!.sub).toBe('24 fields found');
  });
});

describe('renderLauncher', () => {
  it('puts one badge on the page and starts a run when pressed', () => {
    const onStart = vi.fn();
    renderLauncher(state(), onStart, null);

    const host = document.querySelector('[data-clanker-launcher]');
    expect(host).not.toBeNull();

    host!.shadowRoot!.querySelector<HTMLElement>('.badge')!.click();
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('stays out of the page it is sitting on', () => {
    // Shadow-rooted for the same reason the review overlay is: the board's CSS
    // cannot reach in, and ours cannot leak out and wreck their form.
    renderLauncher(state(), () => {}, null);
    const host = document.querySelector('[data-clanker-launcher]')!;
    expect(host.shadowRoot).not.toBeNull();
    expect(host.textContent).toBe('');
  });

  it('does not redraw when nothing has changed', () => {
    renderLauncher(state(), () => {}, null);
    const first = document.querySelector('[data-clanker-launcher]');
    renderLauncher(state(), () => {}, null);
    // Same node, so a badge does not flicker while someone types under it.
    expect(document.querySelector('[data-clanker-launcher]')).toBe(first);
  });

  it('redraws when the page becomes something else', () => {
    renderLauncher(state({ gate: 'signup' }), () => {}, null);
    renderLauncher(state({ gate: 'none' }), () => {}, null);
    const shadow = document.querySelector('[data-clanker-launcher]')!.shadowRoot!;
    expect(shadow.querySelector('.title')!.textContent).toBe('Fill this application');
  });

  it('stays gone once dismissed', () => {
    renderLauncher(state(), () => {}, null);
    const close = document
      .querySelector('[data-clanker-launcher]')!
      .shadowRoot!.querySelector<HTMLElement>('.close')!;
    close.click();
    expect(document.querySelector('[data-clanker-launcher]')).toBeNull();

    renderLauncher(state(), () => {}, null);
    expect(document.querySelector('[data-clanker-launcher]')).toBeNull();
  });

  it('takes itself away when the page stops being an application', () => {
    renderLauncher(state(), () => {}, null);
    renderLauncher(state({ fields: 0 }), () => {}, null);
    expect(document.querySelector('[data-clanker-launcher]')).toBeNull();
  });

  it('removes cleanly', () => {
    renderLauncher(state(), () => {}, null);
    removeLauncher();
    expect(document.querySelector('[data-clanker-launcher]')).toBeNull();
  });
});
