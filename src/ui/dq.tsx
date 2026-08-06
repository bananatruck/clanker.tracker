/**
 * The Dragon Quest UI kit.
 *
 * Every screen is built from these four things — a window, a menu row, a
 * button, and a marker — because that is genuinely all a DQ menu ever had.
 * Keeping the vocabulary this small is what stops the extension drifting back
 * into looking like a web app with a pixel font bolted on.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Confidence } from '@/types/profile';

/* ------------------------------------------------------------------ window */

export function Window({
  title,
  right,
  children,
  className = '',
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dq-window ${className}`}>
      {title !== undefined && (
        <header className="flex items-baseline justify-between gap-2 border-b-2 border-frame-dim px-2 py-1">
          <h2 className="dq-label">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-2">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------- menu */

export function MenuItem({
  selected = false,
  onClick,
  disabled,
  children,
}: {
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="dq-item text-[11px]"
      data-selected={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ button */

export function Button({
  onClick,
  disabled,
  primary = false,
  type = 'button',
  className = '',
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`dq-btn ${primary ? 'dq-btn-primary' : ''} px-2.5 py-1 text-[11px] ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ marker */

/**
 * Confidence marker.
 *
 * The glyph is the message and the colour is reinforcement, never the other
 * way round — someone who cannot separate green from red still has to be able
 * to tell a parsed phone number from a guessed one.
 */
const MARK: Record<Confidence, { glyph: string; tone: string; hint: string }> = {
  certain: { glyph: '✔', tone: 'text-ok', hint: 'Parsed with certainty' },
  guessed: { glyph: '?', tone: 'text-warn', hint: 'Best guess — please confirm' },
  missing: { glyph: '✖', tone: 'text-bad', hint: 'Not found in the resume' },
};

export function Mark({ confidence }: { confidence: Confidence }) {
  const { glyph, tone, hint } = MARK[confidence];
  return (
    <span title={hint} aria-label={hint} className={`shrink-0 font-mono text-[10px] ${tone}`}>
      {glyph}
    </span>
  );
}

/* ------------------------------------------------------------------- meter */

/** A stepped meter. Whole cells only — DQ never drew a continuous bar. */
export function Meter({ value, cells = 20 }: { value: number; cells?: number }) {
  const on = Math.round(Math.max(0, Math.min(1, value)) * cells);
  return (
    <div className="dq-meter" role="presentation">
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className="dq-meter-cell" data-on={i < on} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- editable */

/**
 * Click-to-edit text. Enter commits, Escape abandons, blur commits — the last
 * because losing an edit to a stray click is the kind of small betrayal that
 * makes people stop trusting a form.
 */
export function Editable({
  value,
  onCommit,
  placeholder = '—',
  className = '',
}: {
  value: string;
  onCommit: (next: string) => void | Promise<void>;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draft !== null) input.current?.focus();
  }, [draft !== null]);

  const commit = () => {
    if (draft !== null && draft.trim() !== value) void onCommit(draft.trim());
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <input
        ref={input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(null);
        }}
        className={`dq-input min-w-0 flex-1 px-1 py-0.5 text-[11px] ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(value)}
      className={`min-w-0 flex-1 truncate px-1 py-0.5 text-left text-[11px] hover:bg-window-hi ${className}`}
    >
      {value ? value : <span className="text-faint">{placeholder}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ notice */

export function Notice({ tone = 'muted', children }: { tone?: 'muted' | 'bad'; children: ReactNode }) {
  return (
    <p
      className={`border-2 px-2 py-1.5 text-[11px] leading-snug ${
        tone === 'bad' ? 'border-bad text-bad' : 'border-frame-dim text-muted'
      }`}
    >
      {children}
    </p>
  );
}
