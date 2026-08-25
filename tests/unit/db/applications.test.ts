import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application, ApplicationEvent, DeedRecord } from '@/lib/db/schema';

const state = vi.hoisted(() => ({
  applications: new Map<string, Application>(),
  events: [] as ApplicationEvent[],
  deeds: [] as DeedRecord[],
}));

vi.mock('@/lib/db/schema', () => {
  const applications = {
    get: async (id: string) => state.applications.get(id),
    put: async (app: Application) => state.applications.set(app.id, app),
    update: async (id: string, patch: Partial<Application>) => {
      const app = state.applications.get(id);
      if (app) state.applications.set(id, { ...app, ...patch });
    },
    where: (field: keyof Application) => ({
      equals: (value: unknown) => ({
        first: async () => [...state.applications.values()].find((app) => app[field] === value),
      }),
    }),
  };
  const applicationEvents = {
    add: async (event: ApplicationEvent) => state.events.push({ ...event, id: state.events.length + 1 }),
  };
  const deeds = {
    add: async (deed: DeedRecord) => state.deeds.push(deed),
    where: () => ({
      equals: (applicationId: string) => ({
        toArray: async () => state.deeds.filter((deed) => deed.applicationId === applicationId),
      }),
    }),
  };
  return {
    db: {
      applications,
      applicationEvents,
      deeds,
      transaction: async (...args: unknown[]) => {
        const work = args.at(-1) as () => Promise<unknown>;
        return work();
      },
    },
  };
});

import { logApplication, trackApplication } from '@/lib/db/repo';

beforeEach(() => {
  state.applications.clear();
  state.events.length = 0;
  state.deeds.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-20T12:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('automated tracker upserts', () => {
  it('deduplicates visits, advances lifecycle, and banks submission once', async () => {
    const saved = await trackApplication({
      company: 'Acme', role: 'Engineer',
      url: 'https://jobs.test/42?utm_source=email', ats: 'greenhouse', status: 'saved',
    });
    const started = await trackApplication({
      company: '', role: '', url: 'https://jobs.test/42', ats: 'greenhouse', status: 'started',
    });
    expect(started.id).toBe(saved.id);
    expect(state.applications.size).toBe(1);
    expect(started.appliedAt).toBeNull();

    const applied = await logApplication({
      company: 'Acme', role: 'Engineer', url: 'https://jobs.test/42#apply',
      ats: 'greenhouse', source: 'autofill', llmCalls: 0,
    });
    expect(applied.id).toBe(saved.id);
    expect(applied.status).toBe('applied');
    expect(applied.appliedAt).not.toBeNull();
    expect(state.deeds.map((deed) => deed.deed)).toEqual(['application']);
    expect(state.events.map((event) => event.kind)).toEqual(['created', 'status', 'submitted']);

    await logApplication({
      company: 'Acme', role: 'Engineer', url: 'https://jobs.test/42', ats: 'greenhouse',
    });
    expect(state.applications.size).toBe(1);
    expect(state.deeds).toHaveLength(1);
  });

  it('repairs a missing deed when a prior application write only partly completed', async () => {
    const applied = await logApplication({
      company: 'Acme', role: 'Engineer', url: 'https://jobs.test/42', ats: 'greenhouse',
    });
    state.deeds.length = 0;

    await logApplication({
      company: 'Acme', role: 'Engineer', url: 'https://jobs.test/42', ats: 'greenhouse',
    });

    expect(state.applications.get(applied.id)?.status).toBe('applied');
    expect(state.deeds.map((deed) => deed.deed)).toEqual(['application']);
  });
});
