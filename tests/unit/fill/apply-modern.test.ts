import { beforeEach, describe, expect, it } from 'vitest';
import { applyAnswer } from '@/lib/fill/apply';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('modern form writers', () => {
  it('writes and announces contenteditable text', async () => {
    document.body.innerHTML = '<div role="textbox" contenteditable="true"></div>';
    const editor = document.querySelector<HTMLElement>('[role="textbox"]')!;
    const events: string[] = [];
    editor.addEventListener('input', () => events.push('input'));
    editor.addEventListener('change', () => events.push('change'));

    await expect(applyAnswer(editor, 'Built the engine')).resolves.toMatchObject({ ok: true });
    expect(editor.textContent).toBe('Built the engine');
    expect(events).toEqual(['input', 'change']);
  });

  it('opens an ARIA combobox and selects the matching option', async () => {
    document.body.innerHTML = `
      <button role="combobox" aria-controls="countries"></button>
      <div id="countries" role="listbox">
        <button role="option" data-value="gb">United Kingdom</button>
      </div>`;
    const combo = document.querySelector<HTMLElement>('[role="combobox"]')!;
    const option = document.querySelector<HTMLElement>('[role="option"]')!;
    let selected = false;
    option.addEventListener('click', () => { selected = true; });

    await expect(applyAnswer(combo, 'United Kingdom')).resolves.toMatchObject({
      ok: true,
      applied: 'United Kingdom',
    });
    expect(selected).toBe(true);
  });

  it('selects ARIA radio and switch controls through their click behavior', async () => {
    document.body.innerHTML = `
      <div role="radiogroup">
        <button role="radio" aria-checked="false" data-value="yes">Yes</button>
        <button role="radio" aria-checked="false" data-value="no">No</button>
      </div>
      <button role="switch" aria-checked="false"></button>`;
    const group = document.querySelector<HTMLElement>('[role="radiogroup"]')!;
    const yes = group.querySelector<HTMLElement>('[data-value="yes"]')!;
    yes.addEventListener('click', () => yes.setAttribute('aria-checked', 'true'));
    const toggle = document.querySelector<HTMLElement>('[role="switch"]')!;
    toggle.addEventListener('click', () => toggle.setAttribute('aria-checked', 'true'));

    await expect(applyAnswer(group, 'Yes', [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ])).resolves.toMatchObject({ ok: true, applied: 'yes' });
    await expect(applyAnswer(toggle, 'Yes')).resolves.toMatchObject({ ok: true });
    expect(yes.getAttribute('aria-checked')).toBe('true');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('reports a controlled input that reverts twice instead of claiming success', async () => {
    document.body.innerHTML = '<input type="email">';
    const input = document.querySelector<HTMLInputElement>('input')!;
    input.addEventListener('input', () => setTimeout(() => { input.value = ''; }, 0));

    await expect(applyAnswer(input, 'ada@example.com')).resolves.toMatchObject({
      ok: false,
      reason: 'reverted',
    });
  });

  it('finds a combobox list inside the same open shadow root', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <button role="combobox" aria-controls="choices"></button>
      <div id="choices" role="listbox"><button role="option">Remote</button></div>`;
    const combo = root.querySelector<HTMLElement>('[role="combobox"]')!;
    const option = root.querySelector<HTMLElement>('[role="option"]')!;
    let selected = false;
    option.addEventListener('click', () => { selected = true; });

    await expect(applyAnswer(combo, 'Remote')).resolves.toMatchObject({ ok: true });
    expect(selected).toBe(true);
  });
});
