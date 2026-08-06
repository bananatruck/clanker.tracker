/**
 * On-demand injection is what makes the tool work on a careers page nobody
 * wrote an adapter for, so the two decisions it makes — is this page even
 * injectable, and which frame holds the form — are worth pinning down.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bestFormFrame, refuseReason } from '@/lib/fill/inject';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refuseReason', () => {
  it('allows an ordinary job application page', () => {
    expect(refuseReason('https://boards.greenhouse.io/acme/jobs/123')).toBeNull();
    expect(refuseReason('https://careers.example.com/apply')).toBeNull();
  });

  it('explains browser pages rather than failing opaquely', () => {
    expect(refuseReason('chrome://extensions')).toMatch(/browser pages/i);
    expect(refuseReason('about:blank')).toMatch(/browser pages/i);
    expect(refuseReason('devtools://devtools/bundled/inspector.html')).toMatch(/browser pages/i);
  });

  it('names the Web Store specifically, since Chrome blocks it separately', () => {
    expect(refuseReason('https://chromewebstore.google.com/detail/abc')).toMatch(/Web Store/i);
  });

  it('tells the user which setting unblocks a local file', () => {
    expect(refuseReason('file:///home/kesh/application.html')).toMatch(/file URLs/i);
  });

  it('treats a tab with no URL yet as still loading', () => {
    expect(refuseReason(undefined)).toMatch(/loading/i);
  });
});

describe('bestFormFrame', () => {
  const stubScripting = (results: Array<{ frameId: number; result: unknown }>) => {
    vi.stubGlobal('chrome', {
      scripting: { executeScript: vi.fn().mockResolvedValue(results) },
    });
  };

  it('picks the frame with the most fields, not the top frame', async () => {
    // The shape of an embedded Greenhouse form: the wrapper page has a search
    // box, the iframe has the actual application.
    stubScripting([
      { frameId: 0, result: 1 },
      { frameId: 7, result: 24 },
    ]);
    expect(await bestFormFrame(1)).toBe(7);
  });

  it('stays on the top frame for an ordinary single-frame page', async () => {
    stubScripting([{ frameId: 0, result: 12 }]);
    expect(await bestFormFrame(1)).toBe(0);
  });

  it('ignores frames that returned nothing countable', async () => {
    stubScripting([
      { frameId: 0, result: undefined },
      { frameId: 3, result: 5 },
    ]);
    expect(await bestFormFrame(1)).toBe(3);
  });

  it('falls back to the top frame when the count cannot be taken', async () => {
    vi.stubGlobal('chrome', {
      scripting: { executeScript: vi.fn().mockRejectedValue(new Error('no access')) },
    });
    expect(await bestFormFrame(1)).toBe(0);
  });

  it('returns the top frame when no frame has a field at all', async () => {
    stubScripting([
      { frameId: 0, result: 0 },
      { frameId: 4, result: 0 },
    ]);
    expect(await bestFormFrame(1)).toBe(0);
  });
});
