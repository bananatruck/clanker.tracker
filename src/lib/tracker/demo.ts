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
import {
  addWritingSample,
  logApplication,
  recordDeed,
  saveProfile,
  saveScan,
  setApplicationStatus,
} from '@/lib/db/repo';
import { isComplete } from '@/lib/tracker/table';
import { parseResume } from '@/lib/resume/parse';
import { scanJobDescription } from '@/lib/ats/evidence';

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

  /**
   * The four researched columns, filled the way a real board fills them: the
   * live ones fully, the dead ones barely, and the salary in whatever notation
   * the posting happened to use. A demo where every row is complete would show
   * a rollup footer that never has to cope with a gap, which is the only state
   * the footer will ever actually be in.
   */
  salary?: string;
  nextAction?: string;
  website?: string;
  contact?: string;
}

const SEED: readonly SeedRow[] = [
  { company: 'Hexweave', role: 'Senior Backend Engineer', ats: 'greenhouse', path: ['oa', 'interview', 'offer'], daysAgo: 34, quietFor: 1, llmCalls: 0,
    salary: '£95k–£115k', nextAction: 'Sign by Fri — ask about equity refresh', website: 'hexweave.example', contact: 'Priya Raman, talent' },
  { company: 'Northwind Labs', role: 'Platform Engineer', ats: 'lever', path: ['interview'], daysAgo: 27, quietFor: 3, llmCalls: 0,
    salary: '£105,000', nextAction: 'Systems design round Thu 2pm', website: 'northwindlabs.example', contact: 'Tom Halloway' },
  { company: 'Palewell', role: 'Infrastructure Engineer', ats: 'ashby', path: ['oa', 'interview'], daysAgo: 19, quietFor: 2, llmCalls: 1,
    salary: '90-110k', nextAction: 'Send the Terraform writeup they asked for', website: 'palewell.example', contact: 'recruiting@palewell.example' },
  { company: 'Cindershore', role: 'Backend Engineer II', ats: 'greenhouse', path: ['oa'], daysAgo: 16, quietFor: 5, llmCalls: 0,
    salary: '£78k', nextAction: 'OA closes Sunday', website: 'cindershore.example' },
  { company: 'Vantis', role: 'Software Engineer, Data', ats: 'workable', path: ['oa'], daysAgo: 12, quietFor: 4, llmCalls: 0,
    salary: 'competitive', nextAction: 'Chase — no OA link yet', contact: 'Dee Okonkwo' },
  { company: 'Orrery', role: 'Full Stack Engineer', ats: 'greenhouse', path: ['oa', 'rejected'], daysAgo: 30, quietFor: 8, llmCalls: 0,
    salary: '£70k–£85k', website: 'orrery.example' },
  { company: 'Bellhollow', role: 'Site Reliability Engineer', ats: 'lever', path: ['rejected'], daysAgo: 22, quietFor: 11, llmCalls: 2 },
  { company: 'Marrowgate', role: 'Backend Engineer', ats: 'ashby', path: ['ghosted'], daysAgo: 41, quietFor: 41, llmCalls: 0,
    nextAction: 'Write off' },
  { company: 'Quillon', role: 'Systems Engineer', ats: 'workday', path: [], daysAgo: 38, quietFor: 38, llmCalls: 3 },
  { company: 'Ashgrove', role: 'Senior Software Engineer', ats: 'greenhouse', path: [], daysAgo: 9, quietFor: 9, llmCalls: 0,
    salary: '£120k + equity', nextAction: 'Follow up with Marta', website: 'ashgrove.example', contact: 'Marta Vieira, eng manager' },
  { company: 'Thistledown', role: 'Engineer, Developer Tools', ats: 'lever', path: [], daysAgo: 6, quietFor: 6, llmCalls: 0,
    salary: '£88k', website: 'thistledown.example' },
  { company: 'Fenmoor', role: 'Backend Engineer', ats: 'ashby', path: [], daysAgo: 4, quietFor: 4, llmCalls: 0,
    nextAction: 'Ask about the on-call rota' },
  { company: 'Kestrel Systems', role: 'Platform Engineer', ats: 'greenhouse', path: [], daysAgo: 2, quietFor: 2, llmCalls: 0,
    salary: '£450/day', website: 'kestrelsystems.example' },
  { company: 'Downwarden', role: 'Software Engineer', ats: 'workable', path: [], daysAgo: 1, quietFor: 1, llmCalls: 0 },
];

