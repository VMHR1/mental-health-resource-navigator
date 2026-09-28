# Program Page Content — Design

**Date:** 2026-09-27
**Status:** Approved in brainstorming; awaiting spec review
**Owner:** Jared (domain review), Claude (implementation via Opus subagents)

## Problem

Program pages (`dist/programs/{program_id}.html`, built by `scripts/render-program-detail.js`) are thin, and the thinness is in the data, not the renderer:

- 50 of 112 programs have an empty `notes`; median note length is 28 characters (measured 2026-09-27 against `public/data/programs.json`).
- No field describes the program itself — conditions treated, schedule, family/school involvement, admission process.
- Insurance renders the raw pipe-delimited `insurance_notes` string (`renderProgramBody` in `render-program-detail.js`, the `gridRow('Insurance', …)` row).
- 68 of 112 programs render "Transportation: Unknown".

Consequences: families and discharge planners get little they couldn't get from the search card, and 112 near-identical templates read as thin content to Google (GSC 2026-09-27: 24 indexed vs 128 discovered-not-indexed).

## Goals

1. Every program page carries useful, page-specific content without adding unverified claims.
2. New program-specific facts are traceable to the program's own website, word for word.
3. Jared's review time is spent only where automation is unsure.

## Non-goals

- Changing `programs.json`, the 90-day verification cycle, or the freshness pipeline. Insurance/phone/age accuracy stays a separate problem.
- A "conditions treated" search filter (the data will support one later; not built here).
- Re-fetching quotes in CI (network-flaky). Quote re-checks are a script run per wave.
- Changes to the client-side fallback renderer beyond what is listed under *Client fallback* below.

## Phase 1 — Presentation upgrades (all 112 pages, no new facts)

Built only from existing `programs.json` fields plus Jared-approved general copy.

### 1.1 Level-of-care explainer

A section **"What [level] means for your family"**: 3–5 sentences of plain-English, general (not program-specific) copy covering who it's for, typical time commitment in general terms, and what a day looks like.

The data has 10 `level_of_care` values; they map to 7 explainers:

| Explainer | `level_of_care` values (count) |
|---|---|
| PHP | Partial Hospitalization (PHP) (44) |
| IOP | Intensive Outpatient (IOP) (45) |
| Residential | Residential (5) |
| Outpatient | Outpatient (2), Walk-In Outpatient (2) |
| Navigation | Navigation (3) |
| Crisis — in person | Mobile Crisis (5), Walk-In Crisis / Urgent (1), Psychiatric Triage (1) |
| Crisis — phone/text | Crisis Hotline (4) |

Copy lives in a new build-time module `scripts/level-of-care-copy.js` (single source; the existing `guide-levels-of-care.html` is linked from each explainer, not duplicated). A `level_of_care` value with no mapping renders no explainer and `validate-data` warns.

**Jared reviews and approves all 7 explainers before Phase 1 ships.** Copy must preserve the site's neutrality: informational, not medical advice.

### 1.2 Readable insurance section

- Chips from `insurance_categories` (Commercial / Medicaid–CHIP / TRICARE / Medicare), reusing the existing `insuranceCategories()` export.
- Below the chips, `accepted_insurance.notes` as a sentence when present; otherwise `insurance_notes` with the `Plans: … | Types: … |` scaffolding stripped.
- Programs with no categories show the note text only.

### 1.3 Age-fit line

"Serves ages 11 and up" / "Serves ages 12–17" from `age_min`/`age_max`; falls back to `ages_served` free text; the 3 `"Unknown"` programs show "Ages served not published — ask when you call."

### 1.4 "Questions to ask when you call"

A per-page checklist. For each Phase 2 topic (conditions, schedule, family & school, admission) with no *published* fact, render that topic's question. Fixed baseline questions (e.g. current availability/waitlist, which CLAUDE.md notes are never crawlable) always appear. Before Phase 2 data exists, every Treatment Program page shows the full list; it shrinks as facts pass review. Crisis Service pages (out of Phase 2 scope) show only the baseline questions, so they never carry questions that no fact will ever answer.

