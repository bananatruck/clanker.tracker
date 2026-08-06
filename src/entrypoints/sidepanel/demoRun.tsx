/**
 * The split-screen fill, frozen mid-run, for the screenshot set.
 *
 * A live run only exists for about a second on a page the photographer is not
 * on, so it gets a route with fixture progress in it. The component is the
 * shipping one; only the `FillProgress` is made up, and it is made up to be
 * unflattering — most rows answered for free, one from the model, two handed
 * back because inventing them would have been worse than asking.
 */
import type { FillProgress } from '@/lib/fill/progress';
import FillRun from '@/ui/game/FillRun';
import Title from '@/ui/game/Title';
import Scene from '@/ui/game/Scene';
import Acts from '@/ui/game/Acts';
import { ACTORS, encounterFor } from '@/lib/game/atlas';
import '@/ui/tokens.css';

const PROGRESS: FillProgress = {
  phase: 'writing',
  ats: 'greenhouse',
  llmCalls: 1,
  fields: [
    { id: '1', label: 'First name', required: true, state: 'filled', value: 'Ada', tier: 1 },
    { id: '2', label: 'Last name', required: true, state: 'filled', value: 'Okafor', tier: 1 },
    { id: '3', label: 'Email', required: true, state: 'filled', value: 'ada.okafor@example.com', tier: 1 },
    { id: '4', label: 'Phone', required: true, state: 'filled', value: '+44 7700 900412', tier: 1 },
    { id: '5', label: 'Current location', required: false, state: 'filled', value: 'London, UK', tier: 3 },
    { id: '6', label: 'LinkedIn profile', required: false, state: 'filled', value: 'linkedin.com/in/adaokafor', tier: 2 },
    { id: '7', label: 'Are you legally authorised to work in the UK?', required: true, state: 'filled', value: 'Yes', tier: 2 },
    { id: '8', label: 'Will you require visa sponsorship?', required: true, state: 'filled', value: 'No', tier: 2 },
    { id: '9', label: 'What is your notice period?', required: false, state: 'filled', value: '1 month', tier: 2 },
    { id: '10', label: 'Earliest date you could join us', required: false, state: 'filled', value: '1 month', tier: 4 },
    { id: '11', label: 'What draws you to settlement infrastructure?', required: false, state: 'filled', value: 'I have spent three years on a ledger that had to close every day.', tier: 5 },
    { id: '12', label: 'Salary expectations', required: true, state: 'pending', value: '', tier: null },
    { id: '13', label: 'Who referred you? (optional)', required: false, state: 'needs-you', value: '', tier: null },
  ],
};

export function DemoFillRun() {
  return (
    <div className="h-full bg-field p-2">
      <FillRun progress={PROGRESS} tier="warlord" company="Hexweave" />
    </div>
  );
}

/**
 * The encounter, held open.
 *
 * The transition is a little over a second long and then it is gone, which is
 * right for using it and impossible for photographing it. Same components,
 * same phase — `reading` is the phase a run genuinely starts in — with the
 * checklist still empty because at that instant it genuinely is.
 */
const OPENING: FillProgress = {
  phase: 'reading',
  ats: 'greenhouse',
  llmCalls: 0,
  fields: PROGRESS.fields.map((f) => ({ ...f, state: 'pending', value: '' })),
};

export function DemoEncounter() {
  return (
    <div className="h-full bg-field p-2">
      <FillRun progress={OPENING} tier="warlord" company="Hexweave" />
    </div>
  );
}

/** The title card, on the act it is most often first seen on. */
export function DemoTitle() {
  return (
    <div className="h-full bg-field p-2">
      <Title tier="squire" height={420} />
    </div>
  );
}

/**
 * The battle screen on its own, at page width — the README's hero image.
 *
 * Rendered without the panel around it because the point of that picture is
 * the composition: ground, foe, hero, message window. Cropping it out of a
 * side-panel screenshot would mean the hero image and the app drift apart the
 * first time the panel's chrome changes.
 */
export function DemoScene() {
  return (
    <div className="h-full bg-field p-2">
      <Scene
        tier="warlord"
        hero={ACTORS['khlaude-battle']!}
        foe={encounterFor(3)}
        speaker="Kh. Laude"
        line="The hamlet burns. Kh. Laude rides for Clankerdom. The dynasty trembles."
        size="page"
      />
    </div>
  );
}

/**
 * All five acts at once.
 *
 * The one frame that catches an act drawn wrong — a hut standing in the sky, a
 * ridge the same colour as the thing in front of it — because every other
 * screen shows exactly one of them and there is nothing to compare it against.
 */
export function DemoActs() {
  return (
    <div className="bg-field p-3">
      <Acts tier="warlord" level={28} />
    </div>
  );
}
