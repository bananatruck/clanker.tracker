import { describe, expect, it } from 'vitest';
import { BOSSES, crusadeFoe, encounterFor } from '@/lib/game/atlas';

describe('Crusade art progression', () => {
  it('uses application-difficulty encounters before Act V', () => {
    expect(crusadeFoe(49, 5)).toBe(encounterFor(5));
  });

  it('uses every installed boss sheet through Act V and the Citadel', () => {
    expect(crusadeFoe(50, 0)).toBe(BOSSES.malroth);
    expect(crusadeFoe(57, 0)).toBe(BOSSES.zoma);
    expect(crusadeFoe(60, 0)).toBe(BOSSES.calasmalroth);
  });
});
