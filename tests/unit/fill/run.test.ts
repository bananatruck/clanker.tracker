import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runFill } from '@/lib/fill/run';
import { emptyPreferences } from '@/lib/fill/types';
import { emptyContact, PRIMARY_PROFILE_ID, type ResumeProfile } from '@/types/profile';

const profile = (): ResumeProfile => ({
  id: PRIMARY_PROFILE_ID,
  contact: emptyContact(),
  experience: [],
  education: [],
  projects: [],
  skills: [],
  rawText: '',
  source: { fileName: 'ada-resume.pdf', kind: 'pdf', bytes: 3 },
  parsedAt: 0,
  updatedAt: 0,
});

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('reviewed file attachment', () => {
  it('shows the retained file read-only and attaches its exact bytes after approval', async () => {
    document.body.innerHTML = `
      <form aria-label="Application">
        <label>Resume<input name="resume" type="file" required /></label>
      </form>`;
    const remember = vi.fn(async () => {});
    const record = vi.fn(async () => {});

    const running = runFill(
      { profile: profile(), preferences: emptyPreferences() },
      {
        memory: { recall: async () => null },
        remember,
        record,
        resumeDocument: {
          id: 'primary-resume',
          kind: 'resume',
          fileName: 'ada-resume.pdf',
          mimeType: 'application/pdf',
          size: 3,
          bytes: new Uint8Array([1, 2, 3]).buffer,
          updatedAt: 1,
        },
      },
    );

    await vi.waitFor(() => {
      expect(document.querySelector('[data-clanker-overlay]')).not.toBeNull();
    });
    const overlay = document.querySelector<HTMLElement>('[data-clanker-overlay]')!;
    const reviewInput = overlay.shadowRoot!.querySelector<HTMLInputElement>('input')!;
    expect(reviewInput.value).toBe('ada-resume.pdf');
    expect(reviewInput.readOnly).toBe(true);
    overlay.shadowRoot!.querySelector<HTMLButtonElement>('[data-act="apply"]')!.click();

    const outcome = await running;
    const file = document.querySelector<HTMLInputElement>('input[type="file"]')!.files?.[0];
    expect(file?.name).toBe('ada-resume.pdf');
    await expect(file?.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(outcome).toMatchObject({ filled: 1, skipped: 0, cancelled: false });
    expect(outcome.run.unfilledRequired).toBe(0);
    expect(remember).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledOnce();
  });

  it('does not offer unrelated upload controls or invent a file when none was retained', async () => {
    document.body.innerHTML = `
      <form aria-label="Application"><label>Portfolio image<input type="file" /></label></form>`;

    const running = runFill(
      { profile: profile(), preferences: emptyPreferences() },
      {
        memory: { recall: async () => null },
        remember: async () => {},
        record: async () => {},
        resumeDocument: null,
      },
    );
    await vi.waitFor(() => {
      expect(document.querySelector('[data-clanker-overlay]')).not.toBeNull();
    });
    const overlay = document.querySelector<HTMLElement>('[data-clanker-overlay]')!;
    expect(overlay.shadowRoot!.querySelectorAll('.row')).toHaveLength(0);
    overlay.shadowRoot!.querySelector<HTMLButtonElement>('[data-act="cancel"]')!.click();

    await expect(running).resolves.toMatchObject({ cancelled: true, filled: 0 });
    expect(document.querySelector<HTMLInputElement>('input[type="file"]')!.files).toHaveLength(0);
  });
});
