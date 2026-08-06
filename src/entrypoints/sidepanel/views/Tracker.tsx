/**
 * The tracker. This is the milestone that makes the thing usable daily.
 *
 * Applications log themselves when a filled page is actually submitted, and
 * anything sent by hand can be added here — a tracker that only counts what
 * this extension touched would understate the size of the crusade, which is
 * the one thing it must never do.
 *
 * Moving a card banks the deed once, ever. Moving it backwards takes nothing
 * back. The board shows what each move did in Clankerdom next to what it did
 * in the funnel, because those are the same event described twice.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  allApplications,
  deleteApplication,
  logApplication,
  setApplicationStatus,
  totalDp,
} from '@/lib/db/repo';
import type { Application, ApplicationStatus } from '@/lib/db/schema';
import { DEEDS } from '@/lib/game/economy';
import {
  BOARD_COLUMNS,
  GHOST_AFTER_DAYS,
  STATUS_COLOR,
  STATUS_DEED_LABEL,
  STATUS_LABEL,
  deedForStatus,
  isStale,
} from '@/lib/tracker/funnel';
import { applicationsToCsv, csvFilename, downloadCsv } from '@/lib/tracker/csv';
import { costStats, funnelStats } from '@/lib/tracker/stats';

type View = 'board' | 'list';

/**
 * What a move just earned.
 *
 * Held here rather than on the card, because moving a card moves it to
 * another column and unmounts it — the reward would flash and vanish, which
 * is precisely the reward schedule this whole project exists to fix.
 */
export interface Flash {
  dp: number;
  status: ApplicationStatus;
}

