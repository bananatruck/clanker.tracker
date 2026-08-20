/**
 * The profile review grid — "check your own details".
 *
 * This screen is the reason the parser is allowed to be cheap. Every extracted
 * value is shown with its confidence, and one click fixes it, which is faster
 * *and* free compared to spending an LLM call and still being wrong. Anything
 * the user touches is promoted to `certain`/`user` and no later re-parse may
 * overwrite it.
 *
 * Everything here is editable, not just the contact block: the fill engine
 * sends whatever is on this screen, so anything it can send has to be
 * correctable from it.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { reparse } from '@/lib/resume/parse';
import { parseResumeDate } from '@/lib/resume/dates';
import {
  correctContactField,
  correctEducation,
  correctExperience,
  correctProject,
  deleteProfile,
  getProfile,
  removeEntry,
  saveProfile,
  setSkills,
} from '@/lib/db/repo';
import {
  CONTACT_KEYS,
  CONTACT_LABELS,
  profileCompleteness,
  type ContactKey,
  type ResumeDate,
  type ResumeProfile,
} from '@/types/profile';
import { Button, Editable, Mark, Window } from '@/ui/dq';
import ResumeIntake from '@/ui/ResumeIntake';

export default function Profile() {
  const profile = useLiveQuery(() => getProfile(), []);

  if (profile === undefined) return <p className="text-[13px] text-faint">Loading…</p>;

  if (!profile) {
    return (
      <div className="space-y-2">
        <Window title="No resume yet">
          <p className="text-[13px] leading-snug text-muted">
            Nothing can be filled until there is a resume to fill from. Add one and every field
            below becomes editable.
          </p>
        </Window>
        <ResumeIntake />
      </div>
    );
  }

  return <ProfileGrid profile={profile} />;
}

function ProfileGrid({ profile }: { profile: ResumeProfile }) {
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { total, certain, missing } = profileCompleteness(profile);

  return (
    <div className="space-y-2">
      <Window
        title={profile.source.fileName}
        right={
          <span className="font-mono text-[12px] text-muted">
            <span className="text-gold">{certain}</span>/{total}
            {missing > 0 && <span className="text-bad"> · {missing} missing</span>}
          </span>
        }
      >
        <div className="flex flex-wrap gap-1">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await saveProfile(reparse(profile));
              setBusy(false);
            }}
          >
            Re-parse
          </Button>
          <Button onClick={() => setReplacing((v) => !v)}>
            {replacing ? 'Cancel upload' : 'Upload a different resume'}
          </Button>
          <Button
            onClick={() => {
              if (confirm('Delete this profile? Your applications and DP are kept.')) {
                void deleteProfile();
              }
            }}
          >
            Delete
          </Button>
        </div>

        {replacing && (
          <div className="mt-2">
            <ResumeIntake onDone={() => setReplacing(false)} />
          </div>
        )}
      </Window>

      <Window title="Contact">
        <div className="divide-y-2 divide-frame-dim">
          {CONTACT_KEYS.map((key) => (
            <ContactRow key={key} field={key} profile={profile} />
          ))}
        </div>
      </Window>

      <Window title={`Experience · ${profile.experience.length}`}>
        {profile.experience.length === 0 ? (
          <p className="text-[13px] leading-snug text-muted">
            No work history parsed. Check the resume has an <em>Experience</em> heading, or re-add
            it as pasted text.
          </p>
        ) : (
          <div className="space-y-2">
            {profile.experience.map((entry) => (
              <article key={entry.id} className="dq-window p-2">
                <div className="flex items-start gap-1.5">
                  <Mark confidence={entry.confidence} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex">
                      <Editable
                        value={entry.title}
                        placeholder="title not found"
                        onCommit={(title) => correctExperience(entry.id, { title })}
                        className="text-parchment"
                      />
                    </div>
                    <div className="flex">
                      <Editable
                        value={entry.company}
                        placeholder="company not found"
                        onCommit={(company) => correctExperience(entry.id, { company })}
                        className="text-muted"
                      />
                    </div>
                    <div className="flex">
                      <Editable
                        value={entry.location}
                        placeholder="location not found"
                        onCommit={(location) => correctExperience(entry.id, { location })}
                        className="text-faint"
                      />
                    </div>
                    <DateEditors
                      start={entry.start}
                      end={entry.end}
                      presentWhenEmpty
                      onStart={(start) => correctExperience(entry.id, { start })}
                      onEnd={(end) => correctExperience(entry.id, { end })}
                    />
                  </div>
                  <button
                    type="button"
                    title="Remove this entry"
                    onClick={() => void removeEntry('experience', entry.id)}
                    className="shrink-0 px-1 font-mono text-[12px] text-faint hover:text-bad"
                  >
                    ✖
                  </button>
                </div>

                <ul className="mt-1.5 space-y-0.5">
                  {entry.bullets.map((bullet, i) => (
                    <li key={i} className="flex gap-1 text-[13px] leading-snug text-muted">
                      <span className="shrink-0 text-faint">·</span>
                      <Editable
                        value={bullet}
                        onCommit={(next) =>
                          correctExperience(entry.id, {
                            bullets: next
                              ? entry.bullets.map((b, j) => (j === i ? next : b))
                              : entry.bullets.filter((_, j) => j !== i),
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() =>
                    void correctExperience(entry.id, { bullets: [...entry.bullets, 'New bullet'] })
                  }
                  className="mt-1 px-1 font-mono text-[12px] text-faint hover:text-gold"
                >
                  + bullet
                </button>
              </article>
            ))}
          </div>
        )}
        <p className="mt-2 text-[12px] leading-snug text-faint">
          These bullets are the evidence the keyword scan matches a posting against. Sharpening
          them here sharpens every scan.
        </p>
      </Window>

      <Window title={`Education · ${profile.education.length}`}>
        {profile.education.length === 0 ? (
          <p className="text-[13px] text-muted">Nothing parsed.</p>
        ) : (
          <div className="space-y-2">
            {profile.education.map((entry) => (
              <article key={entry.id} className="dq-window p-2">
                <div className="flex items-start gap-1.5">
                  <Mark confidence={entry.confidence} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex">
                      <Editable
                        value={entry.school}
                        placeholder="school not found"
                        onCommit={(school) => correctEducation(entry.id, { school })}
                        className="text-parchment"
                      />
                    </div>
                    <div className="flex">
                      <Editable
                        value={entry.degree}
                        placeholder="degree not found"
                        onCommit={(degree) => correctEducation(entry.id, { degree })}
                        className="text-muted"
                      />
                    </div>
                    <div className="flex">
                      <Editable
                        value={entry.fieldOfStudy}
                        placeholder="field of study not found"
                        onCommit={(fieldOfStudy) => correctEducation(entry.id, { fieldOfStudy })}
                        className="text-faint"
                      />
                    </div>
                    <div className="flex gap-1">
                      <Editable
                        value={entry.location}
                        placeholder="location"
                        onCommit={(location) => correctEducation(entry.id, { location })}
                        className="text-faint"
                      />
                      <Editable
                        value={entry.gpa}
                        placeholder="GPA"
                        onCommit={(gpa) => correctEducation(entry.id, { gpa })}
                        className="text-faint"
                      />
                    </div>
                    <DateEditors
                      start={entry.start}
                      end={entry.end}
                      onStart={(start) => correctEducation(entry.id, { start })}
                      onEnd={(end) => correctEducation(entry.id, { end })}
                    />
                  </div>
                  <button
                    type="button"
                    title="Remove this entry"
                    onClick={() => void removeEntry('education', entry.id)}
                    className="shrink-0 px-1 font-mono text-[12px] text-faint hover:text-bad"
                  >
                    ✖
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Window>

      <Projects profile={profile} />

      <Skills profile={profile} />
    </div>
  );
}

const dateText = (date: ResumeDate | null): string => {
  if (!date) return '';
  return date.month === null
    ? String(date.year)
    : `${String(date.month).padStart(2, '0')}/${date.year}`;
};

const editedDate = (raw: string, current: ResumeDate | null): ResumeDate | null => {
  if (!raw || /^(present|current|now)$/i.test(raw)) return null;
  return parseResumeDate(raw) ?? current;
};

function DateEditors({
  start,
  end,
  presentWhenEmpty = false,
  onStart,
  onEnd,
}: {
  start: ResumeDate | null;
  end: ResumeDate | null;
  presentWhenEmpty?: boolean;
  onStart: (value: ResumeDate | null) => void | Promise<void>;
  onEnd: (value: ResumeDate | null) => void | Promise<void>;
}) {
  return (
    <div className="flex items-center gap-1 px-1 font-mono text-[12px] text-faint">
      <span className="shrink-0">Dates</span>
      <Editable
        value={dateText(start)}
        placeholder="start YYYY"
        onCommit={(raw) => onStart(editedDate(raw, start))}
      />
      <span>→</span>
      <Editable
        value={dateText(end) || (presentWhenEmpty ? 'Present' : '')}
        placeholder="end YYYY"
        onCommit={(raw) => onEnd(editedDate(raw, end))}
      />
    </div>
  );
}

function Projects({ profile }: { profile: ResumeProfile }) {
  return (
    <Window title={`Projects · ${profile.projects.length}`}>
      {profile.projects.length === 0 ? (
        <p className="text-[13px] leading-snug text-muted">
          No projects parsed. A Projects heading in your resume creates reusable project records
          for applications and evidence scans.
        </p>
      ) : (
        <div className="space-y-2">
          {profile.projects.map((project) => (
            <article key={project.id} className="dq-window p-2">
              <div className="flex items-start gap-1.5">
                <Mark confidence={project.confidence} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex">
                    <Editable
                      value={project.name}
                      placeholder="project name not found"
                      onCommit={(name) => correctProject(project.id, { name })}
                      className="text-parchment"
                    />
                  </div>
                  <div className="flex">
                    <Editable
                      value={project.role}
                      placeholder="your role"
                      onCommit={(role) => correctProject(project.id, { role })}
                      className="text-muted"
                    />
                  </div>
                  <div className="flex">
                    <Editable
                      value={project.url}
                      placeholder="project URL"
                      onCommit={(url) => correctProject(project.id, { url })}
                      className="text-faint"
                    />
                  </div>
                  <div className="flex">
                    <Editable
                      value={project.technologies.join(', ')}
                      placeholder="technologies"
                      onCommit={(value) =>
                        correctProject(project.id, {
                          technologies: [...new Set(
                            value.split(',').map((item) => item.trim()).filter(Boolean),
                          )],
                        })
                      }
                      className="text-faint"
                    />
                  </div>
                  <DateEditors
                    start={project.start}
                    end={project.end}
                    onStart={(start) => correctProject(project.id, { start })}
                    onEnd={(end) => correctProject(project.id, { end })}
                  />
                </div>
                <button
                  type="button"
                  title="Remove this project"
                  onClick={() => void removeEntry('project', project.id)}
                  className="shrink-0 px-1 font-mono text-[12px] text-faint hover:text-bad"
                >
                  ✖
                </button>
              </div>

              <ul className="mt-1.5 space-y-0.5">
                {project.bullets.map((bullet, index) => (
                  <li key={index} className="flex gap-1 text-[13px] leading-snug text-muted">
                    <span className="shrink-0 text-faint">·</span>
                    <Editable
                      value={bullet}
                      onCommit={(next) =>
                        correctProject(project.id, {
                          bullets: next
                            ? project.bullets.map((item, i) => (i === index ? next : item))
                            : project.bullets.filter((_, i) => i !== index),
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  void correctProject(project.id, {
                    bullets: [...project.bullets, 'New bullet'],
                  })
                }
                className="mt-1 px-1 font-mono text-[12px] text-faint hover:text-gold"
              >
                + bullet
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="mt-2 text-[12px] leading-snug text-faint">
        Dates accept YYYY, MM/YYYY, or a month name. Every edit becomes a trusted local fact.
      </p>
    </Window>
  );
}

/**
 * Skills are mined loosely — any capitalised token in a bullet is a candidate —
 * so this list arrives with noise in it by design. Pruning is expected, and
 * every prune makes the scan more accurate.
 */
