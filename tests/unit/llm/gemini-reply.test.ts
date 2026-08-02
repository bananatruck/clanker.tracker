import { describe, it, expect } from 'vitest';
import { geminiText } from '@/lib/llm/providers';

/**
 * Gemini 3 models think by default, and those thoughts come back as parts in
 * the same array as the answer. Reading `parts[0].text` therefore returns
 * reasoning — or nothing — rather than the reply, which surfaced to the user
 * as "empty response" and looked like a rejected key.
 */
describe('reading a Gemini reply', () => {
  it('takes the answer, not the reasoning', () => {
    expect(
      geminiText([
        { text: 'Let me consider the schema...', thought: true },
        { text: '{"ok":"connected"}' },
      ]),
    ).toBe('{"ok":"connected"}');
  });

  it('joins an answer split across parts', () => {
    expect(geminiText([{ text: '{"ok":' }, { text: '"connected"}' }])).toBe(
      '{"ok":"connected"}',
    );
  });

  it('handles the ordinary single-part reply', () => {
    expect(geminiText([{ text: '{"ok":"connected"}' }])).toBe('{"ok":"connected"}');
  });

  it('returns empty when every part was reasoning', () => {
    expect(geminiText([{ text: 'thinking...', thought: true }])).toBe('');
  });

  it('survives parts with no text at all', () => {
    expect(geminiText([{}, { text: 'x' }])).toBe('x');
    expect(geminiText([])).toBe('');
  });
});
