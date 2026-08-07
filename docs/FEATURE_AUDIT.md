# Feature and publication audit

Audited against the `main` working tree on 2026-08-07. “Implemented” here means a user-facing
route reaches the behavior; a pure function and a passing unit test do not count as a shipped
feature by themselves.

## Publication status

| Surface | Status | What is actually public |
|---|---|---|
| Source repository | **Published** | The public `main` branch contains the UI and sprite-seam revamp merged in PR #1. |
| GitHub release | **Published** | `v0.0.2` contains the redesigned extension built from a clean checkout. Like all public bundles, it uses the complete fallback renderer because the raw sprite pack is not tracked. |
| Landing page | **Published** | GitHub Pages is assembled from the refreshed site and committed production screenshots. |
| Chrome Web Store | **Not published** | No store listing was found and M9 still names the store listing as unfinished. Installation is by release ZIP or “Load unpacked.” |
| Public sprite pack | **Not in the public release** | The 421 files currently under `public/Sprites/` are copied into a local production build, but the folder is gitignored and absent from the public repository/release. Their provenance must be resolved before publishing them. |
| This UI/sprite revamp | **Published** | The implementation is on `main`, documented by the refreshed site/README, and packaged in `v0.0.2`. Installed public art remains local-only. |

## User-facing feature matrix

| Area | Promise | Status | Evidence / gap |
|---|---|---|---|
| Resume | Upload PDF, DOCX, TXT, or Markdown and parse locally | **Implemented** | `ResumeIntake` calls the local extractors and stores a structured profile. Paste fallback is also wired. |
| Resume | Review and correct contact, roles, education, and skills | **Implemented** | The Profile route edits the same stored profile used by scan and fill. |
| Resume | Upload the original resume to an application | **Not implemented** | File inputs are deliberately skipped and the original bytes are not retained. The README’s “resume upload” roadmap item refers to this application attachment, not profile intake. |
| Posting | Read the active page automatically | **Implemented** | The Scan route asks the selected content-script frame for structured data, known selectors, or the densest text block. Paste remains available. |
| ATS scan | Requirement-to-evidence table without a model call | **Implemented** | Scan extraction, evidence matching, gaps, and persisted scan records are wired into the UI. |
| Cover letter | Generate only from grounded evidence | **Implemented** | The Scan route exposes generation, saves letters, supports edits, copying, deletion, voice samples, and budget handling. |
| Cover letter | Attach the generated letter to the application | **Not implemented** | No generated file/blob is connected to a page file input. |
| Fill | Known ATS adapters plus generic active-tab injection | **Implemented** | Greenhouse, Lever, Ashby, Workable, Workday and LinkedIn run declaratively; generic pages can be injected after a user grant. Other named adapters are detected when injected. |
| Fill | Open shadow-root and best-iframe discovery | **Implemented** | Harvesting walks open roots and `bestFormFrame` probes frames before the run. Closed roots remain inaccessible by browser design. |
| Fill | Five-tier resolver with one batched model fallback | **Implemented** | Adapter/autocomplete, answer memory, exact labels, fuzzy labels, and model fallback all feed the review overlay. |
| Fill | Review every proposed value before writing | **Implemented** | The page overlay exposes the source tier, corrections, empty fields, and cancel/approve outcomes. |
| Fill | Learn accepted/corrected answers | **Implemented** | Approved rows call `rememberAnswer`; repeat questions are resolved from IndexedDB. |
| Fill | Edit answer memory directly | **Not implemented** | There is no questions-table UI to list, change, or delete learned answers. |
| Fill | Page launcher starts the run | **Partial** | Detection and the dismissible launcher are wired. This revamp fixes its missing art path; clicking currently opens the side panel rather than directly invoking a fill. |
| Fill | Classify signup/login/confirmation walls | **Partial** | `readGate` is production code and drives launcher copy, but classification alone does not get through a wall. |
| Fill | Use stored sign-in details to pass account walls | **Library/UI only** | Settings stores/forgets credentials and `fillGate` is tested, but no shipping entrypoint calls `fillGate`. The v0.0.1 release note overstates this feature. |
| Fill | Ordered account → fill → letter → confirm flow | **Library only** | `stage.ts` models and tests the order, but the content-script run still starts at harvest/resolve and never executes that state machine. |
| Fill | Multi-step application support | **Not implemented** | A run operates on the current form/frame only and does not continue after navigation or a Next step. |
| Fill | Live per-field checklist | **Implemented** | Content-script progress broadcasts drive the FillRun battle/checklist view. |
| Fill | Auto-submit after a verified clean run | **Rules only** | Qualification rules and tests exist; there is no settings control and nothing calls `shouldAutoSubmit` in the runtime path. |
| Tracker | Log only after a real submission | **Implemented** | A capture-phase form/button watcher arms after a successful fill and calls the background repository. |
| Tracker | Manual logging for email/hand applications | **Implemented** | The tracker Add form writes directly to the same applications table. |
| Tracker | Board, list/table, nine editable columns, and rollups | **Implemented** | Both narrow and wide tracker views use the same records and inline update repository. |
| Tracker | RFC 4180/Notion-named CSV export with formula neutralization | **Implemented** | Export is wired in Tracker and covered by unit tests. |
| Tracker | Quiet-after-30-days signal | **Implemented** | Stale records are derived and surfaced without changing status automatically. |
| Tracker | `.clankdb` import/export | **Not implemented** | No serialization/import UI or repository code exists. Credentials are already stored separately, which is a prerequisite only. |
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
| UI | First-run setup, side panel, and full-page dashboard | **Implemented** | All three are WXT entrypoints. This working tree contains the refreshed shell/dashboard and real-art integration. |

## Highest-priority product gaps

1. Wire the already-written account/flow modules into the content-script run before continuing to
   claim automatic account-wall handling.
2. Retain user-selected resume bytes locally and attach them (plus an optional generated cover
   letter) only after explicit review.
3. Add multi-step continuation and an answer-memory editor before exposing auto-submit controls.
4. Implement `.clankdb` backup/restore and validate schema/version migrations.
5. Resolve provenance and redistribution rights for `public/Sprites/` before adding those files to
   a public release or Chrome Web Store submission.