### 1.5 Hide unknown transportation

`transportation_available` of `Unknown` or `N/A` renders nothing (row omitted). `Yes` renders as today.

## Phase 2 — Researched facts (96 Treatment Programs)

Scope: `entry_type === "Treatment Program"` (96). The 16 Crisis Services get Phase 1 only; schedule/school/admission fields don't fit them.

### 2.1 Data file

**`content/program-details.json`** at repo root, keyed by `program_id`. Build-time only.

Deliberately **not** in `public/data/`: everything there is copied into `dist/` and served publicly, and this file holds rejected facts and review state. It is also not merged into `programs.json`, which every search page fetches in the browser — up to 480 facts (96 programs × 5 fields) with quotes would bloat that payload for no search benefit.

Shape (synthetic values):

```json
{
  "schema_version": 1,
  "programs": {
    "php-example-city": {
      "conditions": {
        "value": ["depression", "anxiety", "self_harm_suicidality"],
        "quote": "We treat adolescents experiencing depression, anxiety, and self-harm.",
        "source_url": "https://example.org/programs/php",
        "retrieved_at": "2026-09-28",
        "check": "quote_found",
        "support": "supported",
        "review": "auto"
      },
      "schedule":  { "value": "Mon–Fri, 8:30am–2:30pm · typically 2–3 weeks" },
      "family":    { "value": { "family_therapy": true, "parent_groups": false, "text": "Weekly family therapy" } },
      "school":    { "value": { "onsite_academics": true, "school_coordination": true, "text": "On-site teacher" } },
      "admission": { "value": { "referral_required": false, "free_assessment": true, "walk_in": false, "text": "Call to schedule a free assessment" } }
    }
  }
}
```

(`schedule`, `family`, `school`, `admission` carry the same `quote` / `source_url` / `retrieved_at` / `check` / `support` / `review` metadata as `conditions`; omitted above for brevity.)

Field notes:

- `conditions.value` uses a fixed vocabulary in `scripts/program-details-vocab.js`: `depression, anxiety, self_harm_suicidality, trauma_ptsd, mood_bipolar, eating_disorders, co_occurring_substance_use, psychosis, adhd_behavioral, ocd, autism_support, other`. Unknown tags fail validation.
- `family` and `school` are separate fields (each with its own quote) because one page sentence rarely supports both.
- Each fact carries exactly one `quote` + `source_url`. A value needing two sentences from different pages is split or flagged.
- `retrieved_at`: `YYYY-MM-DD`, America/Chicago date.
- `check`: `quote_found | quote_missing | fetch_failed | js_rendered`.
- `support`: `supported | unsupported | partial`.
- `review`: `auto | needs_review | approved | rejected | edited`.

**Publish rule:** a fact is published iff `review ∈ {auto, approved, edited}` AND `retrieved_at` is ≤ 180 days before the build date. `auto` is only assignable when `check === quote_found` AND `support === supported`.

### 2.2 Pipeline (per wave of ~20 programs, grouped by website)

112 programs share 40 `website_domain`s; waves are grouped by domain so one research pass covers sibling locations, while facts are still recorded per `program_id` (location pages can differ).

