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
  applicationEvents,
  deleteApplication,
  logApplication,
  setApplicationStatus,
  trackApplication,
  totalDp,
  updateApplication,
} from '@/lib/db/repo';
import type {
  Application,
  ApplicationEvent,
  ApplicationStatus,
} from '@/lib/db/schema';
import { DEEDS } from '@/lib/game/economy';
import {
  BOARD_COLUMNS,
  GHOST_AFTER_DAYS,
  STATUS_COLOR,
  STATUS_DEED_LABEL,
  STATUS_LABEL,
  deedForStatus,
} from '@/lib/tracker/funnel';
import { applicationsToCsv, csvFilename, downloadCsv } from '@/lib/tracker/csv';
import { costStats, funnelStats } from '@/lib/tracker/stats';
import {
  filterApplications,
  isFollowUpDue,
  isReminderDue,
  localDateInputValue,
  parseLocalDateInput,
  type TrackerFilter,
} from '@/lib/tracker/query';
import { INTEL_FIELDS } from '@/lib/tracker/table';
import TrackerTable, { type IntelFlash } from '@/ui/tracker/Table';

/**
 * Three readings of the same rows.
 *
 * `board` answers "what stage is this in", `table` answers everything else,
 * and `list` is the glance. None of them is a separate store — editing a cell
 * in the table moves the card on the board, because they are the same row.
 */
type View = 'board' | 'table' | 'list';

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

