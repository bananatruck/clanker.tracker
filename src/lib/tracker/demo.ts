/**
 * A seeded crusade, for screenshots and for trying the tracker before you have
 * sent anything.
 *
 * This exists because the honest empty state — and the empty state *is* the
 * honest one, since every row has to be earned — shows nothing of what the
 * board does. Rather than draw a mockup that can drift from the code, the
 * demo seeds the real database and the real UI renders it. If a screenshot in
 * the README looks wrong, the app is wrong.
 *
 * Reached only via `sidepanel.html#/demo`, and it refuses to touch a database
 * that already has applications in it.
 */
import { db } from '@/lib/db/schema';
import type { Application, ApplicationStatus } from '@/lib/db/schema';
import { logApplication, setApplicationStatus } from '@/lib/db/repo';

const DAY = 24 * 60 * 60 * 1000;

/**
 * A plausible six weeks: mostly silence, a handful of OAs, two interviews,
 * one offer. Deliberately not a flattering funnel — a demo that shows a 40%
 * response rate would be lying about the job hunt.
 */
interface SeedRow {
  company: string;
  role: string;
  ats: Application['ats'];
  /**
   * The stages this application actually passed through, in order. Written
   * out rather than inferred from the final status, because the funnel is not
   * a ladder: two of these got an interview with no OA at all, which is what
   * most hiring processes actually do.
   */
  path: readonly ApplicationStatus[];
  daysAgo: number;
  /** Days since the last thing that happened. Drives the "quiet" flag. */
  quietFor: number;
  llmCalls: number;
}

const SEED: readonly SeedRow[] = [
  { company: 'Hexweave', role: 'Senior Backend Engineer', ats: 'greenhouse', path: ['oa', 'interview', 'offer'], daysAgo: 34, quietFor: 1, llmCalls: 0 },
  { company: 'Northwind Labs', role: 'Platform Engineer', ats: 'lever', path: ['interview'], daysAgo: 27, quietFor: 3, llmCalls: 0 },
  { company: 'Palewell', role: 'Infrastructure Engineer', ats: 'ashby', path: ['oa', 'interview'], daysAgo: 19, quietFor: 2, llmCalls: 1 },
  { company: 'Cindershore', role: 'Backend Engineer II', ats: 'greenhouse', path: ['oa'], daysAgo: 16, quietFor: 5, llmCalls: 0 },
  { company: 'Vantis', role: 'Software Engineer, Data', ats: 'workable', path: ['oa'], daysAgo: 12, quietFor: 4, llmCalls: 0 },
  { company: 'Orrery', role: 'Full Stack Engineer', ats: 'greenhouse', path: ['oa', 'rejected'], daysAgo: 30, quietFor: 8, llmCalls: 0 },
  { company: 'Bellhollow', role: 'Site Reliability Engineer', ats: 'lever', path: ['rejected'], daysAgo: 22, quietFor: 11, llmCalls: 2 },
  { company: 'Marrowgate', role: 'Backend Engineer', ats: 'ashby', path: ['ghosted'], daysAgo: 41, quietFor: 41, llmCalls: 0 },
  { company: 'Quillon', role: 'Systems Engineer', ats: 'workday', path: [], daysAgo: 38, quietFor: 38, llmCalls: 3 },
  { company: 'Ashgrove', role: 'Senior Software Engineer', ats: 'greenhouse', path: [], daysAgo: 9, quietFor: 9, llmCalls: 0 },
  { company: 'Thistledown', role: 'Engineer, Developer Tools', ats: 'lever', path: [], daysAgo: 6, quietFor: 6, llmCalls: 0 },
  { company: 'Fenmoor', role: 'Backend Engineer', ats: 'ashby', path: [], daysAgo: 4, quietFor: 4, llmCalls: 0 },
  { company: 'Kestrel Systems', role: 'Platform Engineer', ats: 'greenhouse', path: [], daysAgo: 2, quietFor: 2, llmCalls: 0 },
  { company: 'Downwarden', role: 'Software Engineer', ats: 'workable', path: [], daysAgo: 1, quietFor: 1, llmCalls: 0 },
];

export async function seedDemoData(now = Date.now()): Promise<void> {
  if ((await db.applications.count()) > 0) return;

  for (const row of SEED) {
    // Go through the real repo functions rather than writing rows directly, so
    // the seeded ledger is one a user could actually have earned — every deed
    // banked by the same once-only path a real status change takes.
    const app = await logApplication({
      company: row.company,
      role: row.role,
      url: `https://${row.company.toLowerCase().replace(/\s+/g, '')}.example/jobs/1`,
      ats: row.ats,
      scanId: null,
      notes: '',
      llmCalls: row.llmCalls,
      appliedAt: now - row.daysAgo * DAY,
    });

    for (const status of row.path) await setApplicationStatus(app.id, status);

    // The repo stamps `updatedAt` as it goes, which is correct for a live move
    // and wrong for a history being backfilled. Restate both clocks so the
    // ghost threshold sees the timeline this application actually had.
    await db.applications.update(app.id, {
      appliedAt: now - row.daysAgo * DAY,
      updatedAt: now - row.quietFor * DAY,
    });
  }
}
