# Feature and publication audit

Audited against the functional-overhaul branch on 2026-08-24.
“Implemented” here means a user-facing route reaches the behavior; a pure function and a passing unit test do not count as a shipped feature by themselves.

## Publication status

| Surface | Status | What is actually public |
|---|---|---|
| Source repository | **Published** | The public `main` branch contains the UI and sprite-seam revamp merged in PR #1. |
| GitHub release | **Published** | `v0.0.2` contains the redesigned extension built from a clean checkout. Like all public bundles, it uses the complete fallback renderer because the raw sprite pack is not tracked. |
| Landing page | **Published** | GitHub Pages is assembled from the refreshed site and committed production screenshots. |
| Chrome Web Store | **Not published** | No store listing was found and M9 still names the store listing as unfinished. Installation is by release ZIP or “Load unpacked.” |
| Public sprite pack | **Not in the public release** | The 421 files currently under `public/Sprites/` are copied into a local production build, but the folder is gitignored and absent from the public repository/release. Their provenance must be resolved before publishing them. |
| This UI/sprite revamp | **Published** | The implementation is on `main`, documented by the refreshed site/README, and packaged in `v0.0.2`. Installed public art remains local-only. |
| Logo, guided setup, and account-wall update | **Not published yet** | Implemented and verified in this working tree; it still needs a deliberate commit/release before users receive it. |

## User-facing feature matrix

