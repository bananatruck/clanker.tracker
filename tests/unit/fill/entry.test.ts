import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationEntry, beginApplication } from '@/lib/fill/entry';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('application entry', () => {
  it('recognises only an enabled Workday posting action', () => {
    document.body.innerHTML = '<button data-automation-id="adventureButton">Apply</button>';
    expect(applicationEntry(document, 'workday')).not.toBeNull();
    expect(applicationEntry(document, 'generic')).toBeNull();
    document.querySelector('button')!.setAttribute('disabled', '');
    expect(applicationEntry(document, 'workday')).toBeNull();
  });

  it('opens Apply Manually without pressing a later action', async () => {
    document.body.innerHTML = `
      <button data-automation-id="adventureButton">Apply</button>
      <button data-automation-id="bottom-navigation-next-button">Next</button>
      <button type="submit">Submit</button>`;
    const entry = document.querySelector<HTMLElement>('[data-automation-id="adventureButton"]')!;
    const manualClicked = vi.fn();
    const nextClicked = vi.fn();
    const submitClicked = vi.fn((event: Event) => event.preventDefault());
    document.querySelector<HTMLElement>('[data-automation-id="bottom-navigation-next-button"]')!
      .addEventListener('click', nextClicked);
    document.querySelector<HTMLElement>('[type="submit"]')!
      .addEventListener('click', submitClicked);
    entry.addEventListener('click', () => {
      const manual = document.createElement('button');
      manual.dataset.automationId = 'applyManually';
      manual.textContent = 'Apply Manually';
      manual.addEventListener('click', manualClicked);
      document.body.append(manual);
    });

    await expect(beginApplication(document, 'workday')).resolves.toBe(true);
    expect(manualClicked).toHaveBeenCalledOnce();
    expect(nextClicked).not.toHaveBeenCalled();
    expect(submitClicked).not.toHaveBeenCalled();
  });
});
