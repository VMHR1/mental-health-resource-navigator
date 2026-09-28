# Program Page Content — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every program page genuinely useful — first by presenting existing data better, then by adding cited facts from each program's own website.

**Architecture:** Phase 1 changes only the page builder (`scripts/render-program-detail.js`). Phase 2 adds a private, build-time data file (`content/program-details.json`) plus small scripts that research, check, and review facts before they appear on a page.

**Tech Stack:** Plain Node (ES modules), no new dependencies. Unit tests use Node's built-in `node --test`. Browser tests use the existing Playwright setup.

**Spec:** `docs/superpowers/specs/2026-09-27-program-page-content-design.md` — read it before any task. This plan says *what to build in what order*; the spec says *exactly how it must behave*.

## Global Constraints

- No new npm dependencies.
- `content/program-details.json` must never be copied into `dist/` or `public/`.
- `programs.json` is not modified by any task in this plan.
- On-page attribution says **"checked"**, never "verified".
- Copy stays neutral: informational, not medical advice; programs never pay.
- Every HTML value goes through the existing `escapeHtml()`; every link through the existing `safeHttpUrl()`.
- Follow CLAUDE.md: `rm -rf dist && npm run build` before trusting any test result; cite `file:line` in reports.
- Every commit ends with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

## At a glance (for Jared)

| PR | What you'll see | Your part |
|---|---|---|
| **A — Phase 1** | Every page gets a care-level explainer, clean insurance chips, a plain age line, and "questions to ask when you call." "Transportation: Unknown" disappears. | Approve the 7 explainer texts (Task 2). |
| **B — Research tools** | Nothing visible. The machinery gets built and tested. | Nothing. |
| **C — Pilot (10 programs)** | 10 pages gain an "About this program" section. | Review the flagged facts in the review page, then decide go / no-go. |
| **D+ — Remaining waves** | About 20 more pages per wave. | Review each wave's flagged facts. |

Each PR merges on its own. You can stop after any of them and the site is still better than before.

---

## PR A — Phase 1: Better presentation

Branch: `content/phase1-presentation` from `updated-main`.

### Task 1: Set up unit tests

**Files:**
- Modify: `package.json` (add a script)
- Modify: `.github/workflows/ci.yml` (run it in the `fast` job)
- Create: `tests/unit/smoke.test.js`

- [ ] Add script `"test:unit": "node --test tests/unit/"` to `package.json`.
- [ ] Create `tests/unit/smoke.test.js` with one test that imports `programCanonicalUrl` from `scripts/render-program-detail.js` and asserts its output for `'abc'`. (Read `render-program-detail.js:32` first and assert the real URL shape.)
- [ ] Run `npm run test:unit`. Expected: 1 passing.
- [ ] Add `npm run test:unit` as a step in the `fast` job in `ci.yml`, right after `validate-filters`.
- [ ] Commit: `test: add node --test unit runner`

**Done when:** `npm run test:unit` passes locally and appears in the CI `fast` job.

### Task 2: Level-of-care explainer copy (needs Jared's approval)

**Files:**
- Create: `scripts/level-of-care-copy.js`
- Create: `tests/unit/level-of-care-copy.test.js`

**Produces:** `export function explainerFor(levelOfCare)` → `{ title, body } | null`

- [ ] Write the test first: every `level_of_care` value in `public/data/programs.json` returns a non-null explainer; `explainerFor('Made Up')` returns `null`; the mapping covers all 10 values listed in the spec's 1.1 table.
- [ ] Run it and confirm it fails (module missing).
- [ ] Write the module: 7 explainers (PHP, IOP, Residential, Outpatient, Navigation, Crisis in person, Crisis phone/text), each with a `title` ("What PHP means for your family") and a 3–5 sentence `body`, plus a lookup map from the 10 raw values. General statements only; nothing program-specific.
- [ ] Run the test. Expected: pass.
- [ ] In `scripts/validate-data.js`, add a **warning** (not a failure) for any program whose `level_of_care` has no explainer, so a new care level added later doesn't silently render without one.
- [ ] **STOP. Show Jared all 7 texts in chat and wait for approval or edits.** Apply the edits.
- [ ] Commit: `feat: level-of-care explainer copy (owner-approved)`

**Done when:** tests pass and Jared has approved the wording.

### Task 3: Small display helpers

**Files:**
- Create: `scripts/program-display.js`
- Create: `tests/unit/program-display.test.js`

**Produces:**
- `insuranceSentence(program)` → string or `''` (spec 1.2: `accepted_insurance.notes` first; else `insurance_notes` with the `Plans: … | Types: … |` scaffolding removed)
- `ageFitLine(program)` → string (spec 1.3)
- `showTransportation(program)` → boolean (false for `Unknown` / `N/A`)
- `callQuestions(program, publishedTopics)` → string[] (spec 1.4; `publishedTopics` is a `Set` of topic names with a published fact, empty in Phase 1)