function Skills({ profile }: { profile: ResumeProfile }) {
  const [adding, setAdding] = useState('');

  return (
    <Window title={`Skills · ${profile.skills.length}`}>
      <div className="flex flex-wrap gap-1">
        {profile.skills.map((skill) => (
          <button
            key={skill}
            type="button"
            title="Remove"
            onClick={() => void setSkills(profile.skills.filter((s) => s !== skill))}
            className="border-2 border-frame-dim px-1.5 py-0.5 font-mono text-[12px] text-muted hover:border-bad hover:text-bad"
          >
            {skill} ✖
          </button>
        ))}
      </div>

      <form
        className="mt-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!adding.trim()) return;
          void setSkills([...profile.skills, adding]);
          setAdding('');
        }}
      >
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Add a skill"
          className="dq-input min-w-0 flex-1 px-1.5 py-0.5 text-[13px]"
        />
        <Button type="submit" disabled={!adding.trim()}>
          Add
        </Button>
      </form>
    </Window>
  );
}

/** One editable contact cell. Editing it promotes the field to `user`/certain. */
function ContactRow({ field, profile }: { field: ContactKey; profile: ResumeProfile }) {
  const value = profile.contact[field];

  return (
    <div className="flex items-center gap-1.5 py-1">
      <Mark confidence={value.confidence} />
      <span className="w-20 shrink-0 font-mono text-[12px] text-faint">
        {CONTACT_LABELS[field]}
      </span>
      <Editable
        value={value.value}
        onCommit={(next) => correctContactField(field, next)}
        className={value.value ? 'text-parchment' : ''}
      />
      {value.source === 'user' && (
        <span className="shrink-0 font-mono text-[11px] text-ok">edited</span>
      )}
    </div>
  );
}
