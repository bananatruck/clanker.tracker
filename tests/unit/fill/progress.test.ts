/**
 * The checklist is the only place a user can check the tool's central claim —
 * that it answers what it can and hands back what it cannot rather than
 * inventing it. So the counting behind it has to be exact, and "filled" must
 * never be able to include a field nothing was written into.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanSweep,
  filledCount,
  needsYouCount,
  onProgress,
  PROGRESS_MESSAGE,
  reportProgress,
  type FieldProgress,
  type FillProgress,
} from '@/lib/fill/progress';

const field = (over: Partial<FieldProgress> = {}): FieldProgress => ({
  id: 'f1',
  label: 'First name',
  required: true,
  state: 'filled',
  value: 'Ada',
  tier: 1,
  ...over,
});

const progressOf = (fields: FieldProgress[]): FillProgress => ({
  phase: 'writing',
  ats: 'greenhouse',
  fields,
  llmCalls: 0,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('counting', () => {
  it('counts only fields something was actually written into', () => {
    const fields = [
      field({ id: 'a' }),
      field({ id: 'b' }),
      field({ id: 'c', state: 'needs-you', value: '', tier: null }),
      field({ id: 'd', state: 'pending' }),
    ];
    expect(filledCount(fields)).toBe(2);
    expect(needsYouCount(fields)).toBe(1);
  });

  it('does not call a run clean until every field is filled', () => {
    // A row still pending is a run in progress, not a finished perfect one —
    // and showing "every field answered" mid-run would be a lie that corrects
    // itself, which is worse than saying nothing.
    expect(cleanSweep([field(), field({ id: 'b', state: 'pending' })])).toBe(false);
    expect(cleanSweep([field(), field({ id: 'b' })])).toBe(true);
  });

  it('does not call an empty run a clean sweep', () => {
    // A form with nothing to fill has not been swept; it has not been fought.
    expect(cleanSweep([])).toBe(false);
  });
});

describe('reporting', () => {
  it('broadcasts the whole checklist rather than a delta', () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const progress = progressOf([field()]);
    reportProgress(progress);

    expect(sendMessage).toHaveBeenCalledWith({ type: PROGRESS_MESSAGE, progress });
  });

  it('survives nobody listening', () => {
    // The panel being closed is the ordinary case. A fill that throws because
    // its progress report found no receiver is a fill broken by its own HUD.
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockRejectedValue(new Error('Receiving end does not exist')),
      },
    });
    expect(() => reportProgress(progressOf([]))).not.toThrow();
  });

  it('survives there being no chrome at all', () => {
    vi.stubGlobal('chrome', undefined);
    expect(() => reportProgress(progressOf([]))).not.toThrow();
  });
});

describe('listening', () => {
  it('passes on progress messages and ignores everything else', () => {
    const listeners: Array<(m: unknown) => void> = [];
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: (l: (m: unknown) => void) => listeners.push(l),
          removeListener: (l: (m: unknown) => void) =>
            listeners.splice(listeners.indexOf(l), 1),
        },
      },
    });

    const seen: FillProgress[] = [];
    const stop = onProgress((p) => seen.push(p));

    const progress = progressOf([field()]);
    // The extension's own database proxy uses this same channel, so anything
    // that is not ours has to fall straight through.
    listeners[0]!({ type: 'db:getProfile' });
    listeners[0]!(null);
    listeners[0]!({ type: PROGRESS_MESSAGE, progress });

    expect(seen).toEqual([progress]);

    stop();
    expect(listeners).toHaveLength(0);
  });
});
