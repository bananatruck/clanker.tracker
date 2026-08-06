/**
 * The spreadsheet view.
 *
 * A real table: every intel cell is click-to-edit in place, tab moves along a
 * row, and the footer carries the rollups. It is the same data the board shows
 * and the same data the CSV exports — one store, three readings — so there is
 * no "sync to your tracker" step and nothing to fall out of date.
 *
 * The narrow build drops four columns rather than shrinking all nine, because
 * nine columns in 420 pixels is a table you scroll sideways forever and read
 * nothing from. The dashboard, which has the width, shows the lot.
 */
import { useState } from 'react';
import type { Application } from '@/lib/db/schema';
import { updateApplication } from '@/lib/db/repo';
import { STATUS_COLOR, STATUS_LABEL, isStale } from '@/lib/tracker/funnel';
import {
  COLUMNS,
  NARROW_COLUMNS,
  type Column,
  type ColumnKey,
  filledIntel,
  formatSalary,
  hostOf,
  href,
  INTEL_FIELDS,
  isComplete,
  parseSalary,
  rollups,
  shortDay,
  tableWidth,
} from '@/lib/tracker/table';

/** What an edit earned, for the one line of feedback under the table. */
export interface IntelFlash {
  dp: number;
  company: string;
}

export default function TrackerTable({
  apps,
  wide,
  onEarned,
}: {
  apps: readonly Application[];
  wide: boolean;
  onEarned?: (flash: IntelFlash) => void;
}) {
  const columns = wide ? COLUMNS : NARROW_COLUMNS;
  const totals = rollups(apps);
  const widthOf = (c: Column) => (wide ? c.width : c.narrow);

  const edit = async (app: Application, key: ColumnKey, value: string) => {
    const dp = await updateApplication(app.id, { [key]: value });
    if (dp > 0) onEarned?.({ dp, company: app.company });
  };

  return (
    <div className="overflow-x-auto border-2 border-frame">
      {/*
        `table-fixed` rather than auto. With auto, one long next-action note
        widens its column, every other column gives up space to pay for it, and
        the last column falls off the right edge — the layout is then decided
        by whichever row happens to have the most text in it. Fixed honours the
        declared widths and lets the long cell truncate, which is what a
        spreadsheet does.
      */}
      <table
        className="w-full table-fixed border-collapse text-[13.5px]"
        style={{ minWidth: tableWidth(columns, wide) }}
      >
        <thead>
          <tr className="dq-banner">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={{ width: widthOf(c) }}
                className="border-r border-black/20 px-2 py-1.5 text-left font-mono text-[12px] font-semibold uppercase tracking-wide last:border-r-0"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {apps.map((app) => (
            <Row key={app.id} app={app} columns={columns} widthOf={widthOf} onEdit={edit} />
          ))}
        </tbody>

        <tfoot>
          <tr className="border-t-2 border-frame bg-window-hi">
            {columns.map((c) => (
              <td
                key={c.key}
                className="border-r border-frame-dim px-2 py-1.5 align-top last:border-r-0"
              >
                <Footer column={c} totals={totals} />
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Row({
  app,
  columns,
  widthOf,
  onEdit,
}: {
  app: Application;
  columns: readonly Column[];
  widthOf: (c: Column) => number;
  onEdit: (app: Application, key: ColumnKey, value: string) => Promise<void>;
}) {
  const done = isComplete(app);

  return (
    <tr className="border-b border-frame-dim last:border-b-0 hover:bg-window-hi/60">
      {columns.map((c) => (
        <td
          key={c.key}
          className="border-r border-frame-dim/60 align-middle last:border-r-0"
          style={{ width: widthOf(c) }}
        >
          <Cell app={app} column={c} complete={done} onEdit={onEdit} />
        </td>
      ))}
    </tr>
  );
}

function Cell({
  app,
  column,
  complete,
  onEdit,
}: {
  app: Application;
  column: Column;
  complete: boolean;
  onEdit: (app: Application, key: ColumnKey, value: string) => Promise<void>;
}) {
  switch (column.key) {
    case 'status':
      return (
        <span
          className={`flex items-center gap-1.5 overflow-hidden px-2 py-1.5 font-mono text-[12.5px] ${STATUS_COLOR[app.status]}`}
        >
          <span className="truncate">{STATUS_LABEL[app.status]}</span>
          {isStale(app) && <span className="shrink-0 text-[11px] text-bad">quiet</span>}
        </span>
      );

    case 'appliedAt':
      return (
        <span className="block px-2 py-1.5 font-mono text-[12.5px] text-muted">
          {shortDay(app.appliedAt)}
        </span>
      );

    case 'url':
      return app.url ? (
        <a
          href={app.url}
          target="_blank"
          rel="noreferrer"
          className="block px-2 py-1.5 font-mono text-[12.5px] text-gold underline decoration-gold-dim hover:text-parchment"
        >
          posting ↗
        </a>
      ) : (
        <span className="block px-2 py-1.5 font-mono text-[12.5px] text-faint">—</span>
      );

    case 'company':
      return (
        <span className="flex items-center">
          {/* The bead is the only place the game touches the table: it fills as
              the four researched columns fill, so the reward is legible before
              you have earned it rather than announced after. */}
          <IntelBead app={app} complete={complete} />
          <CellInput app={app} column={column} onEdit={onEdit} bold />
        </span>
      );

    case 'website':
      return <WebsiteCell app={app} column={column} onEdit={onEdit} />;

    default:
      return <CellInput app={app} column={column} onEdit={onEdit} />;
  }
}

/**
 * Click-to-edit, table flavour.
 *
 * Not the shared `Editable`: that one is a flex child sized to its content,
 * and a table cell needs the input to be the whole cell so the click target is
 * the box you actually aimed at. The commit rules are the same — Enter
 * commits, Escape abandons, blur commits.
 */
function CellInput({
  app,
  column,
  onEdit,
  bold = false,
}: {
  app: Application;
  column: Column;
  onEdit: (app: Application, key: ColumnKey, value: string) => Promise<void>;
  bold?: boolean;
}) {
  const current = String(app[column.key as keyof Application] ?? '');
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft !== null && draft.trim() !== current) void onEdit(app, column.key, draft.trim());
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(null);
          if (e.key === 'Tab') commit();
        }}
        className="w-full border-0 bg-field px-2 py-1.5 text-[13.5px] text-window outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(current)}
      className={`w-full truncate px-2 py-1.5 text-left hover:bg-window ${
        bold ? 'text-parchment' : 'text-muted'
      }`}
    >
      {current || <span className="text-faint">—</span>}
    </button>
  );
}

/** The website cell reads as a hostname and links, but still edits in place. */
function WebsiteCell({
  app,
  column,
  onEdit,
}: {
  app: Application;
  column: Column;
  onEdit: (app: Application, key: ColumnKey, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const site = app.website ?? '';

  if (editing || site === '') {
    return (
      <span onBlur={() => setEditing(false)}>
        <CellInput app={app} column={column} onEdit={onEdit} />
      </span>
    );
  }

  return (
    <span className="flex items-center">
      <a
        href={href(site)}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 truncate px-2 py-1.5 font-mono text-[12.5px] text-gold underline decoration-gold-dim hover:text-parchment"
      >
        {hostOf(site)}
      </a>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit website for ${app.company}`}
        className="px-1.5 py-1.5 font-mono text-[11px] text-faint hover:text-parchment"
      >
        ✎
      </button>
    </span>
  );
}

/** Four pips, one per researched column. Gold when the row is done. */
function IntelBead({ app, complete }: { app: Application; complete: boolean }) {
  const filled = filledIntel(app);

  return (
    <span
      className="flex shrink-0 flex-col gap-px pl-1.5"
      title={
        complete
          ? 'Researched — banked 1 DP'
          : `${filled} of ${INTEL_FIELDS.length} columns filled. Fill them all for 1 DP.`
      }
    >
      {[0, 1].map((row) => (
        <span key={row} className="flex gap-px">
          {[0, 1].map((col) => {
            const i = row * 2 + col;
            return (
              <span
                key={col}
                className={`block h-1 w-1 ${
                  i < filled ? (complete ? 'bg-gold' : 'bg-ok') : 'bg-frame-dim'
                }`}
              />
            );
          })}
        </span>
      ))}
    </span>
  );
}

/**
 * The rollups.
 *
 * Notion puts these under the column they summarise and so does this, because
 * a summary that sits in its own panel above the table is a second thing to
 * read; one that sits under the column is the column's last row.
 */
function Footer({ column, totals }: { column: Column; totals: ReturnType<typeof rollups> }) {
  const label = (text: string) => (
    <span className="block font-mono text-[10.5px] uppercase tracking-wide text-faint">{text}</span>
  );

  switch (column.rollup) {
    case 'count':
      return (
        <>
          {label('count')}
          <span className="font-mono text-[14px] text-parchment">{totals.count}</span>
        </>
      );

    case 'range':
      return (
        <>
          {label('range')}
          <span className="font-mono text-[12.5px] text-parchment">
            {totals.span ? `${totals.span.days}d` : '—'}
          </span>
          {totals.span && (
            <span className="mt-0.5 block font-mono text-[10.5px] text-faint">
              {shortDay(totals.span.from)} → {shortDay(totals.span.to)}
            </span>
          )}
        </>
      );

    case 'max':
      return (
        <>
          {label('max')}
          {totals.topSalary ? (
            <>
              <span className="font-mono text-[14px] text-gold">
                {formatSalary(totals.topSalary.value, totals.topSalary.currency)}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-faint">
                {totals.topSalary.company}
              </span>
            </>
          ) : (
            <span className="font-mono text-[12.5px] text-faint">—</span>
          )}
        </>
      );

    case 'filled':
      return (
        <>
          {label('not empty')}
          <span className="font-mono text-[14px] text-parchment">{totals.withNextAction}</span>
          <span className="mt-0.5 block font-mono text-[10.5px] text-faint">
            {totals.count === 0
              ? '—'
              : `${Math.round((totals.withNextAction / totals.count) * 100)}%`}
          </span>
        </>
      );

    default:
      return null;
  }
}

/** Re-exported so the views can show a salary without importing the parser. */
export { parseSalary };
