/**
 * What you watch while the application fills itself.
 *
 * The screen splits: the crusade above, the checklist below. That is not
 * decoration on a progress bar — the two halves are the same event told twice.
 * Above, Kh. Laude is fighting the posting. Below, every question that posting
 * asks is a line that ticks as it gets answered.
 *
 * The checklist exists because "filled 22 fields" is not a claim anyone can
 * check. A list of the actual questions, each with the tier that answered it
 * and a mark for the ones being handed back, is. The good ending is every row
 * ticked; the honest one is a short list at the bottom of things the tool
 * refused to invent, which is the tool working rather than failing.
 */
import { TIER_LABEL } from '@/lib/fill/types';
import {
  cleanSweep,
  filledCount,
  needsYouCount,
  type FieldProgress,
  type FillProgress,
} from '@/lib/fill/progress';
import { ACTORS, encounterFor } from '@/lib/game/atlas';
import type { Tier } from '@/lib/game/economy';
import { Meter } from '@/ui/dq';
import Scene from './Scene';

/** What the game says at each stage. One line, in the game's own voice. */
const NARRATION: Record<FillProgress['phase'], string> = {
  reading: 'Kh. Laude reads the proclamation. It is long.',
  answering: 'He answers. He has answered this before.',
  reviewing: 'He waits. Nothing is sent without you.',
  writing: 'He writes. The quill does not stop.',
  done: 'The field is filled. Nothing was invented.',
  cancelled: 'He puts the quill down. Nothing was written.',
  failed: 'The proclamation is not one he can read.',
};

const MARK: Record<FieldProgress['state'], { glyph: string; tone: string }> = {
  filled: { glyph: '✔', tone: 'text-ok' },
  pending: { glyph: '·', tone: 'text-faint' },
  'needs-you': { glyph: '▶', tone: 'text-warn' },
};

export default function FillRun({
  progress,
  tier,
  onDone,
}: {
  progress: FillProgress;
  tier: Tier;
  /** Dismiss the run view and go back to the Fill screen. */
  onDone?: () => void;
}) {
  const { fields, phase } = progress;
  const filled = filledCount(fields);
  const waiting = needsYouCount(fields);
  const swept = cleanSweep(fields) && phase === 'done';

  // The foe is the posting's difficulty as the form measures it: how many
  // questions it asks that we cannot answer for you.
  const foe = encounterFor(waiting);

  return (
    <div className="flex h-full flex-col gap-2">
      {/* The crusade. Half the screen, as it should be. */}
      <Scene
        tier={tier}
        hero={ACTORS['khlaude-battle']!}
        foe={phase === 'done' || phase === 'cancelled' ? null : foe}
        speaker="Kh. Laude"
        line={NARRATION[phase]}
      />

      {/* The checklist. */}
      <div className="dq-window flex min-h-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2 border-b-2 border-frame-dim px-2 py-1.5">
          <span className="dq-label">The proclamation</span>
          <span className="font-mono text-[12px]">
            <span className="text-ok">{filled}</span>
            <span className="text-faint"> / {fields.length}</span>
            {waiting > 0 && <span className="text-warn"> · {waiting} for you</span>}
          </span>
        </div>

        <div className="px-2 pt-1.5">
          <Meter value={fields.length === 0 ? 0 : filled / fields.length} cells={20} />
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {fields.length === 0 ? (
            <li className="px-1 py-2 text-[13px] text-faint">Reading the form…</li>
          ) : (
            fields.map((field) => <Row key={field.id} field={field} />)
          )}
        </ul>

        {phase === 'done' && (
          <div className="border-t-2 border-frame-dim px-2 py-1.5">
            <p className={`text-[13px] ${swept ? 'text-ok' : 'text-parchment'}`}>
              {swept
                ? 'Every field answered. Nothing left for you.'
                : `${waiting} ${waiting === 1 ? 'field needs' : 'fields need'} you — the ones it would have had to make up.`}
            </p>
            {onDone && (
              <button className="dq-btn mt-1.5 px-2 py-1" onClick={onDone}>
                Done
              </button>
            )}
          </div>
        )}

        {phase === 'failed' && progress.error && (
          <div className="border-t-2 border-frame-dim px-2 py-1.5">
            <p className="text-[13px] text-bad">{progress.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One question.
 *
 * Ordered as the form asks them, not sorted by state — a list that reorders
 * itself under someone reading it is a list they have to re-read. The tier is
 * shown on every answered row because it is the cost of that row, and this is
 * the only screen where the cost is visible per question rather than in total.
 */
function Row({ field }: { field: FieldProgress }) {
  const mark = MARK[field.state];

  return (
    <li className="flex items-start gap-2 px-1 py-1">
      <span className={`mt-px w-3 shrink-0 text-center font-mono text-[13px] ${mark.tone}`}>
        {mark.glyph}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-muted">
          {field.label}
          {field.required && <span className="text-faint"> *</span>}
        </span>

        {field.state === 'filled' ? (
          <span className="block truncate font-mono text-[12px] text-parchment">
            {field.value}
            <span className="text-faint"> · {TIER_LABEL[field.tier ?? 5]}</span>
          </span>
        ) : field.state === 'needs-you' ? (
          <span className="block font-mono text-[12px] text-warn">over to you</span>
        ) : null}
      </span>
    </li>
  );
}