- [ ] Write the tests first, using small inline program objects (not the real data file):
  - insurance: a pipe-delimited `insurance_notes` with no `accepted_insurance.notes` → returns only the free-text part; with `accepted_insurance.notes` → returns that.
  - age: `age_min 11` only → "Serves ages 11 and up"; `12`/`17` → "Serves ages 12–17"; `ages_served "Unknown"` and no numbers → "Ages served not published — ask when you call."
  - transportation: `Unknown` → false, `N/A` → false, `Yes` → true.
  - questions: Treatment Program with an empty set → baseline + all 4 topic questions; with `new Set(['schedule'])` → schedule question gone; Crisis Service → baseline questions only.
- [ ] Run them and confirm they fail.
- [ ] Implement the four functions.
- [ ] Run them. Expected: all pass.
- [ ] Commit: `feat: display helpers for program pages`

### Task 4: Put it on the page

**Files:**
- Modify: `scripts/render-program-detail.js` (`renderProgramBody`, starting at line 458)
- Modify: `src/js/program-detail.js` (client fallback: insurance, age, transportation only, per spec 2.5)
- Modify: page CSS, following the existing `.program-detail-*` class pattern
- Create: `tests/program-content.spec.js` (Playwright)

**Consumes:** `explainerFor`, `insuranceSentence`, `ageFitLine`, `showTransportation`, `callQuestions`, the existing `insuranceCategories()`

- [ ] Write the Playwright test first, against the built pages:
  - `/programs/php-changes-frisco` shows "What PHP means for your family", insurance chip "Commercial", "Serves ages 11 and up", and a "Questions to ask when you call" list.
  - No program page shows a Transportation row reading "Unknown" (spot-check 5 pages).
  - The insurance section contains no `|` character.
- [ ] `rm -rf dist && npm run build && npx playwright test tests/program-content.spec.js --project=desktop`. Expected: fail.
- [ ] Update `renderProgramBody`: explainer section after "Program Information"; chips + sentence in the insurance row; age line replaces the raw "Ages Served" value; drop the transportation row when `showTransportation` is false; questions section before "Verification" (with `publishedTopics = new Set()` for now).
- [ ] Apply the same insurance/age/transportation changes in the client fallback in `src/js/program-detail.js`, and update its "mirrors render-program-detail.js" comments to say which sections are prerender-only. Bump that script's `?v=` in its HTML tag (CLAUDE.md: manual cache busting).
- [ ] Rebuild and rerun. Expected: pass.
- [ ] Run the full gate: `npm run verify`. Mobile screenshot snapshots are expected to fail because the page grew. Regenerate them via the `Update Playwright Snapshots` workflow after pushing; don't update them from a Mac.
- [ ] Visual check: screenshot 3 real pages (one PHP, one IOP, one crisis) on desktop and mobile. Show them to Jared.
- [ ] Commit: `feat: richer program pages (explainer, insurance chips, age line, call questions)`
- [ ] Open PR A.

**Done when:** CI is green (after the snapshot refresh) and Jared has seen the screenshots.

---

## PR B — Phase 2 tools (no visible change)

Branch: `content/phase2-tools` from `updated-main` after PR A merges.

### Task 5: Data file, vocabulary, and publish rule

**Files:**
- Create: `content/program-details.json` → `{ "schema_version": 1, "programs": {} }`
- Create: `scripts/program-details-vocab.js` → `export const CONDITIONS` (the 12 tags from spec 2.1, each with a display label)
- Create: `scripts/program-details.js`
- Create: `tests/unit/program-details.test.js`

**Produces (in `scripts/program-details.js`):**
- `loadProgramDetails()` → the parsed file
- `publishedFacts(programId, details, today)` → `{ conditions?, schedule?, family?, school?, admission? }`, only facts passing the spec's publish rule
- `validateProgramDetails(details, programIds)` → string[] of errors (empty = valid)

- [ ] Write the tests first:
  - publish rule: `auto` + 10 days old → shown; `needs_review` → hidden; `rejected` → hidden; `approved` + 181 days old → hidden; `edited` → shown.
  - validation: unknown `program_id` → error; unknown condition tag → error; `auto` with `check: quote_missing` → error; published fact missing `quote` → error; the empty skeleton → no errors.
- [ ] Run them and confirm they fail. Implement. Run them again and confirm they pass.
- [ ] Call `validateProgramDetails` from `scripts/validate-data.js` so any error fails `npm run validate-data`.
- [ ] Confirm the build doesn't copy `content/`: `rm -rf dist && npm run build && find dist -name 'program-details*' | wc -l` → `0`.
- [ ] Commit: `feat: program-details data file, vocab, publish rule`

### Task 6: "About this program" section

**Files:**
- Modify: `scripts/render-program-detail.js`, `scripts/generate-program-pages.js` (load details once, pass them into `renderProgramBody`)
- Create: `tests/fixtures/program-details.fixture.json`
- Modify: `tests/unit/program-details.test.js`

