/**
 * Reading a gate wrong is expensive in a way most parsing mistakes are not:
 * a new password typed into a sign-in form fails the login, and an existing
 * address typed into a signup form burns it. So the classification is tested
 * against the markup shapes boards actually ship.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fillGate, readGate } from '@/lib/fill/account';

const page = (html: string) => {
  document.body.innerHTML = html;
  return document;
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('readGate', () => {
  it('reads two password boxes as a signup, whatever the page says', () => {
    // Structure over wording: nothing but a signup asks twice.
    const doc = page(`
      <form>
        <input type="email" name="email">
        <input type="password" name="password">
        <input type="password" name="password_confirmation">
        <button type="submit">Continue</button>
      </form>`);
    const read = readGate(doc);
    expect(read.gate).toBe('signup');
    expect(read.password!.name).toBe('password');
    expect(read.confirm!.name).toBe('password_confirmation');
  });

  it('finds the confirmation box by name rather than by position', () => {
    const doc = page(`
      <form>
        <input type="password" name="confirm_password">
        <input type="password" name="password">
      </form>`);
    const read = readGate(doc);
    expect(read.confirm!.name).toBe('confirm_password');
    expect(read.password!.name).toBe('password');
  });

  it('reads one password box with signup wording as a signup', () => {
    const doc = page(`
      <form>
        <h1>Create an account</h1>
        <input type="email" name="email">
        <input type="password" name="password">
        <button type="submit">Sign up</button>
      </form>`);
    expect(readGate(doc).gate).toBe('signup');
  });

  it('defaults a single password box to login', () => {
    // The asymmetry is deliberate: signing in with an account you do not have
    // fails harmlessly, and signing up with an address you already used does
    // not. When the page is ambiguous, take the cheap failure.
    const doc = page(`
      <form>
        <input type="email" name="email">
        <input type="password" name="password">
        <button type="submit">Continue</button>
      </form>`);
    expect(readGate(doc).gate).toBe('login');
  });

  it('reads a combined sign-in / create-account form as a login', () => {
    const doc = page(`
      <form>
        <a>Sign in</a><a>Create account</a>
        <input type="email"><input type="password">
      </form>`);
    expect(readGate(doc).gate).toBe('login');
  });

  it('reads a page that has emailed you as a confirmation wall', () => {
    const doc = page('<main><h1>Check your email</h1><p>We sent you a link.</p></main>');
    expect(readGate(doc).gate).toBe('confirm-email');
  });

  it('does not call a form a confirmation wall just because it mentions email', () => {
    // Plenty of live signup forms say "check your email" in the small print
    // under them. A password box on the page settles it.
    const doc = page(`
      <form>
        <input type="email"><input type="password">
        <p>After this we will send you a verification email.</p>
      </form>`);
    expect(readGate(doc).gate).toBe('login');
  });

  it('reads an ordinary application form as no gate at all', () => {
    const doc = page(`
      <form>
        <input name="first_name"><input type="email" name="email">
        <textarea name="cover_letter"></textarea>
      </form>`);
    expect(readGate(doc).gate).toBe('none');
  });

  it('ignores hidden password fields', () => {
    // Boards routinely ship a hidden password input on the application form
    // itself, which would otherwise read as a login wall on every page.
    const doc = page(`
      <form>
        <input type="hidden" name="password">
        <input name="first_name">
      </form>`);
    expect(readGate(doc).gate).toBe('none');
  });

  it('finds an email box that is not typed as one', () => {
    const doc = page('<form><input name="user_email"><input type="password"></form>');
    expect(readGate(doc).email!.name).toBe('user_email');
  });
});

describe('fillGate', () => {
  it('puts the same password in both boxes and reports what it did', () => {
    const doc = page(`
      <form>
        <input type="email"><input type="password" name="p">
        <input type="password" name="confirm_p">
      </form>`);
    const read = readGate(doc);
    const set = vi.fn((el: HTMLInputElement, v: string) => (el.value = v));

    const done = fillGate(read, { email: 'ada@example.com', password: 'hunter2' }, set);

    expect(done).toEqual(['email', 'password', 'confirm']);
    expect(read.password!.value).toBe('hunter2');
    expect(read.confirm!.value).toBe('hunter2');
  });

  it('never presses the button', () => {
    // Creating an account is a decision, not a side effect of reading a page.
    const doc = page('<form><input type="email"><input type="password"><button>Go</button></form>');
    const read = readGate(doc);
    const clicked = vi.fn();
    read.submit!.addEventListener('click', clicked);

    fillGate(read, { email: 'a@b.c', password: 'x' }, (el, v) => (el.value = v));
    expect(clicked).not.toHaveBeenCalled();
  });

  it('fills nothing when there is nothing to fill it with', () => {
    const doc = page('<form><input type="email"><input type="password"></form>');
    expect(fillGate(readGate(doc), { email: '', password: '' }, () => {})).toEqual([]);
  });
});
