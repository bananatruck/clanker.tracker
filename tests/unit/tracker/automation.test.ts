import { describe, expect, it, vi } from 'vitest';
import {
  TrackingSignalGate,
  trackedJobForPage,
} from '@/lib/tracker/automation';

const context = {
  ats: 'greenhouse' as const,
  host: 'boards.greenhouse.io',
  title: 'Fallback Engineer | Greenhouse',
  url: 'https://boards.greenhouse.io/acme/jobs/42?utm_source=mail',
};

describe('automatic tracker signals', () => {
  it('uses structured posting data when a job is detected', () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'Staff Engineer',
      hiringOrganization: { name: 'Acme' },
      description: `<p>${'Build reliable systems. '.repeat(12)}</p>`,
    })}</script>`;

    expect(trackedJobForPage(document, context, 'saved')).toMatchObject({
      company: 'Acme',
      role: 'Staff Engineer',
      status: 'saved',
      source: 'detected',
      url: context.url,
    });
  });

  it('does not save a listing page that has no extractable posting', () => {
    document.head.innerHTML = '<title>Search jobs</title>';
    document.body.innerHTML = '<main>Open roles</main>';

    expect(trackedJobForPage(document, context, 'saved')).toBeNull();
  });

  it('can mark an explicitly started application even when the description is gone', () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<form><input name="first_name"></form>';

    expect(trackedJobForPage(document, context, 'started')).toMatchObject({
      company: 'Acme',
      role: 'Fallback Engineer',
      status: 'started',
      source: 'autofill',
    });
  });

  it('emits each phase once per canonical posting and permits an advance', async () => {
    const gate = new TrackingSignalGate();
    const writer = vi.fn(async () => undefined);
    const saved = trackedJobForPage(document, context, 'started')!;
    const duplicate = {
      ...saved,
      status: 'saved' as const,
      url: 'https://boards.greenhouse.io/acme/jobs/42#apply',
    };

    expect(await gate.emit(duplicate, writer)).toBe(true);
    expect(await gate.emit(duplicate, writer)).toBe(false);
    expect(await gate.emit(saved, writer)).toBe(true);
    expect(writer).toHaveBeenCalledTimes(2);
  });

  it('retries a failed background write', async () => {
    const gate = new TrackingSignalGate();
    const job = trackedJobForPage(document, context, 'started')!;
    const writer = vi.fn()
      .mockRejectedValueOnce(new Error('worker asleep'))
      .mockResolvedValueOnce(undefined);

    await expect(gate.emit(job, writer)).rejects.toThrow('worker asleep');
    await expect(gate.emit(job, writer)).resolves.toBe(true);
    expect(writer).toHaveBeenCalledTimes(2);
  });
});
