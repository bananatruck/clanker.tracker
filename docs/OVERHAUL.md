# Functional overhaul

This document is the acceptance contract for the post-`0.0.2` overhaul. It
separates code that builds from workflows that work in Chrome, and keeps the
repository honest about what has and has not been verified.

## Baseline (2026-08-20)

The clean `main` checkout passes all of its existing checks:

- TypeScript compilation
- 556 unit tests
- the WXT production build
- the static bundle/reference check

Those checks do **not** prove that Chrome installs the extension, injects the
content script, detects a live application, survives a multi-page application,
or records a successful submission. CI had no browser-level extension test.

The extension is already Manifest V3. The failure is therefore not a Manifest
V2 migration problem; it is a runtime integration and product-completeness
problem.

## Root causes found

1. **The built extension was never run in CI.** A valid manifest and importable
   chunks can still fail at installation, content-script registration, or
   runtime messaging.
2. **Declared support and automatic support disagree.** SmartRecruiters,
   iCIMS, and Jobvite adapters exist, but their hosts are absent from the
   content-script matches. The generic engine only starts after an `activeTab`
   gesture, so it cannot offer itself automatically.
3. **The field model describes 2010-era forms.** It harvests native inputs,
   textareas, and selects. It does not model ARIA comboboxes/radiogroups,
   switches, rich-text editors, repeatable history sections, or stable semantic
   paths.
4. **Writes are optimistic.** React and other controlled components can revert
   a value after the current event loop. The engine reports success without
   reading the field back after reconciliation.
5. **The profile is too shallow for an application.** Contact fields exist,
   but exact address/default data, projects, original resume bytes, and
   structured mappings for repeated work and education records do not.
6. **Files are intentionally skipped.** Resume and cover-letter inputs are
   excluded from review and cannot be populated.
7. **One page is treated as the whole application.** There is no durable,
   tab-scoped session for same-URL SPA steps, account walls, or navigation.
8. **Tracking observes intent, not confirmed outcome.** The watcher is armed
   only after a Clanker fill, logs as soon as a submit-looking control is
   clicked, expires after 30 minutes, and has no durable deduplication key.
9. **The tracker is a thin table.** It lacks saved/started states, automatic
   posting capture, search/filtering, follow-up dates, a timeline, backup, and
   safe import.
10. **Hot-page work is repeated.** Mutation handling can re-harvest the whole
    document after every render burst, including a full `querySelectorAll('*')`
    shadow-root walk.

## Product reference point

The target is reviewed autofill, not unattended submission. Simplify's public
workflow is a useful baseline: detect the application, fill resume/contact/
history/common questions, remember unique answers, let the person review and
submit, then add the result to the tracker. Open-source projects such as
[JobFill](https://github.com/Thesirloc/job-autofill),
[Emplorio](https://github.com/OElhwry/Emplorio), and
[jobmeta](https://github.com/voidd0/jobmeta) reinforce the same architectural
requirements: MV3, explicit ATS adapters plus a generic fallback, retained
resume files, controlled-widget writers, and local profile data.

Chrome's current extension model also matters:

- known hosts use declarative content scripts;
- unknown hosts use `activeTab` plus `chrome.scripting` after a user gesture;
- extension-owned persistence and privileged work stay outside the page's
  origin and cross contexts through messages;
- service-worker listeners are registered synchronously and durable state is
  persisted rather than held in worker globals.

## Acceptance criteria

### Extension runtime

- A production build is installed into a real Chrome instance in an automated
  smoke test.
- The test proves the built content script renders its launcher and exchanges
  messages with the service worker.
- Every advertised ATS host is present in the generated manifest, with a
  documented generic fallback for other sites.

### Autofill

- Native inputs, selects, radios, checkboxes, dates, phones, and textareas work.
- ARIA comboboxes, listboxes, radiogroups, switches, contenteditable controls,
  and open shadow roots are harvested and written through dedicated adapters.
- Every write is verified after the page settles and retried once before being
  reported as failed.
- Work, education, and project repeaters map each DOM group to the matching
  profile record instead of repeating record zero.
- Exact address/application defaults are user-authored; the engine never
  invents street, postcode, salary, eligibility, or demographic answers.
- The original resume is retained locally and attached only after appearing in
  review. Generated letters follow the same review rule.
- A tab-scoped session recognises a new step by URL and field signature,
  remains idempotent on the same step, and never presses Next or Submit.

### Tracker

- Opening or explicitly saving a posting creates/upserts one opportunity,
  without duplicates.
- Starting and successfully completing an application advance that same row.
- A submit click alone is not proof of success; confirmation DOM/navigation is
  required, with a manual correction path when a site cannot be recognised.
- Rows carry source, timestamps, follow-up date, tags, location, salary, notes,
  and an event timeline.
- Search, status filters, overdue/follow-up views, and useful funnel/time/cost
  summaries work on the same local data.
- A versioned export/import round-trip excludes credentials and rejects an
  incompatible or malformed backup without damaging existing data.

### Quality and efficiency

- Unit fixtures include captured or representative Greenhouse, Lever, Ashby,
  Workday, and generic controlled-widget forms.
- Typecheck, unit/integration tests, production build, bundle audit, and real
  Chrome smoke tests pass.
- Mutation work is debounced and signature-based; no full harvest runs when
  the relevant form state has not changed.
- Documentation distinguishes verified features, guarded/manual behavior, and
  remaining limitations.
