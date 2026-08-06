/**
 * Managing the writing samples that give a cover letter its voice.
 *
 * Shared by setup and settings so the two cannot drift — this is collected
 * once during onboarding and then revisited whenever a letter comes back
 * sounding wrong, and both paths need to behave the same.
 *
 * Samples are stored whole. A model given three real paragraphs of someone's
 * prose matches them far better than one handed a list of adjectives about
 * their tone, and whole text stays legible and deletable in a way a derived
 * style vector never would.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addWritingSample, deleteWritingSample, writingSamples } from '@/lib/db/repo';
import { Button } from './dq';

export default function WritingSamples() {
  const samples = useLiveQuery(() => writingSamples(), [], []);
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');

  return (
    <>
      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void addWritingSample(label, text);
          setLabel('');
          setText('');
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What is this? e.g. cover letter, Acme"
          className="dq-input w-full px-2 py-1 text-[11px]"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste something you wrote that sounds like you — an old cover letter, an essay, a long email."
          className="dq-input w-full p-2 text-[11px] leading-snug"
        />
        <Button type="submit" disabled={!text.trim()}>
          Add sample
        </Button>
      </form>

      {samples.length > 0 && (
        <ul className="mt-2 space-y-1">
          {samples.map((s) => (
            <li key={s.id} className="flex items-center gap-2 border-2 border-frame-dim px-2 py-1">
              <span className="min-w-0 flex-1 truncate text-[11px] text-parchment">{s.label}</span>
              <span className="shrink-0 font-mono text-[10px] text-faint">
                {s.text.split(/\s+/).filter(Boolean).length} words
              </span>
              <button
                type="button"
                title="Remove"
                onClick={() => void deleteWritingSample(s.id)}
                className="shrink-0 font-mono text-[10px] text-faint hover:text-bad"
              >
                ✖
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