export default function Tracker({ wide = false }: { wide?: boolean } = {}) {
  const apps = useLiveQuery(() => allApplications(), [], undefined);
  // The table is the better default where there is room for it; the panel
  // opens on the board, which is what 420 pixels is actually good for.
  const [view, setView] = useState<View>(wide ? 'table' : 'board');
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [intel, setIntel] = useState<IntelFlash | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TrackerFilter>('all');

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    if (!intel) return;
    const timer = setTimeout(() => setIntel(null), 6000);
    return () => clearTimeout(timer);
  }, [intel]);

  const stats = useMemo(() => (apps ? funnelStats(apps) : null), [apps]);
  const cost = useMemo(() => (apps ? costStats(apps) : null), [apps]);
  const visibleApps = useMemo(
    () => filterApplications(apps ?? [], { query, filter }),
    [apps, query, filter],
  );
  const attentionCount = useMemo(
    () => filterApplications(apps ?? [], { query: '', filter: 'attention' }).length,
    [apps],
  );

  if (apps === undefined) {
    return <p className="font-mono text-[13px] text-faint">Loading…</p>;
  }

  const exportCsv = () => downloadCsv(csvFilename(), applicationsToCsv(apps));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <div className="flex border-2 border-frame-dim">
          {(['board', 'table', 'list'] as const).map((v) => (
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
          {adding ? 'Close' : '+ Add job'}
        </button>
        <button
          onClick={exportCsv}
          disabled={apps.length === 0}
          className="border-2 border-frame-dim px-2 py-1 font-mono text-[12px] text-muted hover:bg-window hover:text-parchment disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="flex gap-1">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search tracked jobs"
          placeholder="Search company, role, contact..."
          className="min-w-0 flex-1 border-2 border-frame-dim bg-field px-2 py-1 font-mono text-[12px] text-parchment outline-none placeholder:text-faint focus:border-gold-dim"
        />
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as TrackerFilter)}
          aria-label="Filter tracked jobs"
          className="max-w-36 border-2 border-frame-dim bg-field px-1.5 py-1 font-mono text-[12px] text-muted outline-none focus:border-gold-dim"
        >
          <option value="all">All ({apps.length})</option>
          <option value="active">Active</option>
          <option value="attention">Needs action ({attentionCount})</option>
          {BOARD_COLUMNS.map((status) => (
            <option key={status} value={status}>{STATUS_LABEL[status]}</option>
          ))}
        </select>
      </div>

      {adding && <AddForm onDone={() => setAdding(false)} />}

      {stats && cost && apps.length > 0 && <Summary stats={stats} cost={cost} />}

      {flash && <FlashBanner flash={flash} />}
      {intel && <IntelBanner flash={intel} />}

      {apps.length === 0 ? (
        <Empty />
      ) : visibleApps.length === 0 ? (
        <NoMatches onClear={() => { setQuery(''); setFilter('all'); }} />
      ) : view === 'board' ? (
        <Board apps={visibleApps} onMoved={setFlash} />
      ) : view === 'table' ? (
        <>
          <TrackerTable apps={visibleApps} wide={wide} onEarned={setIntel} />
          <p className="font-mono text-[12px] text-faint">
            Click any cell to edit. Fill all {INTEL_FIELDS.length} researched columns on a row —
            salary, next action, website, contact — and it banks{' '}
            <span className="text-gold">{DEEDS.intel.dp} DP</span>, once.
          </p>
        </>
      ) : (
        <List apps={visibleApps} />
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="dq-window p-3">
      <h2 className="mb-1.5 font-mono text-[13px] text-muted">Nothing tracked yet</h2>
      <p className="text-[14px] leading-relaxed text-muted">
        Open a supported job posting and it appears here automatically.
        Starting a fill advances it, and a confirmed submission marks it Applied.
        You can still use <span className="font-mono text-[13px] text-parchment">+ Add job</span> for postings or applications from elsewhere.
      </p>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="dq-window p-3 text-center">
      <p className="font-mono text-[13px] text-muted">No tracked jobs match this view.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 border border-frame px-2 py-1 font-mono text-[12px] text-gold hover:bg-window-hi"
      >
        Clear search and filter
      </button>
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
        <Stat label="sent / tracked" value={`${stats.total}/${stats.tracked}`} />
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

/** What researching a row paid. Same shape of reward as a funnel move. */
function IntelBanner({ flash }: { flash: IntelFlash }) {
  return (
    <section className="border border-gold-dim bg-gold-dim/15 px-2.5 py-2">
      <p className="font-mono text-[13px] text-gold">
        +{flash.dp} DP · {DEEDS.intel.label}
      </p>
      <p className="mt-0.5 text-[13px] leading-snug text-muted">
        {flash.company} is fully scouted. Nothing about that row was something the autofill could
        have known.
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
    (status) =>
      !['rejected', 'withdrawn', 'ghosted'].includes(status) ||
      apps.some((app) => app.status === status),
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
  const due = isFollowUpDue(app);
  const reminderDue = isReminderDue(app);

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
            {app.role || 'role unrecorded'}
            {app.location ? ` · ${app.location}` : ''} · {app.ats}
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
        {due && (
          <span className="mt-0.5 shrink-0 font-mono text-[11px] text-bad">
            {reminderDue ? 'due' : 'quiet'}
          </span>
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
  const events = useLiveQuery(() => applicationEvents(app.id), [app.id], []);
  const [nextAction, setNextAction] = useState(app.nextAction ?? '');
  const [nextActionDate, setNextActionDate] = useState(localDateInputValue(app.nextActionAt));
  const [followUpSaved, setFollowUpSaved] = useState(false);
  const [location, setLocation] = useState(app.location ?? '');
  const [tags, setTags] = useState((app.tags ?? []).join(', '));
  const [notes, setNotes] = useState(app.notes);
  const [detailsSaved, setDetailsSaved] = useState(false);

  useEffect(() => {
    setNextAction(app.nextAction ?? '');
    setNextActionDate(localDateInputValue(app.nextActionAt));
  }, [app.nextAction, app.nextActionAt]);

  useEffect(() => {
    setLocation(app.location ?? '');
    setTags((app.tags ?? []).join(', '));
    setNotes(app.notes);
  }, [app.location, app.tags, app.notes]);

  const move = async (status: ApplicationStatus) => {
    onMoved({ dp: await setApplicationStatus(app.id, status), status });
  };

  const saveFollowUp = async () => {
    await updateApplication(app.id, {
      nextAction: nextAction.trim(),
      nextActionAt: parseLocalDateInput(nextActionDate),
    });
    setFollowUpSaved(true);
    setTimeout(() => setFollowUpSaved(false), 1800);
  };

  const saveDetails = async () => {
    await updateApplication(app.id, {
      location: location.trim(),
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      notes: notes.trim(),
    });
    setDetailsSaved(true);
    setTimeout(() => setDetailsSaved(false), 1800);
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${app.company || 'this job'} from the tracker?`)) return;
    await deleteApplication(app.id);
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
        {app.appliedAt === null
          ? `tracked ${new Date(app.trackedAt ?? app.updatedAt).toISOString().slice(0, 10)}`
          : `sent ${new Date(app.appliedAt).toISOString().slice(0, 10)}`}
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

      <section className="space-y-1 border-t border-frame pt-2">
        <h4 className="font-mono text-[11px] uppercase tracking-wide text-faint">Job details</h4>
        <input
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          aria-label={`Location for ${app.company}`}
          placeholder="Location or Remote"
          className="w-full border border-frame-dim bg-field px-2 py-1 text-[12px] text-parchment outline-none placeholder:text-faint focus:border-gold-dim"
        />
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          aria-label={`Tags for ${app.company}`}
          placeholder="Tags, comma separated"
          className="w-full border border-frame-dim bg-field px-2 py-1 text-[12px] text-parchment outline-none placeholder:text-faint focus:border-gold-dim"
        />
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          aria-label={`Notes for ${app.company}`}
          placeholder="Notes about the role, team, or process"
          rows={3}
          className="w-full resize-y border border-frame-dim bg-field px-2 py-1 text-[12px] text-parchment outline-none placeholder:text-faint focus:border-gold-dim"
        />
        <button
          type="button"
          onClick={() => void saveDetails()}
          className="border border-frame px-2 py-1 font-mono text-[11px] text-gold hover:bg-window-hi"
        >
          {detailsSaved ? 'Saved' : 'Save details'}
        </button>
      </section>

      <section className="space-y-1 border-t border-frame pt-2">
        <h4 className="font-mono text-[11px] uppercase tracking-wide text-faint">Next action</h4>
        <input
          value={nextAction}
          onChange={(event) => setNextAction(event.target.value)}
          placeholder="Email recruiter, prepare OA..."
          className="w-full border border-frame-dim bg-field px-2 py-1 text-[12px] text-parchment outline-none placeholder:text-faint focus:border-gold-dim"
        />
        <div className="flex gap-1">
          <input
            type="date"
            value={nextActionDate}
            onChange={(event) => setNextActionDate(event.target.value)}
            aria-label={`Follow-up date for ${app.company}`}
            className="min-w-0 flex-1 border border-frame-dim bg-field px-2 py-1 font-mono text-[11px] text-muted outline-none focus:border-gold-dim"
          />
          <button
            type="button"
            onClick={() => void saveFollowUp()}
            className="border border-frame px-2 py-1 font-mono text-[11px] text-gold hover:bg-window-hi"
          >
            {followUpSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </section>

      {events.length > 0 && (
        <section className="space-y-1 border-t border-frame pt-2">
          <h4 className="font-mono text-[11px] uppercase tracking-wide text-faint">Activity</h4>
          <ol className="space-y-1">
            {[...events].reverse().slice(0, 6).map((event, index) => (
              <li
                key={event.id ?? `${event.at}-${event.kind}-${index}`}
                className="flex items-baseline justify-between gap-2 font-mono text-[10.5px]"
              >
                <span className="min-w-0 truncate text-muted">{eventSummary(event)}</span>
                <time className="shrink-0 text-faint" dateTime={new Date(event.at).toISOString()}>
                  {new Date(event.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}

      <button
        onClick={() => void remove()}
        className="font-mono text-[11px] text-faint hover:text-bad"
      >
        remove from board
      </button>
    </div>
  );
}

function eventSummary(event: ApplicationEvent): string {
  switch (event.kind) {
    case 'created':
      return `Tracked as ${event.toStatus ? STATUS_LABEL[event.toStatus] : 'job'}`;
    case 'submitted':
      return 'Submission confirmed';
    case 'status':
      return event.toStatus ? `Moved to ${STATUS_LABEL[event.toStatus]}` : 'Status changed';
    case 'follow-up':
      return 'Follow-up updated';
    case 'updated':
      return 'Details updated';
  }
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
              <td className="max-w-24 truncate px-2 py-1.5 text-parchment">{a.company || '-'}</td>
              <td className="max-w-32 truncate px-2 py-1.5 text-muted">{a.role || '-'}</td>
              <td className={`px-2 py-1.5 font-mono text-[12px] ${STATUS_COLOR[a.status]}`}>
                {STATUS_LABEL[a.status]}
              </td>
              <td className="px-2 py-1.5 font-mono text-[12px] text-faint">
                {new Date(a.appliedAt ?? a.trackedAt ?? a.updatedAt).toISOString().slice(5, 10)}
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
  const [url, setUrl] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<'saved' | 'applied'>('applied');

  const submit = async () => {
    if (!company.trim()) return;
    const init = {
      company: company.trim(),
      role: role.trim(),
      url: url.trim(),
      ats: 'generic' as const,
      scanId: null,
      notes: '',
      llmCalls: 0,
      source: 'manual' as const,
      ...(location.trim() ? { location: location.trim() } : {}),
    };
    if (status === 'applied') {
      await logApplication(init);
    } else {
      await trackApplication({ ...init, status: 'saved' });
    }
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
      <input
        type="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="Posting URL (optional)"
        className="w-full border-2 border-frame-dim bg-field px-2 py-1 text-[13px] text-parchment outline-none placeholder:text-faint focus:border-gold-dim"
      />
      <input
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        placeholder="Location or Remote (optional)"
        className="w-full border-2 border-frame-dim bg-field px-2 py-1 text-[13px] text-parchment outline-none placeholder:text-faint focus:border-gold-dim"
      />
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value as 'saved' | 'applied')}
        aria-label="Initial job status"
        className="w-full border-2 border-frame-dim bg-field px-2 py-1 font-mono text-[12px] text-muted outline-none focus:border-gold-dim"
      >
        <option value="saved">Saved for later</option>
        <option value="applied">Already applied</option>
      </select>
      <button
        onClick={() => void submit()}
        disabled={!company.trim()}
        className="w-full bg-gold-dim px-2 py-1 font-mono text-[12px] text-parchment hover:bg-gold disabled:opacity-40"
      >
        {status === 'applied' ? `Log application · +${DEEDS.application.dp} DP` : 'Save posting'}
      </button>
    </section>
  );
}
