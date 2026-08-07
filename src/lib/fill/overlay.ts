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
  width: 360px; max-height: calc(100vh - 32px); display: flex; flex-direction: column;
  overflow: hidden; background: #fffaf0; color: #2a1e10;
  border: 1px solid rgba(96,72,43,.62); border-radius: 14px;
  box-shadow: 0 20px 60px rgba(7,20,14,.34), 0 3px 10px rgba(7,20,14,.18);
  font: 12px/1.5 ui-monospace, 'JetBrains Mono', 'SF Mono', monospace;
}
header { display: flex; align-items: baseline; justify-content: space-between;
  padding: 10px 12px; color: #f6fbf7;
  background: linear-gradient(180deg, #2e7a4d, #205f3b);
  border-bottom: 1px solid #123e27; }
h2 { margin: 0; font: inherit; font-size: 13px; font-weight: 700; }
.accent { color: #f0c45d; }
.meta { font-size: 10px; color: rgba(246,251,247,.72); }
.bark { padding: 8px 12px; color: #6c4a09; background: #f8e8bb;
  border-bottom: 1px solid #d7c59f; font-size: 11px; font-style: italic; }
.list { overflow-y: auto; padding: 5px 8px; flex: 1; background: #fffaf0; }
.row { display: grid; grid-template-columns: 14px 1fr; gap: 7px; padding: 8px 4px;
  border-bottom: 1px solid #eadfc6; }
.row:last-child { border-bottom: 0; }
.row:hover { background: #f7efdc; }
.bar { font-size: 10px; line-height: 1.4; text-align: center; }
.certain { color: #278346; }
.guessed { color: #b76b07; }
.missing { color: #ba392f; }
.t-certain { color: #9ce5ad; }
.t-guessed { color: #ffd477; }
.t-missing { color: #ff9990; }
label { display: block; font-size: 10px; line-height: 1.3; color: #66543b;
  margin-bottom: 3px; word-break: break-word; }
/* Form controls do not inherit typography, and the \`font\` shorthand rejects
   \`inherit\` as a family — which silently left every value in the overlay in the
   browser's default sans-serif, in the middle of a monospace design. */
input { width: 100%; box-sizing: border-box; background: #ffffff; color: #2a1e10;
  border: 1px solid #d7c59f; border-radius: 6px; padding: 5px 7px;
  font-family: inherit; font-size: 11px; line-height: 1.4; }
input:focus { outline: 2px solid rgba(32,95,59,.18); border-color: #2e7a4d; }
.tier { font-size: 9px; color: #8b7858; margin-top: 3px; }
footer { display: flex; gap: 7px; padding: 9px 10px; border-top: 1px solid #d7c59f;
  background: #f5ead1; }
button { flex: 1; border: 1px solid #60482b; border-radius: 7px; padding: 7px 5px;
  background: #fffaf0; color: #2a1e10; cursor: pointer;
  font-family: inherit; font-size: 11px; line-height: 1;
  box-shadow: 0 2px 5px rgba(42,30,16,.14); }
button:hover { background: #f0e4c8; }
button:active { transform: translateY(1px); box-shadow: none; }
button.primary { background: #205f3b; color: #ffffff; border-color: #17472d; }
button.primary:hover { background: #2e7a4d; }
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

/** Text is inserted into innerHTML, and a field label is page-controlled. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Show the overlay and resolve once the user accepts or cancels.
 *
 * Resolves with `submitted: false` on cancel so the caller can abandon the run
 * without applying anything.
 *
 * `bark` is the skirmish line for the player's current tier, straight from the
 * storyboard. It is one line and it is decoration — it must never delay or
 * obstruct the review, which is the only thing standing between a resolver
 * guess and a submitted application.
 */
export function showReview(
  rows: readonly ReviewRow[],
  llmCalls: number,
  bark: string | null = null,
): Promise<ReviewOutcome> {
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
      ${bark ? `<div class="bark">${escapeHtml(bark)}</div>` : ''}
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