/**
 * A resume, as text.
 *
 * Put through the real parser rather than hand-written as a `ResumeProfile`,
 * for the same reason the applications go through the real repo: a demo
 * profile assembled by hand would show contact fields at confidences the
 * parser never actually produces, and the review grid's colours would be
 * decoration instead of a claim about the parse.
 */
const RESUME = `Ada Okafor
ada.okafor@example.com · +44 7700 900412 · London, UK
linkedin.com/in/adaokafor · github.com/adaokafor

EXPERIENCE

Staff Engineer, Payments — Cindermill
London · Mar 2021 – Present
- Rebuilt the settlement pipeline in Go, cutting end-of-day close from 40 minutes to 6
- Designed the double-entry ledger schema in PostgreSQL now backing £2bn of annual volume
- Ran the on-call rotation for 14 services and drove page volume down 70% in two quarters
- Mentored four engineers, two of whom now own services outright

Senior Backend Engineer — Halberd Systems
London · Jun 2018 – Feb 2021
- Migrated a monolith to event-driven services on Kafka without a maintenance window
- Introduced Terraform for all production infrastructure, replacing hand-built environments
- Cut p99 checkout latency from 1.9s to 340ms by reworking the pricing cache

Backend Engineer — Trellis Labs
Manchester · Sep 2016 – May 2018
- Built the internal reporting API in Python, used daily by every team in the company
- Added the integration test suite that made weekly releases possible

EDUCATION

BSc Computer Science — University of Manchester
2016

SKILLS

Go, Python, PostgreSQL, Kafka, Terraform, Docker, gRPC, Redis, CI/CD
`;

/** The posting the demo scan is run against. Mirrors the fixture in demoChrome. */
const POSTING = {
  company: 'Hexweave',
  title: 'Senior Backend Engineer',
  text: `What we are looking for

- 5+ years building and operating backend services in production
- Strong Go or Python, and comfort reading a language you have not written
- Experience designing and evolving PostgreSQL schemas under load
- You have run something on Kubernetes and have opinions about it
- Familiarity with event-driven systems: Kafka, or something like it
- A track record of improving reliability you can point at with numbers

Nice to have

- Exposure to payments, ledgers, or double-entry accounting
- Terraform or another infrastructure-as-code tool
- Experience mentoring engineers earlier in their careers
`,
};

/** One paragraph of the user's own prose, which is what grounds a letter. */
const WRITING_SAMPLE = `I spent most of last year on the settlement pipeline, which is
the least glamorous thing at Cindermill and the one I would pick again. It closed the day in
forty minutes when I took it over, and it closes in six now, and nothing about that was clever
— it was reading the thing carefully, finding the four places it waited on itself, and removing
them one at a time. I like work where the win is legible afterwards.`;

export async function seedDemoData(now = Date.now()): Promise<void> {
  if ((await db.applications.count()) > 0) return;

  // The profile, the scan and the sample come first: the Profile, Scan and
  // Cover Letter screens all render nothing without them, and a screenshot of
  // an empty state teaches nobody what the tool does.
  const profile = parseResume(
    { text: RESUME, kind: 'txt', fileName: 'ada-okafor-resume.pdf', bytes: RESUME.length },
    now - 40 * DAY,
  );
  await saveProfile(profile);
  await saveScan(
    scanJobDescription(POSTING.text, profile, {
      company: POSTING.company,
      jobTitle: POSTING.title,
      now: new Date(now - 2 * DAY),
    }),
  );
  await addWritingSample('Personal essay, 2025', WRITING_SAMPLE.replace(/\s+/g, ' ').trim());

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
      salary: row.salary,
      nextAction: row.nextAction,
      website: row.website,
      contact: row.contact,
    });

    for (const status of row.path) await setApplicationStatus(app.id, status);

    // Rows that arrived complete never went through `updateApplication`, so
    // they never banked the intel deed. Award it through the same once-only
    // path a hand edit takes, so the seeded ledger is one a user could have
    // earned rather than one written straight into the table.
    if (isComplete(app)) await recordDeed('intel', { applicationId: app.id });

    // The repo stamps `updatedAt` as it goes, which is correct for a live move
    // and wrong for a history being backfilled. Restate both clocks so the
    // ghost threshold sees the timeline this application actually had.
    await db.applications.update(app.id, {
      appliedAt: now - row.daysAgo * DAY,
      updatedAt: now - row.quietFor * DAY,
    });
  }
}