**Consumes:** `publishedFacts`, `CONDITIONS`, `callQuestions`

- [ ] Write a unit test first: calling `renderProgramBody` with fixture details that publish `schedule` for one program → the HTML contains "About this program", the schedule text, the word "checked" with the month, and a link to `source_url`; the call-questions list no longer contains the schedule question. A program with no details → no "About this program" section.
- [ ] Run it and confirm it fails. Implement per spec 2.4: conditions as chips using `CONDITIONS` labels, other topics as text, each with "Per {organization}'s website · checked {Mon YYYY} ↗". Pass `new Set(Object.keys(published))` into `callQuestions`.
- [ ] Run it and confirm it passes. `rm -rf dist && npm run build`: with the empty data file, pages must be identical to PR A. Check with a diff of one built page before and after.
- [ ] Commit: `feat: render published program facts`

### Task 7: Quote check and triage scripts

**Files:**
- Create: `scripts/check-detail-quotes.mjs`, `scripts/triage-details.mjs`
- Create: `tests/unit/quote-check.test.js`

**Produces:**
- `normalizeText(str)` → string (lowercase; collapse whitespace; straight quotes; `–`/`—` → `-`; decode HTML entities)
- `quoteFoundIn(quote, html)` → boolean (strips tags, then normalized substring match)
- CLI `node scripts/check-detail-quotes.mjs --wave <file>` → sets `check` on every fact in a wave file
- `triage(facts, seed)` → sets `review`; CLI `node scripts/triage-details.mjs --wave <file> --seed <n>`

- [ ] Write the tests first: a curly-quoted, `&amp;`-containing, line-wrapped quote matches its plain page text; a quote with one changed word doesn't match; `quote_found` + `supported` → `auto`; anything else → `needs_review`; a fact the researcher already marked `needs_review` (vague wording) stays `needs_review` even if both checks pass; with the same seed, the same ~10% of `auto` facts flip to `needs_review` every run.
- [ ] Run them and confirm they fail. Implement. The fetch uses a 15s timeout and one retry; a failure sets `fetch_failed`, and a page with under 200 characters of visible text sets `js_rendered`. Run the tests again and confirm they pass.
- [ ] Commit: `feat: deterministic quote check and triage`

### Task 8: Review page and apply-decisions script

**Files:**
- Create: `scripts/build-review-page.mjs` → writes `review/wave-<n>.html` (add `review/` to `.gitignore`)
- Create: `scripts/apply-detail-decisions.mjs`
- Create: `tests/unit/apply-decisions.test.js`

- [ ] Write the test first: applying `{ "php-x/schedule": "approved" }` sets `review: approved`; `"rejected"` sets `rejected`; `{ "action": "edited", "value": "…" }` replaces the value and sets `edited`; an unknown key throws a clear error.
- [ ] Run it and confirm it fails. Implement. Run it again and confirm it passes.
- [ ] Build the review page: one card per `needs_review` fact showing program name, topic, proposed value, quote, source link, and check/support results, with Approve / Reject / Edit buttons. A "Download decisions" button saves `decisions.json`. It must work opened straight from disk (`file://`), with no server and no external scripts.
- [ ] Manual test: build the page from a 3-fact sample wave, click through, apply the downloaded file, and confirm the data file changed as expected.
- [ ] Commit: `feat: local review page + apply decisions`
- [ ] Open PR B.

---

## PR C — Pilot (10 programs)

### Task 9: Run the pilot wave

This task is run by the coordinator (Claude), not written as code.

- [ ] Pick 10 Treatment Programs across at least 5 different `website_domain`s. List them for Jared before starting.
- [ ] **Research:** dispatch one Opus subagent per domain, restricted to that domain's pages, to write `content/waves/wave-0.json` (the value, verbatim quote, and URL for each topic found; nothing guessed).
- [ ] **Quote check:** `node scripts/check-detail-quotes.mjs --wave content/waves/wave-0.json`
- [ ] **Support check:** dispatch a separate agent that sees only `{quote, value}` pairs and sets `support`.
- [ ] **Triage:** `node scripts/triage-details.mjs --wave content/waves/wave-0.json --seed <today as YYYYMMDD>`
- [ ] **Review:** build the review page and hand it to Jared. Time how long his review takes.
- [ ] Apply his decisions, merge the wave into `content/program-details.json`, and run `npm run validate-data`.
- [ ] Rebuild and screenshot 3 pilot pages.
- [ ] **Pilot report to Jared:** facts found, % auto, check-failure reasons, support disagreements, spot-check catches, review minutes. **Go / no-go is his call.**
- [ ] Open PR C.

## PR D and later — Remaining waves

- [ ] Repeat Task 9 for about 20 programs at a time, grouped by website, one PR per wave, until all 96 Treatment Programs are done.

---

## What's deliberately not in this plan

A conditions search filter, JSON-LD changes, automatic re-research, and CI quote re-checks. Each is listed as a non-goal in the spec.
