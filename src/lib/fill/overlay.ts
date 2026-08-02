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

const STYLE = `
:host { all: initial; }
.wrap {
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  width: 340px; max-height: calc(100vh - 32px); display: flex; flex-direction: column;
  background: #1e1e1e; color: #dcddde; border: 1px solid #333; border-radius: 6px;
  font: 13px/1.5 Inter, ui-sans-serif, system-ui, sans-serif;
  box-shadow: 0 8px 32px rgba(0,0,0,.5);
}
header { display: flex; align-items: baseline; justify-content: space-between;
  padding: 8px 10px; border-bottom: 1px solid #333; }
h2 { margin: 0; font: 500 13px/1 ui-monospace, monospace; letter-spacing: -.01em; }
.accent { color: #a882ff; }
.meta { font: 10px/1 ui-monospace, monospace; color: #6c6c6c; }
.list { overflow-y: auto; padding: 4px; flex: 1; }
.row { display: grid; grid-template-columns: 3px 1fr; gap: 8px;
  padding: 6px 6px 6px 4px; border-radius: 4px; }
.row:hover { background: #252525; }
.bar { border-radius: 2px; }
.certain { background: #4ec9b0; } .guessed { background: #d7a75c; } .missing { background: #d16969; }
.t-certain { color: #4ec9b0; } .t-guessed { color: #d7a75c; } .t-missing { color: #d16969; }
label { display: block; font: 10px/1.3 ui-monospace, monospace; color: #999;
  margin-bottom: 3px; word-break: break-word; }
input { width: 100%; box-sizing: border-box; background: #252525; color: #dcddde;
  border: 1px solid #333; border-radius: 3px; padding: 3px 5px; font: 12px/1.4 inherit; }
input:focus { outline: none; border-color: #7c5fd6; }
.tier { font: 9px/1 ui-monospace, monospace; color: #6c6c6c; margin-top: 3px; }
footer { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid #333; }
button { flex: 1; border: 1px solid #333; border-radius: 4px; padding: 5px;
  background: #252525; color: #dcddde; font: 11px/1 ui-monospace, monospace; cursor: pointer; }
button:hover { background: #2d2d2d; }
button.primary { background: #7c5fd6; border-color: #7c5fd6; }
button.primary:hover { background: #a882ff; }
`;

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

      const bar = document.createElement('div');
      bar.className = `bar ${confidence}`;

      const body = document.createElement('div');

      const labelEl = document.createElement('label');
      labelEl.textContent = field.label || field.name || field.id;

      const input = document.createElement('input');
      input.value = initial;
      input.addEventListener('input', () => {
        values.set(field.id, input.value);
        corrected.add(field.id);
        bar.className = 'bar certain';
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
