# Curiosity Studio

A local, single-publisher application for planning, writing, checking and exporting illustrated curiosity worksheets ("Why do shadows change during the day?") with a separate answer key and teacher notes.

You enter a question, choose the learner and format, review an evidence-linked lesson plan, edit the rendered pages, resolve quality issues, approve a revision, and export. A person approves every revision. The app does not certify accuracy, accessibility, curriculum alignment or publishing-platform compliance.

**Status: Phase 1 vertical slice.** It runs end to end and has automated tests. It is a local prototype, not a hosted production service (see [Deployment notes](#deployment-notes)).

---

## Contents

- [What was built](#what-was-built)
- [What is not finished](#what-is-not-finished)
- [Setup](#setup)
- [Configuring the AI provider](#configuring-the-ai-provider)
- [Running](#running)
- [Tests](#tests)
- [Data, storage and exports](#data-storage-and-exports)
- [How it works](#how-it-works)
- [Deployment notes](#deployment-notes)
- [Known limitations](#known-limitations)
- [Manual publishing-review checklist](#manual-publishing-review-checklist)

---

## What was built

| Area | What works |
|---|---|
| **Workflow** | Dashboard (search, status and folder filters, duplicate, archive, folders, multi-select into a workbook) → creation form (question, learner, reading demand set separately from age, format, content mode, advanced settings) → visible staged generation → editable plan review → editor → quality review → approval → export. |
| **Generation pipeline** | Plan job: *understand → research → plan*. Build job: *write → visuals → assemble → lay out → check*. Each completed stage is saved on the job, so a failure, cancellation or server restart resumes from the first unfinished stage. Bounded retries (default 2) with the validation errors fed back. Stages are shown by name; there are no fake percentages. |
| **Clarification** | Ambiguous questions pause for the editor to choose a meaning (demo: “How big is a mole?”). |
| **Evidence** | Three content modes (research, your sources, mixed) plus a clearly labelled *unverified draft*. Source records and claim records with links, excerpts, status and *who assigned the status* (no sources / deterministic / model assessment / human reviewer). Quoted support is checked against the stored source text by code; a quote that is not found marks the claim unsupported. If search is not configured, planning stops and offers source mode or a labelled unverified draft — it never pretends research happened. |
| **Your sources** | Paste text, upload `.txt/.md/.html`, or import a public web page (SSRF-protected). Stored as plain text; treated as data, not instructions. |
| **Planning engine** | Picks 3–6 strategies from a catalogue (worked/faded examples, prediction-and-revisit, retrieval, text–visual integration, guided inquiry, etc.) based on question type, prior knowledge, format and options. The “Why this lesson is structured this way” panel shows the rationale. No learning-styles, no rigid Bloom ladder. |
| **Diagrams** | Models produce validated *specifications*, never markup. Deterministic compilers draw: sequence/cycle (with a consistent line-art icon set), comparison panels, timelines, light-and-shadow (shadow length computed from Sun elevation), fraction bars, number lines, levers (mechanical advantage), bar charts, concept maps, and labelled scenes from allowlisted primitives (with smooth curves and write-in label boxes). Labels are rendered separately and editable; all text is escaped. |
| **Diagram checks** | Empty and out-of-bounds labels, likely overlaps, timeline ranges/order, fraction label and equivalence claims, number-line ranges, chart axes that would misrepresent data, concept-map links, scene bounds, missing legend, alt text and long descriptions, and a “what would be lost without it?” purpose test. Human review status is tracked separately. |
| **Numerical answers** | Fractions, missing numerators, arithmetic (a small parser — no `eval`), percentage change and mechanical advantage are recomputed by code; a mismatch with the answer key is a blocking issue. |
| **Editor** | Three regions: page/structure list (reorder, page placement, duplicate page, add section), live preview (the same renderer as export; click to select; measures real overflow), and properties (text with constrained markup, vocabulary, activities and items, support options, answer key and rubric, diagram captions/alt text/long description/labels/width/data, review status, document and print settings, branding). Undo/redo, autosave with version conflict detection, save status, named revisions, restore, lock, hide. |
| **Targeted regeneration** | Regenerate one section (and its activity/answer key/diagram) with an instruction or preset; shown as a before/after proposal with dependencies; locked sections are refused; nothing changes until accepted; the result is rechecked. |
| **Layout and print** | One stylesheet and renderer for preview and export. Exact page sizes (US Letter/A4), margins, binding allowance, headers/footers, page numbers, name/date fields, minimum type size, writing-line heights tied to type size. Student sections are measured in Chromium and packed onto pages with keep-with-next; overflow is reported as blocking and text is never shrunk. Answer keys and teacher notes paginate at block boundaries. Black-and-white uses patterns, not colour. Six visual families. |
| **Quality review** | Issues grouped into content/evidence, teaching/assessment, visual accuracy, accessibility, print/pagination, rights/sources. Each issue says whether it came from code, layout measurement, a heuristic or AI critique. Blocking vs warning vs info. Warnings can be accepted with a recorded reason and reviewer; blocking issues cannot be overridden. Approval is a named human action. No overall score. Reading level is reported as a Flesch–Kincaid *estimate*. |
| **Exports** | Student PDF, answer-key PDF, teacher-notes PDF, combined educator PDF, student and educator HTML, plain text with diagram descriptions, project JSON, per-diagram SVG, page PNG, and workbook PDF (with optional cumulative review pages and answer keys). Every export comes from a stored revision and is recorded with settings, SHA-256 and unresolved issues. Unapproved exports are labelled “Draft”. A student export that would contain answer-key or teacher text is always refused. |
| **Cost control** | Per-stage model and effort settings, usage recorded per call, per-project spending limit with a pause-and-approve step, cancellation, timeouts, SDK retries for 429/5xx. |
| **Security** | Server-only credentials; origin check on state-changing requests; SSRF-safe fetching (scheme/port/credential checks, DNS resolution with private/loopback/link-local/metadata blocking on every redirect, connection pinned to the checked address, size/time limits); upload type/size checks; plain-text-only sources; SVG allowlist and escaping; sandboxed preview iframe; parameterized SQL; storage-key traversal protection; generic error messages. |
| **Demo** | Six demo worksheets (shadows, seeds, equivalent fractions, how historians know, levers, inflation) plus the ambiguous “mole” example. They are drafted from general knowledge and are **not reviewed or source-checked** — they show what the review screen asks an editor to verify. Demo mode is labelled in the header when no provider is configured. |

## What is not finished

- **The live AI path has not been run.** No `ANTHROPIC_API_KEY` was available in the build environment, so `AnthropicTextProvider` and `AnthropicWebSearchProvider` (`src/lib/providers/anthropic.ts`) were type-checked against the installed SDK (`@anthropic-ai/sdk` 1.3.0) but never called. Everything downstream of them was exercised with the mock provider. Expect to tune prompts and possibly the structured-output schemas on first live use.
- **Demo samples have no sources.** The build environment could not reach external sites, so no source was verified. Rather than invent citations, every sample claim is marked unsupported. Add and review real sources before using any sample.
- Uploaded *images* to replace an unsupported diagram are not implemented (the visuals stage reports unsupported diagrams and suggests a simpler accurate type instead of substituting a guess).
- PDF and Word files cannot be imported as sources (paste the relevant text). DOCX export is not implemented. No Canva/InDesign export.
- Curriculum: only “Suggested topic alignment—not verified curriculum alignment” is produced. Mapping against an uploaded curriculum document (with exact expectations and locations) is modelled in the schema but has no UI or pipeline yet.
- No optional illustration provider (all visuals are deterministic SVG).
- Review cards with editable spacing exist as teacher-note suggestions and workbook cumulative-review pages; there are no separate printable review-card exports.
- Single user, no login. Not multilingual (English with regional spelling options only); no right-to-left support.
- Phase 2/3 items (brand presets library, richer layouts, collaboration, hosted accounts, billing) are not started.

## Setup

Requirements: **Node.js 22.13 or later** (uses the built-in `node:sqlite`), and Chromium for layout/PDF via Playwright.

```bash
npm install                # .npmrc sets legacy-peer-deps (works around an npm 10 peer-resolution bug)
npx playwright install chromium   # skip if a matching Chromium is already installed
cp .env.example .env.local        # then add ANTHROPIC_API_KEY, or leave it empty for demo mode
```

If Chromium lives elsewhere, set `CS_CHROMIUM_PATH`. If no browser is available at all, set `CS_DISABLE_BROWSER_LAYOUT=1`: pagination falls back to estimates, but PDF export needs the browser.

## Configuring the AI provider

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Enables live generation. Read on the server only. |
| `CS_TEXT_PROVIDER` | `anthropic`, `mock` (labelled placeholder output for tests) or `none` (demo mode). Defaults to `anthropic` when a key is set. |
| `CS_SEARCH_PROVIDER` | `anthropic-web-search` (Anthropic's server-side web search tool), `mock`, or `none`. |
| `CS_MODEL`, `CS_MODEL_<STAGE>` | Default `claude-opus-5-5`. Stages: `INTERPRET`, `RESEARCH`, `PLAN`, `WRITE`, `VISUALS`, `CHECK`, `REGENERATE`. |
| `CS_EFFORT_<STAGE>` | `low`…`max`. Defaults are `low` for interpretation and checking, `medium` otherwise — effort is the main cost lever. |
| `CS_REFUSAL_FALLBACKS` | Server-side refusal fallback (`fallbacks: "default"`); set `off` to disable. |
| `CS_PRICE_<MODEL>` | `input,output` USD per million tokens, for estimates and budgets. Defaults are configuration, not live prices. |

Generation uses structured outputs (`messages.parse`-style via `zodOutputFormat`) with streaming; every response is validated again against the full document schema.

**Privacy:** the question, settings, and any sources you add are sent to the configured provider during generation. No student data is collected. This README does not claim zero retention; check your provider agreement.

## Running

```bash
npm run dev            # http://localhost:3000 (development)
npm run build && npm start   # production build
npm run seed           # optional: seed demo samples now (otherwise seeded on first visit)
npm run render-sample -- shadows ./out   # dev helper: render a sample to PDF + PNGs
```

## Tests

```bash
npm run typecheck
npm test               # unit + integration (Vitest)
npm run build && npm run test:e2e   # end-to-end + print/visual (Playwright, mock provider)
npm run test:all       # all of the above
```

Results in the build environment (2026-10-29):

| Suite | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | clean |
| Unit (`tests/unit`) — schema, migration, computations, units, page sizes, quality checks, student/teacher separation, diagram constraints and escaping, label overrides, source–claim links, editor operations, markup, SSRF and storage guards, strategy selection | **41 passed** |
| Integration (`tests/integration`) — mocked generation end to end, invalid responses and bounded retry, rate-limit stop and resume without redoing stages, failed retrieval, missing search, cancellation, clarification, budget pause, wrong arithmetic blocked, duplicate-job prevention, source import, revision save/conflict/restore, regeneration with locks, overrides, real-browser PDF/HTML/text exports, approval gating, A4 + large type, workbook compile | **19 passed** |
| End-to-end (`tests/e2e/workflow.spec.ts`) — create → plan → build → edit → lock → undo/redo → reload → regenerate → page size → export student PDF and answer key → review → duplicate → workbook → clarification sample | **9 passed** |
| Print (`tests/e2e/print.spec.ts`) — every sample × Letter/A4 × standard/large type with no clipping, long titles/terms/answers, dense timeline, black-and-white colour check, two screenshot baselines | **29 passed** |

The screenshot baselines were generated in this environment and reviewed by eye; regenerate them with `npx playwright test tests/e2e/print.spec.ts --update-snapshots` after intentional design changes.

## Data, storage and exports

- Everything lives under `CS_DATA_DIR` (default `./data`, git-ignored): `curiosity-studio.db` (SQLite), `storage/` (source text), `exports/<project>/` (files).
- The `Store` interface (`src/lib/db/store.ts`) uses only parameterized, portable SQL so a PostgreSQL implementation can replace `SqliteStore`. `BlobStorage` (`src/lib/storage.ts`) can be swapped for object storage.
- Deleting a project removes its rows; delete its `exports/<id>` folder to remove files.
- Each export row records the revision, settings, SHA-256 and unresolved issues; download past exports from the Export tab.
- Project JSON export contains the full structured document; documents are migrated forward on load (`src/lib/schema/migrate.ts`).

## How it works

```
src/lib/schema/        Zod document + diagram schemas, referential checks, migrations
src/lib/pedagogy/      strategy catalogue, selector, writing rules
src/lib/pipeline/      prompts, model-facing schemas, converters, staged pipeline, assembly/packing
src/lib/providers/     Anthropic adapters, mock providers, error mapping
src/lib/diagrams/      icon set, spec→scene compilers, SVG renderer, diagram checks
src/lib/render/        shared stylesheet, worksheet renderer + in-page paginator, Playwright layout/PDF
src/lib/quality/       quality gates and leak detection
src/lib/export/        exports, manifests, workbook compilation
src/lib/sources/       pasted/uploaded/URL sources; src/lib/security/safe-fetch.ts
src/lib/server/        services (business operations), singletons and job runner, HTTP helpers
src/app/               Next.js pages and API routes; src/components/ UI
```

The structured `WorksheetDocument` is the source of truth. Preview, PDF, HTML and text are all rendered from it; edits change it and are never reverse-engineered from output.

## Deployment notes

- Jobs run in-process (one Node server). For hosting, replace `startJob` in `src/lib/server/context.ts` with a queue worker — the job row holds everything needed to resume.
- Add authentication before exposing it beyond localhost: there is no login, only a same-origin check.
- Run one server process per database (SQLite) or move to PostgreSQL.
- Chromium must be available to the server for layout measurement and PDF export.
- `node:sqlite` prints an experimental-feature warning on Node 22; it is harmless.

## Known limitations

**Accessibility.** The application targets WCAG 2.2 AA (labelled controls, visible focus, skip link, reduced motion, live status regions, no colour-only status) but has **not been audited** with assistive technology. PDFs are tagged by Chromium, but reading order and tags are not verified against PDF/UA; offer the HTML or plain-text export (which includes diagram descriptions) to learners who need it. Visual tasks (labelling, reading a graph) are flagged as needing adaptation for non-visual access. The bundled body font is chosen for legibility; it is not presented as a dyslexia treatment.

**Factual review.** Model assessments of claims are review prompts, not verification. Deterministic checks cover quoted-passage presence, numerical answers and some diagram geometry only. Readability is a surface estimate. The writing rules discourage invented facts, but only a person checking sources can confirm accuracy.

**Diagrams.** Ten diagram types; anything else is reported as unsupported. Label-overlap detection uses estimated text widths. Labelled scenes are simple schematic line art. Geometry checks do not prove that a scene depicts the science correctly (for example, the light-and-shadow panels are a simplified side view, noted in their description). Every diagram needs human review before approval.

**Layout.** Student sections are not split across pages; a single section taller than a page is reported as overflow. Workbook page numbers restart in each worksheet. Widow/orphan control is limited to keeping blocks together.

**Rights.** Fonts are Fraunces and Atkinson Hyperlegible Next under the SIL Open Font License 1.1 (embedding permitted; licences in `public/fonts/`). Source licence status defaults to “unknown”; excerpts are kept for review and are not printed on student pages. Being able to read a source is not permission to reproduce it.

## Manual publishing-review checklist

1. **Question and answer** — the main question is answered plainly in the explanation, at the right reading level, without a puzzle in the way.
2. **Every claim** — open each claim on the Review tab, read its excerpt, and mark it checked or fix it. Add sources for anything unsupported. Watch for simplifications that are false, and for analogies not marked as analogies.
3. **Every diagram** — compare it with the text; check labels, arrows, units, order and captions; read the long description; mark it reviewed.
4. **Activities and answer key** — each activity matches its objective; answers are correct (numerical ones are already code-checked); open-ended items have a fair rubric and accept reasonable alternative wordings; retrieval tasks cannot be copied from the same page.
5. **Support and extension** — support keeps the main objective; extension is transfer or reasoning, not just more questions; oral/drawing alternatives assess the same thing.
6. **Safety and sensitivity** — supervision notes appear on student pages where needed; sensitive topics use calm wording and have had specialist review where flagged.
7. **Accessibility** — alt text and long descriptions are accurate; meaning never depends on colour; print a page at actual size and check type and writing space.
8. **Print** — no overflow warnings; page count matches the format; print one copy in black and white.
9. **Rights** — sources, quotations, fonts and any images are cleared for your use; brand and copyright lines are correct.
10. **Curriculum** — treat “suggested topic alignment” as unverified unless you have mapped it to the official document yourself.
11. **Approve** — approve the revision with your name; export from that approved revision; check the platform's current requirements (no export is “approved” by any platform).
