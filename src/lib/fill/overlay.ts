/**
 * The review overlay.
 *
 * Lives in a closed-ish shadow root with its own styles, for two reasons: the
 * host page's CSS cannot reach in and wreck it, and our styles cannot leak out
 * and wreck the application form. Both matter when the "page" is an arbitrary
 * ATS we do not control.
 *
 * This is the default path, not a safety net. The extension fills and
 * highlights; the human reviews and submits. Auto-submit only ever skips this
 * screen on a site that has already earned it — see autosubmit.ts.
 */
import { TIER_LABEL, type HarvestedField, type Resolution, type ResolverTier } from './types';

/**
 * The DQ command window, restated in plain CSS.
 *
 * It cannot use the Tailwind tokens: this renders inside a shadow root on a
 * page we do not control, with no stylesheet of ours loaded. The values are
 * duplicated from ui/tokens.css deliberately — the alternative is injecting a
 * stylesheet into every job board, which is a far worse trade for four colours.
 */
const STYLE = `
:host { all: initial; }
.wrap {
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  width: 340px; max-height: calc(100vh - 32px); display: flex; flex-direction: column;
  background: #0e1a5c; color: #ffffff; border: 2px solid #ffffff;
  box-shadow: 0 0 0 2px #050a24;
  font: 12px/1.5 ui-monospace, 'JetBrains Mono', 'SF Mono', monospace;
}
header { display: flex; align-items: baseline; justify-content: space-between;
  padding: 6px 8px; border-bottom: 2px solid #6b78b8; }
h2 { margin: 0; font: 500 12px/1 inherit; }
.accent { color: #ffcf3f; }
.meta { font-size: 10px; color: #7d87b8; }
.list { overflow-y: auto; padding: 4px; flex: 1; }
.row { display: grid; grid-template-columns: 10px 1fr; gap: 6px; padding: 5px 4px; }
.row:hover { background: #1d2d86; }
.bar { font-size: 10px; line-height: 1.4; text-align: center; }
.certain, .t-certain { color: #6ede6e; }
.guessed, .t-guessed { color: #ffb347; }
.missing, .t-missing { color: #ff6f6f; }
label { display: block; font-size: 10px; line-height: 1.3; color: #b9c2e8;
  margin-bottom: 3px; word-break: break-word; }
input { width: 100%; box-sizing: border-box; background: #050a24; color: #ffffff;
  border: 2px solid #6b78b8; padding: 3px 5px; font: 11px/1.4 inherit; }
input:focus { outline: none; border-color: #ffcf3f; }
.tier { font-size: 9px; color: #7d87b8; margin-top: 3px; }
footer { display: flex; gap: 6px; padding: 6px 8px; border-top: 2px solid #6b78b8; }
button { flex: 1; border: 2px solid #ffffff; padding: 4px;
  background: #0e1a5c; color: #ffffff; font: 11px/1 inherit; cursor: pointer;
  box-shadow: 2px 2px 0 0 #050a24; }
button:hover { background: #1d2d86; }
button:active { transform: translate(2px, 2px); box-shadow: none; }
button.primary { background: #ffcf3f; color: #050a24; }
button.primary:hover { background: #c9a022; }
`;

/** Kept in step with the Mark component in ui/dq.tsx. */
const MARK_GLYPH = { certain: '✔', guessed: '?', missing: '✖' } as const;
const MARK_HINT = {
  certain: 'Resolved deterministically',
  guessed: 'Best guess — check this one',
  missing: 'Not answered — needs you',
} as const;

export interface ReviewRow {
  field: HarvestedField;
  resolution: Resolution | null;
}

export interface ReviewOutcome {
  /** Final values, after any edits. */
  values: Map<string, string>;
  /** Fields the user changed — these are what get written back to tier 2. */
  corrected: Set<string>;
  submitted: boolean;
}

/**
 * Show the overlay and resolve once the user accepts or cancels.
 *
 * Resolves with `submitted: false` on cancel so the caller can abandon the run
 * without applying anything.
 */
export function showReview(rows: readonly ReviewRow[], llmCalls: number): Promise<ReviewOutcome> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.setAttribute('data-clanker-overlay', '');
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLE;
    shadow.append(style);

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    const certain = rows.filter((r) => r.resolution?.confidence === 'certain').length;
    const guessed = rows.filter((r) => r.resolution?.confidence === 'guessed').length;
    const missing = rows.length - certain - guessed;

    wrap.innerHTML = `
      <header>
        <h2>clanker<span class="accent">.</span>tracker</h2>
        <span class="meta">
          <span class="t-certain">${certain}</span> ·
          <span class="t-guessed">${guessed}</span> ·
          <span class="t-missing">${missing}</span> ·
          ${llmCalls} call${llmCalls === 1 ? '' : 's'}
        </span>
      </header>
      <div class="list"></div>
      <footer>
        <button data-act="cancel">Cancel</button>
        <button data-act="apply" class="primary">Fill ${rows.length} fields</button>
      </footer>
    `;

    const list = wrap.querySelector('.list')!;
    const values = new Map<string, string>();
    const corrected = new Set<string>();

    for (const { field, resolution } of rows) {
      const confidence = resolution?.confidence ?? 'missing';
      const initial = resolution?.value ?? '';
      values.set(field.id, initial);

      const row = document.createElement('div');
      row.className = 'row';

      // A glyph, not a coloured stripe: this row has to be readable to someone
      // who cannot separate the green from the red, and it is the last screen
      // before an application goes out.
      const bar = document.createElement('div');
      bar.className = `bar ${confidence}`;
      bar.textContent = MARK_GLYPH[confidence];
      bar.title = MARK_HINT[confidence];

      const body = document.createElement('div');

      const labelEl = document.createElement('label');
      labelEl.textContent = field.label || field.name || field.id;

      const input = document.createElement('input');
      input.value = initial;
      input.addEventListener('input', () => {
        values.set(field.id, input.value);
        corrected.add(field.id);
        // A field the user has typed into is certain by definition.
        bar.className = 'bar certain';
        bar.textContent = MARK_GLYPH.certain;
        bar.title = MARK_HINT.certain;
      });

      const tier = document.createElement('div');
      tier.className = 'tier';
      tier.textContent = resolution
        ? `tier ${resolution.tier} · ${TIER_LABEL[resolution.tier as ResolverTier]}`
        : 'unanswered — needs you';

      body.append(labelEl, input, tier);
      row.append(bar, body);
      list.append(row);
    }

    const finish = (submitted: boolean) => {
      host.remove();
      resolve({ values, corrected, submitted });
    };

    wrap.querySelector('[data-act="cancel"]')!.addEventListener('click', () => finish(false));
    wrap.querySelector('[data-act="apply"]')!.addEventListener('click', () => finish(true));

    shadow.append(wrap);
    document.documentElement.append(host);
  });
}

/** Remove any overlay left behind by a previous run. */
export function clearOverlays(): void {
  for (const el of document.querySelectorAll('[data-clanker-overlay]')) el.remove();
}