1. **Research** (Opus subagent). Allowed sources: pages on the program's own `website_domain` only. Output per fact: value, verbatim quote, URL. If a topic isn't found, record nothing for it — never infer. Vague wording ("flexible scheduling") is recorded with `needs_review` pre-set.
2. **Quote check** (`scripts/check-detail-quotes.mjs`, deterministic). Fetches `source_url`, strips tags, normalizes whitespace, curly quotes, dashes, and HTML entities, then substring-matches the normalized quote. Sets `check`. Pages whose fetched HTML lacks body text the browser shows → `js_rendered`.
3. **Support check** (separate agent, blind). Given only `{quote, proposed value}`, answers whether the quote states the value. It never sees the researcher's reasoning or the source page. Sets `support`.
4. **Triage** (`scripts/triage-details.mjs`): `auto` if `quote_found` + `supported`; else `needs_review`. Then a seeded random 10% of `auto` → `needs_review` (spot-check; seed recorded in the wave report for reproducibility).
5. **Review** (Jared). `scripts/build-review-page.mjs` generates a local HTML page (not deployed) listing each `needs_review` fact: proposed value, quote, source link, check/support results, and Approve / Reject / Edit controls. It exports a decisions JSON; `scripts/apply-detail-decisions.mjs` writes it back. No hand-editing JSON.
6. **PR per wave** → CI → merge → pages live.

### 2.3 Pilot gate

Wave 0 is a 10-program pilot across ≥5 domains. Report: auto rate, check-failure breakdown, support-disagreement count, Jared's measured review time. **Proceed to full waves only if Jared agrees after seeing the numbers.** If auto rate is low, fix the process (source selection, normalization, prompts) before scaling.

### 2.4 Rendering

- New section **"About this program"** on prerendered pages, one row per published fact:
  - Conditions: chips from vocabulary labels.
  - Schedule, Family, School, Admission: the `text` value.
  - Attribution under each: *"Per {organization}'s website · checked {Mon YYYY} ↗"* linking `source_url`. Wording is "checked", not "verified", to keep it distinct from the site's defined *verified* meaning.
- Topics without a published fact appear instead in 1.4's question list.
- JSON-LD: no new schema types. Published facts are not added to `MedicalClinic` structured data in this project.

### 2.5 Client fallback

`src/js/program-detail.js` renders pages client-side only when no prerendered HTML exists (`program.html?id=…`); canonical URLs are the prerendered ones. The fallback gets Phase 1.2, 1.3, and 1.5 (derived purely from `programs.json`), not 1.1, 1.4, or Phase 2 (build-time content). Its existing "mirrors render-program-detail.js" comments are updated to say which sections are intentionally prerender-only.

## Validation & testing

- `validate-data` (blocking) extended: `content/program-details.json` keys must be existing `program_id`s; vocabulary tags valid; `auto` requires `quote_found` + `supported`; every published fact has `quote`, `source_url`, `retrieved_at`.
- Unit tests (Node) for: insurance-note stripping, age-fit line, transportation hiding, publish rule (incl. 180-day expiry), quote normalization (curly quotes, entities, whitespace), triage assignment.
- Playwright (new `tests/program-content.spec.js`): a fixture program with published facts renders "About this program" with attribution links; a program without facts renders the question list; no page renders "Transportation: Unknown".
- Mobile snapshots will change (program page DOM grows) → regenerate via the `Update Playwright Snapshots` workflow, per CLAUDE.md.
- Visual check of 3 real pages (desktop + mobile) before each Phase PR merges.

## Rollout

1. **PR A — Phase 1** (renderer + copy module + tests). Blocked on Jared approving the 7 explainers.
2. **PR B — Phase 2 tooling** (data file skeleton, vocab, validators, quote check, triage, review page, apply script, "About this program" rendering). Ships with an empty data file; no visible change.
3. **PR C — Pilot wave** (10 programs) → pilot report → Jared's go/no-go.
4. **PRs D… — remaining waves**, ~20 programs each.

## Risks

| Risk | Mitigation |
|---|---|
| Real quote, wrong value | Blind support check + 10% spot-check |
| Invented quote | Deterministic quote check against a fresh fetch |
| JS-rendered / bot-blocked sites | `js_rendered` / `fetch_failed` → human review; never `auto` |
| Location pages differ from org-wide copy | Facts keyed per `program_id`; quote must be from a URL the researcher ties to that location, else `needs_review` |
| Stale facts | 180-day publish expiry; re-research on the next wave cycle |
| Review backlog | Pilot measures real review time before scaling |
