/**
 * The order of an application, asserted here rather than clicked through on a
 * job board. Two of these edges are the difference between a tool that helps
 * and a tool that sends a worse application than you would have.
 */
import { describe, expect, it } from 'vitest';
import { canProceed, initialFlow, nextStage, stageMessage, stepsFor, type FlowState } from '@/lib/fill/stage';

const flow = (over: Partial<FlowState> = {}): FlowState => ({ ...initialFlow(), ...over });

describe('nextStage', () => {
  it('goes straight to filling when there is no wall', () => {
    expect(nextStage(flow())).toBe('filling');
  });

  it('makes the account first when there is a wall and permission', () => {
    expect(
      nextStage(flow({ gate: 'signup', hasCredentials: true, autoAccount: true })),
    ).toBe('account');
  });

  it('blocks rather than half-filling a form behind a login it cannot pass', () => {
    expect(nextStage(flow({ gate: 'login', hasCredentials: false }))).toBe('blocked');
    expect(nextStage(flow({ gate: 'login', hasCredentials: true, autoAccount: false }))).toBe(
      'blocked',
    );
  });

  it('lets a confirmation wall outrank everything', () => {
    // Nothing on a page waiting for you to click a link in your inbox can be
    // advanced by filling it in, and hammering the form behind it is how an
    // address gets rate-limited.
    const state = flow({
      gate: 'confirm-email',
      hasCredentials: true,
      autoAccount: true,
      filled: true,
      confirmed: true,
    });
    expect(nextStage(state)).toBe('confirm-email');
  });

  it('will not offer to send while fields were handed back', () => {
    // The resolver refusing to invent a salary expectation is it working.
    // Submitting over that empty box throws the refusal away.
    const state = flow({ filled: true, needsYou: 2 });
    expect(nextStage(state)).toBe('blocked');
    expect(stageMessage(state)).toMatch(/2 fields need you/);
  });

  it('asks for the letter before it asks for the send', () => {
    const state = flow({ filled: true, wantsLetter: true });
    expect(nextStage(state)).toBe('letter');
    expect(nextStage({ ...state, letterReady: true })).toBe('ready');
  });

  it('waits on the confirmation even when everything is in', () => {
    expect(nextStage(flow({ filled: true }))).toBe('ready');
    expect(nextStage(flow({ filled: true, confirmed: true }))).toBe('done');
  });

  it('is done once it is logged, whatever else is true', () => {
    expect(nextStage(flow({ logged: true, gate: 'signup' }))).toBe('done');
  });
});

describe('canProceed', () => {
  it('is true only for the steps the tool can take by itself', () => {
    expect(canProceed(flow())).toBe(true);
    expect(canProceed(flow({ gate: 'confirm-email' }))).toBe(false);
    expect(canProceed(flow({ filled: true }))).toBe(false); // waiting on a yes
    expect(canProceed(flow({ filled: true, needsYou: 1 }))).toBe(false);
  });
});

describe('stepsFor', () => {
  it('shows only the steps this application actually has', () => {
    // A rail with a permanently greyed row on it teaches people to ignore it.
    const labels = stepsFor(flow()).map((s) => s.label);
    expect(labels).toEqual(['Fill', 'Confirm', 'Sent']);

    const withWall = stepsFor(flow({ gate: 'signup', wantsLetter: true })).map((s) => s.label);
    expect(withWall).toEqual(['Account', 'Fill', 'Cover letter', 'Confirm', 'Sent']);
  });

  it('marks everything before the current step as done', () => {
    const steps = stepsFor(flow({ gate: 'signup', accountDone: true, filled: true }));
    expect(steps.find((s) => s.label === 'Account')!.done).toBe(true);
    expect(steps.find((s) => s.label === 'Fill')!.done).toBe(true);
    expect(steps.find((s) => s.label === 'Sent')!.done).toBe(false);
  });
});

describe('stageMessage', () => {
  it('explains a confirmation wall as something only the user can clear', () => {
    expect(stageMessage(flow({ gate: 'confirm-email' }))).toMatch(/click it/i);
  });

  it('says which setting is missing rather than just refusing', () => {
    expect(stageMessage(flow({ gate: 'signup' }))).toMatch(/no sign-in details saved/i);
    expect(stageMessage(flow({ gate: 'signup', hasCredentials: true }))).toMatch(
      /automatic sign-up/i,
    );
  });
});