export default function Tracker() {
  const apps = useLiveQuery(() => allApplications(), [], undefined);
  const [view, setView] = useState<View>('board');
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(timer);
  }, [flash]);

  const stats = useMemo(() => (apps ? funnelStats(apps) : null), [apps]);
  const cost = useMemo(() => (apps ? costStats(apps) : null), [apps]);

  if (apps === undefined) {
    return <p className="font-mono text-[13px] text-faint">Loading…</p>;
  }

  const exportCsv = () => downloadCsv(csvFilename(), applicationsToCsv(apps));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <div className="flex border-2 border-frame-dim">
          {(['board', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-1 font-mono text-[12px] transition-colors ${
                view === v ? 'bg-window-hi text-parchment' : 'text-muted hover:text-parchment'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setAdding((a) => !a)}
          className="border-2 border-frame-dim px-2 py-1 font-mono text-[12px] text-muted hover:bg-window hover:text-parchment"
        >
          {adding ? 'Close' : '+ Log one'}
        </button>
        <button
          onClick={exportCsv}
          disabled={apps.length === 0}
          className="border-2 border-frame-dim px-2 py-1 font-mono text-[12px] text-muted hover:bg-window hover:text-parchment disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {adding && <AddForm onDone={() => setAdding(false)} />}

      {stats && cost && apps.length > 0 && <Summary stats={stats} cost={cost} />}

      {flash && <FlashBanner flash={flash} />}

      {apps.length === 0 ? (
        <Empty />
      ) : view === 'board' ? (
        <Board apps={apps} onMoved={setFlash} />
      ) : (
        <List apps={apps} />
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="dq-window p-3">
      <h2 className="mb-1.5 font-mono text-[13px] text-muted">Nothing sent yet</h2>
      <p className="text-[14px] leading-relaxed text-muted">
        Fill an application and submit it — it logs itself. Anything you sent by hand or over
        email, log with <span className="font-mono text-[13px] text-parchment">+ Log one</span>.
        Every row here razed something.
      </p>
    </div>
  );
}

/** The DP counter, and the cost claim held to account beside it. */
function Summary({
  stats,
  cost,
}: {
  stats: ReturnType<typeof funnelStats>;
  cost: ReturnType<typeof costStats>;
}) {
  // Read the ledger rather than deriving DP from the board. An application
  // that reached an interview and was then rejected still dried the river;
  // counting current status would quietly take it back, and nothing in this
  // economy takes anything back.
  const dp = useLiveQuery(() => totalDp(), [], 0) ?? 0;

  return (
    <section className="space-y-2 dq-window p-2.5">
      <div className="grid grid-cols-4 gap-2">
        <Stat label="sent" value={stats.total} />
        <Stat label="replies" value={`${Math.round(stats.responseRate * 100)}%`} />
        <Stat label="interviews" value={stats.interviews} tone="text-ok" />
        <Stat label="dp" value={dp} tone="text-gold" />
      </div>

      <div className="flex h-1 overflow-hidden bg-field">
        <Segment n={stats.byStatus.offer} total={stats.total} cls="bg-gold" />
        <Segment n={stats.byStatus.interview} total={stats.total} cls="bg-ok" />
        <Segment n={stats.byStatus.oa} total={stats.total} cls="bg-warn" />
        <Segment n={stats.byStatus.rejected} total={stats.total} cls="bg-bad" />
      </div>

      <p className="font-mono text-[12px] text-faint">
        median{' '}
        <span className={cost.medianLlmCalls === 0 ? 'text-ok' : 'text-warn'}>
          {cost.medianLlmCalls}
        </span>{' '}
        model calls · {Math.round(cost.freeShare * 100)}% cost nothing
        {stats.stale > 0 && (
          <>
            {' · '}
            <span className="text-bad">{stats.stale}</span> quiet {GHOST_AFTER_DAYS}d+
          </>
        )}
      </p>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div>
      <div className={`font-mono text-[18px] leading-none ${tone ?? 'text-parchment'}`}>{value}</div>
      <div className="mt-1 font-mono text-[11px] uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}

function Segment({ n, total, cls }: { n: number; total: number; cls: string }) {
  if (n === 0 || total === 0) return null;
  return <div className={cls} style={{ width: `${(n / total) * 100}%` }} />;
}

/** The one moment of payback in the loop. It stays put long enough to read. */
function FlashBanner({ flash }: { flash: Flash }) {
  const earned = flash.dp > 0;

  return (
    <section
      className={` border px-2.5 py-2 ${
        earned ? 'border-gold-dim bg-gold-dim/15' : 'border-frame bg-window'
      }`}
    >
      <p className={`font-mono text-[13px] ${earned ? 'text-gold' : 'text-muted'}`}>
        {earned ? `+${flash.dp} DP · ${STATUS_DEED_LABEL[flash.status]}` : 'Board updated'}
      </p>
      <p className="mt-0.5 text-[13px] leading-snug text-muted">
        {earned
          ? STATUS_LABEL[flash.status] === 'Offer'
            ? 'The Adoption. You are inside now.'
            : 'Banked. Move it back and forth all you like — a deed pays once.'
          : deedForStatus(flash.status) === null
            ? 'A rejection earns nothing and takes nothing back. The villages stay razed.'
            : 'Already banked — a deed pays once.'}
      </p>
    </section>
  );
}

function Board({
  apps,
  onMoved,
}: {
  apps: readonly Application[];
  onMoved: (flash: Flash) => void;
}) {
  // Empty terminal columns are hidden — a fresh board should not open with two
  // columns of rejection waiting for you.
  const columns = BOARD_COLUMNS.filter(
    (s) => !['rejected', 'ghosted'].includes(s) || apps.some((a) => a.status === s),
  );

  return (
    <div className="space-y-2">
      {columns.map((status) => {
        const inColumn = apps.filter((a) => a.status === status);
        return (
          <section key={status}>
            <h3 className="mb-1 flex items-baseline justify-between">
              <span className={`font-mono text-[12px] uppercase tracking-wide ${STATUS_COLOR[status]}`}>
                {STATUS_LABEL[status]}
              </span>
              <span className="font-mono text-[11px] text-faint">
                {inColumn.length} · {STATUS_DEED_LABEL[status]}
              </span>
            </h3>

            {inColumn.length === 0 ? (
              <div className="border border-dashed border-frame px-2 py-1.5 font-mono text-[12px] text-faint">
                empty
              </div>
            ) : (
              <div className="space-y-1">
                {inColumn.map((app) => (
                  <Card key={app.id} app={app} onMoved={onMoved} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Card({ app, onMoved }: { app: Application; onMoved: (flash: Flash) => void }) {
  const [open, setOpen] = useState(false);
  const stale = isStale(app);

  return (
    <article className="overflow-hidden dq-window">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-window-hi"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-snug text-parchment">
            {app.company || 'Unknown company'}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-faint">
            {app.role || 'role unrecorded'} · {app.ats}
            {app.llmCalls === 0 ? (
              <span className="text-ok"> · free</span>
            ) : (
              <span className="text-warn">
                {' '}
                · {app.llmCalls} call{app.llmCalls === 1 ? '' : 's'}
              </span>
            )}
          </span>
        </span>
        {stale && (
          <span className="mt-0.5 shrink-0 font-mono text-[11px] text-bad">quiet</span>
        )}
      </button>

      {open && <CardDetail app={app} onMoved={onMoved} />}
    </article>
  );
}

function CardDetail({
  app,
  onMoved,
}: {
  app: Application;
  onMoved: (flash: Flash) => void;
}) {
  const move = async (status: ApplicationStatus) => {
    onMoved({ dp: await setApplicationStatus(app.id, status), status });
  };

  return (
    <div className="space-y-2 border-t border-frame px-2.5 py-2">
      <div className="flex flex-wrap gap-1">
        {BOARD_COLUMNS.map((status) => (
          <button
            key={status}
            onClick={() => void move(status)}
            disabled={status === app.status}
            className={` border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
              status === app.status
                ? 'border-gold-dim bg-gold-dim/20 text-gold'
                : 'border-frame text-muted hover:bg-window-hi hover:text-parchment'
            }`}
          >
            {STATUS_LABEL[status]}
          </button>
        ))}
      </div>

      <p className="font-mono text-[11px] text-faint">
        sent {new Date(app.appliedAt).toISOString().slice(0, 10)}
        {app.url && (
          <>
            {' · '}
            <a
              href={app.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted underline decoration-border hover:text-gold"
            >
              posting
            </a>
          </>
        )}
      </p>

      <button
        onClick={() => void deleteApplication(app.id)}
        className="font-mono text-[11px] text-faint hover:text-bad"
      >
        remove from board
      </button>
    </div>
  );
}

function List({ apps }: { apps: readonly Application[] }) {
  return (
    <div className="overflow-x-auto border-2 border-frame-dim">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-frame bg-window text-left">
            {['Company', 'Role', 'Status', 'Sent'].map((h) => (
              <th
                key={h}
                className="px-2 py-1.5 font-mono text-[11px] uppercase tracking-wide text-faint"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {apps.map((a) => (
            <tr key={a.id} className="border-b border-frame last:border-0 hover:bg-window">
              <td className="max-w-24 truncate px-2 py-1.5 text-parchment">{a.company || '—'}</td>
              <td className="max-w-32 truncate px-2 py-1.5 text-muted">{a.role || '—'}</td>
              <td className={`px-2 py-1.5 font-mono text-[12px] ${STATUS_COLOR[a.status]}`}>
                {STATUS_LABEL[a.status]}
              </td>
              <td className="px-2 py-1.5 font-mono text-[12px] text-faint">
                {new Date(a.appliedAt).toISOString().slice(5, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');

  const submit = async () => {
    if (!company.trim()) return;
    await logApplication({
      company: company.trim(),
      role: role.trim(),
      url: '',
      ats: 'generic',
      scanId: null,
      notes: '',
      // Sent by hand, so it cost nothing — which is true, and keeps the
      // median honest rather than flattering.
      llmCalls: 0,
    });
    onDone();
  };

  return (
    <section className="space-y-1.5 dq-window p-2.5">
      <input
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder="Company"
        className="w-full border-2 border-frame-dim bg-field px-2 py-1 text-[13px] text-parchment outline-none placeholder:text-faint focus:border-gold-dim"
      />
      <input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Role"
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        className="w-full border-2 border-frame-dim bg-field px-2 py-1 text-[13px] text-parchment outline-none placeholder:text-faint focus:border-gold-dim"
      />
      <button
        onClick={() => void submit()}
        disabled={!company.trim()}
        className="w-full bg-gold-dim px-2 py-1 font-mono text-[12px] text-parchment hover:bg-gold disabled:opacity-40"
      >
        Log it · +{DEEDS.application.dp} DP
      </button>
    </section>
  );
}