| Area | Promise | Status | Evidence / gap |
|---|---|---|---|
| Resume | Upload PDF, DOCX, TXT, or Markdown and parse locally | **Implemented** | `ResumeIntake` calls the local extractors and stores a structured profile. Paste fallback is also wired. |
| Resume | Review and correct contact, roles, education, and skills | **Implemented** | The Profile route edits the same stored profile used by scan and fill. |
| Resume | Upload the original resume to an application | **Implemented** | The exact selected file is retained in IndexedDB, shown in review, and attached only after approval. |
| Posting | Read the active page automatically | **Implemented** | The Scan route asks the selected content-script frame for structured data, known selectors, or the densest text block. Paste remains available. |
| ATS scan | Requirement-to-evidence table without a model call | **Implemented** | Scan extraction, evidence matching, gaps, and persisted scan records are wired into the UI. |
| Cover letter | Generate only from grounded evidence | **Implemented** | The Scan route exposes generation, saves letters, supports edits, copying, deletion, voice samples, and budget handling. |
| Cover letter | Attach the generated letter to the application | **Not implemented** | No generated file/blob is connected to a page file input. |
| Fill | Known ATS adapters plus generic active-tab injection | **Implemented** | Greenhouse, Lever, Ashby, Workable, Workday, LinkedIn, SmartRecruiters, iCIMS, and Jobvite run declaratively; generic pages use active-tab injection after a user gesture. |
| Fill | Open shadow-root and best-iframe discovery | **Implemented** | Harvesting walks open roots and `bestFormFrame` probes frames before the run. Closed roots remain inaccessible by browser design. |
| Fill | Five-tier resolver with one batched model fallback | **Implemented** | Adapter/autocomplete, answer memory, exact labels, fuzzy labels, and model fallback all feed the review overlay. |
| Fill | Review every proposed value before writing | **Implemented** | The page overlay exposes the source tier, corrections, empty fields, and cancel/approve outcomes. |
| Fill | Learn accepted/corrected answers | **Implemented** | Approved rows call `rememberAnswer`; repeat questions are resolved from IndexedDB. |
| Fill | Edit answer memory directly | **Implemented** | Settings lists scoped learned answers with search, inline correction, and deletion. |
| Fill | Page launcher starts the run | **Partial** | Detection and the dismissible launcher are wired with the product crest. Clicking opens the side panel at the application rather than invoking Fill invisibly. |
| Fill | Classify signup/login/confirmation walls | **Implemented** | `readGate` drives launcher copy and the explicit Fill path: signup/login can prepare saved fields, confirmation-email stops with the correct next action, and ordinary pages continue to the application resolver. |
| Fill | Use stored sign-in details to prepare account walls | **Implemented** | Setup/Settings store and erase credentials. On an explicit Fill action the content script requests them from the background worker, calls `fillGate`, dispatches controlled-input events, reports what it prepared, and never presses the account button. Confirmation-email walls remain human-only. |
| Fill | Ordered account → fill → letter → confirm flow | **Partial** | The account and form stages are both user-facing, but navigation between them is still user-driven and `stage.ts` is not yet the runtime orchestrator. Cover-letter file attachment and final submission remain separate/manual. |
| Fill | Multi-step application support | **Implemented with manual navigation** | A durable tab session checkpoints semantic paths and page signatures across same-URL SPA steps and navigation. The user still reviews each page and presses Next. |
| Fill | Live per-field checklist | **Implemented** | Content-script progress broadcasts drive the FillRun battle/checklist view. |
| Fill | Submission boundary | **Implemented** | Autofill always stops after reviewed writes. The user advances and submits; no dead auto-submit policy is presented as a feature. |
| Tracker | Log only after a real submission | **Implemented** | Submit events and clicks record intent only. Applied requires explicit success text, a vendor confirmation marker, or a confirmation route, with durable recovery after navigation. |
| Tracker | Automatic opportunity lifecycle | **Implemented** | Structured postings upsert once as Saved, an explicit fill advances the same canonical row to In progress, and confirmation advances it to Applied. |
| Tracker | Manual logging for email/hand applications | **Implemented** | The tracker Add form can save a posting or record an already-sent application through the same deduplicating repository. |
| Tracker | Board, list/table, nine editable columns, and rollups | **Implemented** | Both narrow and wide tracker views use the same records and inline update repository. |
| Tracker | RFC 4180/Notion-named CSV export with formula neutralization | **Implemented** | Export is wired in Tracker and covered by unit tests. |
| Tracker | Quiet-after-30-days signal | **Implemented** | Stale records are derived and surfaced without changing status automatically. |
| Tracker | Search, filters, reminders, tags, notes, and timeline | **Implemented** | Board, table, and list share multi-field search, lifecycle and Needs action filters, locale-safe follow-up dates, structured location, normalized tags, editable notes, and durable activity events. |
| Tracker | `.clankdb` import/export | **Implemented** | Settings exports and atomically restores a versioned snapshot of every durable Dexie table, including resume bytes. Keys, passwords, and transient tab sessions are excluded. |
| Game | DP ledger, levels, tiers, march, achievements, and Adoption | **Implemented** | All are derived from applications/deeds; an accepted offer gates the ending. |
| Game | Story beats and Act V bark silence | **Implemented** | Lore is wired to the Crusade screen and tested against the storyboard; `barkFor` returns no bark in the final act. |
| Game | Standalone level-up fanfare | **Not implemented** | The README says it is switched off in Act V, but there is no runtime fanfare system to switch on in earlier acts. |
| Game | Rally timing bonus | **Math only** | Multipliers are tested and repository methods accept a rally grade, but no interaction produces or passes one. |
| Game | Idle return trickle/bonus | **Math only** | `idleTrickle` and trailing-week DP exist, but no runtime reads time-away state or records an idle deed. |
| Game art | Actors, encounters, bosses, items, swords, and act backgrounds from `public/Sprites/` | **Implemented locally** | The build copies all 421 files and the runtime decodes them. This revamp also routes Title, Acts, Scene, both dashboards, and the launcher through public art seams. Public release status is separate above. |
| Game art | Procedural fallback with no installed art | **Implemented** | Built-in 32×32 sprites and deterministic act painter remain the decode/missing-file fallback. |
| Data | Local-first profile, answers, scans, letters, applications, runs, and deeds | **Implemented** | Dexie owns application data; the background worker mediates content-script access. |
| Secrets | API key and sign-in details outside IndexedDB | **Implemented** | Both use `chrome.storage.local`; Settings can erase saved sign-in details. They are not encrypted at rest. |
| Privacy | No backend, telemetry, or analytics | **Implemented** | No project backend or telemetry path is present. Provider requests occur for cover letters and unresolved fill fields when configured. |
| UI | Guided first-install setup, side panel, and full-page dashboard | **Implemented** | Install opens a persistent seven-step campaign: required resume intake, application defaults/account assistance, optional provider test, optional voice samples, a feature field guide/readiness audit, and dashboard launch. The toolbar always opens the panel synchronously; an unfinished profile links back to Resume from the panel. |

## Highest-priority product gaps

1. Attach an optional generated cover letter as a reviewed file rather than leaving it as copyable text only.
2. Unify the already-wired account, page-fill, letter, and confirmation stages behind one runtime controller without advancing or submitting for the user.
3. Resolve provenance and redistribution rights for `public/Sprites/` before adding those files to a public release or Chrome Web Store submission.
