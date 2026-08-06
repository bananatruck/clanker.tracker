/**
 * The sign-in details the flow uses to make accounts on job boards.
 *
 * Half the applications in a job hunt begin with "create an account", and the
 * account is a formality — it exists so the board can email you a rejection.
 * Doing that by hand two hundred times is the single most demoralising part of
 * applying, so the tool does it.
 *
 * ## Where this lives, and why
 *
 * `chrome.storage.local`, next to the API key, and **never** IndexedDB. That
 * split is the whole reason `.clankdb` can dump every table without leaking a
 * credential: the database holds what you would want to move between machines,
 * and this holds what you would not.
 *
 * Two things worth being plain about, because a password store that oversells
 * itself is worse than one that does not exist:
 *
 *   - `chrome.storage.local` is **not encrypted at rest**. It is a file in
 *     your Chrome profile. Anything with your unlocked machine can read it.
 *   - Any code running in this extension can read it, which is an argument for
 *     the extension staying small and auditable rather than for a scheme that
 *     would only look like protection.
 *
 * What it is not exposed to: the page. Credentials are held in the background
 * worker and the value is handed to the content script only for the single
 * field it is about to type into, on a page the user has already opened.
 */

const KEY = 'account.credentials';

export interface Credentials {
  email: string;
  password: string;
  /**
   * Whether the user wants accounts made without being asked each time. Off is
   * the honest default — typing a password into a page is not a thing to do on
   * someone's behalf until they have said so once.
   */
  auto: boolean;
}

export const emptyCredentials = (): Credentials => ({ email: '', password: '', auto: false });

export const hasCredentials = (c: Credentials | null): c is Credentials =>
  c !== null && c.email.trim() !== '' && c.password !== '';

export async function getCredentials(): Promise<Credentials> {
  const got = await chrome.storage.local.get(KEY);
  const stored = got[KEY] as Partial<Credentials> | undefined;
  return { ...emptyCredentials(), ...stored };
}

export async function setCredentials(next: Partial<Credentials>): Promise<void> {
  const merged = { ...(await getCredentials()), ...next };
  await chrome.storage.local.set({ [KEY]: merged });
}

/** Forget them. Offered in Settings, because a store you cannot empty is a trap. */
export async function clearCredentials(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

/**
 * A password, obscured for display.
 *
 * Shown in Settings so you can tell there *is* one without putting it on
 * screen — the common case for looking at that row is checking whether it is
 * set, not reading it back.
 */
export const maskPassword = (password: string): string =>
  password === '' ? '' : '•'.repeat(Math.min(12, Math.max(6, password.length)));
