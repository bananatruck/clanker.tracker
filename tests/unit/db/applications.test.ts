import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Application,
  ApplicationEvent,
  ApplicationSession,
  DeedRecord,
} from '@/lib/db/schema';

const state = vi.hoisted(() => ({
  applications: new Map<string, Application>(),
  events: [] as ApplicationEvent[],
  deeds: [] as DeedRecord[],
  sessions: new Map<string, ApplicationSession>(),
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
  const applicationSessions = {
    get: async (id: string) => state.sessions.get(id),
    put: async (session: ApplicationSession) => state.sessions.set(session.id, session),
    delete: async (id: string) => state.sessions.delete(id),
  };
  return {
    db: {
      applications,
      applicationEvents,
      applicationSessions,
      deeds,
      transaction: async (...args: unknown[]) => {
        const work = args.at(-1) as () => Promise<unknown>;
        return work();
      },
    },
  };
});

import {
  confirmApplicationSession,
  logApplication,
  trackApplication,
  updateApplication,
} from '@/lib/db/repo';

beforeEach(() => {
  state.applications.clear();
  state.events.length = 0;
  state.deeds.length = 0;
  state.sessions.clear();
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

  it('confirms the original tracked job after the ATS redirects to another route', async () => {
    const started = await trackApplication({
      company: 'Acme', role: 'Engineer',
      url: 'https://jobs.test/job/42', ats: 'workday', status: 'started',
    });
    state.sessions.set('tab-7', {
      id: 'tab-7', tabId: 7, ats: 'workday',
      jobUrl: 'https://jobs.test/job/42',
      scanId: 'scan-42',
      url: 'https://jobs.test/apply/confirmation',
      pageKey: 'confirmation', step: 3, completedPaths: [],
      llmCalls: 2, status: 'review', updatedAt: Date.now(),
    });

    const confirmed = await confirmApplicationSession(7);

    expect(confirmed?.id).toBe(started.id);
    expect(confirmed).toMatchObject({ status: 'applied', llmCalls: 2, scanId: 'scan-42' });
    expect(state.applications.size).toBe(1);
    expect(state.sessions.get('tab-7')?.status).toBe('complete');
  });

  it('records a follow-up event when an action or reminder changes', async () => {
    const tracked = await trackApplication({
      company: 'Acme', role: 'Engineer', url: 'https://jobs.test/42', ats: 'greenhouse',
    });

    await updateApplication(tracked.id, {
      nextAction: 'Email recruiter',
      nextActionAt: Date.now() + 86_400_000,
    });

    expect(state.applications.get(tracked.id)).toMatchObject({
      nextAction: 'Email recruiter',
    });
    expect(state.events.at(-1)?.kind).toBe('follow-up');
  });

  it('merges a text-only saved row when its posting URL becomes known', async () => {
    const manual = await trackApplication({
      company: 'Acme', role: 'Engineer', url: '', ats: 'generic', status: 'saved',
    });
    const detected = await trackApplication({
      company: 'Acme', role: 'Engineer',
      url: 'https://jobs.test/42', ats: 'greenhouse', status: 'saved',
    });

    expect(detected.id).toBe(manual.id);
    expect(detected.url).toBe('https://jobs.test/42');
    expect(state.applications.size).toBe(1);
  });
});
