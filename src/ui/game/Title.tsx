/**
 * The title card.
 *
 * Shown while the ledger loads, which is a real moment — DP is the sum of a
 * table, so the Crusade screen genuinely cannot say anything true until that
 * table has been read. The alternative was a spinner, and a spinner is a
 * promise that something is happening; a title card is the game admitting it
 * is a game while it does the same thing.
 *
 * Composed the way a console title screen is: the ground behind, the name over
 * it in the serif the game speaks in, and one line underneath. No "press
 * start", because there is nothing to press — this clears itself.
 */
import type { Tier } from '@/lib/game/economy';
import Backdrop from '@/ui/game/Backdrop';

export default function Title({
  tier = 'squire',
  line = 'Loading the ledger…',
  height = 320,
}: {
  tier?: Tier;
  /** One line under the name. The caller's, not the game's. */
  line?: string;
  height?: number;
}) {
  return (
    <div className="dq-window relative overflow-hidden" style={{ height }} data-title={tier}>
      <div className="absolute inset-0" aria-hidden>
        <Backdrop tier={tier} />
        {/* The only place a tint is right: the title has to be legible over
            whichever act happens to be behind it, and unlike the battle screen
            there is nothing else on this frame to lose contrast. */}
        <div className="absolute inset-0" style={{ background: 'rgba(10, 13, 28, 0.28)' }} />
      </div>

      {/* Up in the sky rather than dead centre: centring puts the word on the
          horizon, where it competes with whatever that act has standing on
          it. Every act has an empty top third. */}
      <div className="dq-rise absolute inset-x-0 top-[22%] flex flex-col items-center px-4">
        <h1 className="dq-speech text-center leading-none">
          <span className="block text-[13px] tracking-[0.35em] text-window-hi">CLANKERDOM</span>
          <span
            className="mt-1 block text-[30px] font-bold tracking-wide text-gold"
            // A hard pixel shadow rather than a blur: the outline is what makes
            // the word readable over a bright meadow and a dark hall alike.
            style={{ textShadow: '2px 2px 0 #16100a, -1px -1px 0 #16100a' }}
          >
            DELIVERANCE
          </span>
        </h1>

        <p className="mt-3 font-mono text-[12px] text-window-hi">{line}</p>
      </div>
    </div>
  );
}
