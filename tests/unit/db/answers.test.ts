import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionAnswer } from '@/lib/db/schema';

const rows = vi.hoisted(() => new Map<string, QuestionAnswer>());

vi.mock('@/lib/db/schema', () => ({
  db: {
    questions: {
      clear: async () => rows.clear(),
      get: async (hash: string) => rows.get(hash),
      put: async (row: QuestionAnswer) => rows.set(row.hash, row),
      update: async (hash: string, patch: Partial<QuestionAnswer>) => {
        const row = rows.get(hash);
        if (row) rows.set(hash, { ...row, ...patch });
      },
      delete: async (hash: string) => rows.delete(hash),
      orderBy: () => ({
        reverse: () => ({
          toArray: async () => [...rows.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt),
        }),
      }),
    },
  },
}));
import {
  forgetRememberedAnswer,
  recallAnswer,
  rememberAnswer,
  rememberedAnswers,
  updateRememberedAnswer,
} from '@/lib/db/repo';

beforeEach(async () => {
  rows.clear();
});

describe('learned answer repository', () => {
  it('keeps scoped records separate and supports correction and deletion', async () => {
    await rememberAnswer('Company', 'Acme', 'greenhouse', {
      semanticPath: 'experience[0].company',
    });
    await rememberAnswer('Company', 'Globex', 'lever', {
      semanticPath: 'experience[1].company',
    });

    const rows = await rememberedAnswers();
    expect(rows).toHaveLength(2);
    const first = rows.find((row) => row.semanticPath === 'experience[0].company')!;
    await updateRememberedAnswer(first.hash, 'Acme Corporation');
    await expect(
      recallAnswer('Company', { semanticPath: 'experience[0].company' }),
    ).resolves.toMatchObject({ answer: 'Acme Corporation' });
    await expect(
      recallAnswer('Company', { semanticPath: 'experience[1].company' }),
    ).resolves.toMatchObject({ answer: 'Globex' });

    await forgetRememberedAnswer(first.hash);
    await expect(
      recallAnswer('Company', { semanticPath: 'experience[0].company' }),
    ).resolves.toBeUndefined();
  });
});
