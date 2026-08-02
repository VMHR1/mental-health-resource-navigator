# Automated Data-Freshness & Accuracy Pipeline — Implementation Plan

**Status:** Partially implemented — see the progress table below.
**Authored:** 2026-08-02 (all "today"-relative facts below are as of this date).
**Goal:** Families receive correct program information ≥90% of the time, and the fields families most need (intake, insurance, availability) are actually populated.

## Progress

| Phase | State | Notes |
|---|---|---|
| 0 — measurement bug fixes | **Done** | `validateISODate` (was throwing RangeError, not returning false), `friction-flags` enum mismatch, `handoff-workspace` dead `'current'` comparison. Metadata counter drift fixed in Phase 3's write path. |
| 1 — cliff + de-synchronize | **Done pending merge** | Waves applied; full re-verification ran via the workflow (run 30764970885, all 112 programs re-stamped 2026-08-02) and sits in **PR #11 — green, `mergeable_state: clean`, awaiting the owner's merge**. Merging clears the 2026-08-16 cliff. |
| 2 — staleness gate | **Gate done; scorecard not started** | `validate-data.js` now warns >90d, blocks when >20% exceed 120d, and reports cohort risk. `VALIDATE_AS_OF=YYYY-MM-DD` previews a future date. `scripts/accuracy-scorecard.js` **not yet written**. |
| 3 — scheduled workflow | **Done; two scripts pending** | Weekly cron opens PRs (verified end-to-end: PR #12 was bot-opened). `audit-program-data.js --wave N` + catch-up sweep in place. **Not yet done from this phase's spec:** `scripts/apply-patches.js`, crawler retry/backoff, and the committed `scripts/state/url-health.json` two-strikes failure history. |
| 4 — correction intake | **Not started** | Wire `submit.js` / `report-outdated.html` to `/api/submit-program`; needs `GITHUB_TOKEN` + `GITHUB_REPO` on Cloudflare Pages. Un-gating report-outdated is a product decision. |
| 5 — intake backfill + accuracy audit | **Not started** | `scripts/build-call-queue.js`. This is the only path to the "information families most need" criterion and to a defensible accuracy number. |
| 6 — LLM extraction | Deferred | Needs a credential; do not start before 1–5 run. |

Actions settings are confirmed working (bot-opened PR #12 proves PR creation; the snapshot workflow now declares `contents: write` explicitly after run #4 pushed and was denied).

## Backlog — findings from the 2026-08-02 session not covered by a phase

Ordered by suggested priority. Each is traced; none is speculative.

**Data corrections (hand edits, small):**
1. **Four dead source URLs** found by the full sweep — `crisis-mcot-ntbha` (Dallas RIGHT Care page on dallascityhall.com is gone — **a crisis listing; treat first**), `php-bricolage-flower-mound` + `iop-bricolage-flower-mound` (bricolagebehavioral.com pages unreachable), `iop-unity-richardson` (unitybehavioral.com/services unreachable). Detail is in PR #11's body and `scripts/data-audit-summary.json` from run 30764970885.

**Crawler/tooling debt (Phase 3 spec items not yet built):**
2. `scripts/verify-all-programs.js` — hardcoded `REVIEW_DATE='2026-05-17'` makes its skip logic dead, and it coerces 403/429 to "ok" so a bot-blocking site reads as healthy. Fix or fold into `audit-program-data.js` and deprecate. Same fate for `scripts/mark-programs-verified.js` (stamps every program unconditionally; already superseded).
3. `audit-program-data.js` — no retry/backoff; a transient failure can flip a program's status in one run. The planned two-consecutive-runs rule needs the committed `scripts/state/url-health.json`.
4. `scripts/apply-patches.js` (generic, replaces the four frozen `apply-*.js` one-offs) — prerequisite for Phase 5 call results.
5. `src/js/data-validator.js` carries a divergent duplicate of the schema and validates `verification.sources` — a field that does not exist in the data (records use `verification.source_urls`). Dead check; align with `validation-schema.js`.

**Product decisions needed (cannot be done by an agent alone):**
6. `report-outdated.html` is behind the pro gate (`report-outdated.js` wraps `init()` in `runWhenUnlocked`) — families who spot a wrong phone number cannot report it. One-line change once decided.
7. Correction intake (Phase 4) needs `GITHUB_TOKEN`/`GITHUB_REPO` set on Cloudflare Pages — owner action.
8. CI policy option: desktop-only on PRs (~2 min) with the full 3-browser matrix on merge/nightly. Current full run is ~5 min; this is optional.

**Minor / cosmetic:**
9. `404.html` ships without a CSP meta (only page that doesn't; predates this session).
10. `playwright.config.js` `workers: '50%'` is deliberately conservative — raise after a few stable weeks.
11. Repo setting **"Automatically delete head branches"** is off; the weekly workflow leaves one dead branch per run. Leftover `data-freshness/2026-08-02-2` still needs a manual delete (the session's git proxy cannot push deletions).
12. The flow keyframe pulse (`phase1-design.css`, `45% { ... color: var(--flow-accent) }`) still flashes the light accent mid-animation — transient, axe-invisible, left deliberately; revisit only if motion-reduced users report it.

> Implementer notes: read `CLAUDE.md` first (build, three-mirror data rule, `?v=` cache busting, deploy-on-push risk). Work in phase order — Phase 0 fixes bugs that would corrupt every metric built later. Each phase lands as its own PR against `updated-main`; never push data changes directly (Cloudflare deploys without waiting for CI).

## Why this exists — verified current state

- **All 112 programs share `last_verified: "2026-05-18"`** — one monolithic cohort that **expires simultaneously on 2026-08-16**. On that date every family-facing card (`src/js/modules/render.js:246`) and detail page flips to "stale" at once, handoff packets degrade, and `friction-flags` fires site-wide.
- **CI has zero staleness gating**: `scripts/validate-data.js` imports `REVERIFICATION_THRESHOLD_DAYS` (lines 17/25/45) and never uses it.
- **"Verified" is a liveness proxy, not correctness**: `classifyProgram()` in `scripts/audit-program-data.js:169` marks a program `verified` if its URL loads, hostnames align, and phone/city strings appear on the page. A program closed to new patients with a 6-month waitlist still passes.
- **The fields families most need are 0/112 populated**: `intake_phone`, `intake_hours`, `referral_required`, `self_referral_accepted`, `accepting_new_patients`, `waitlist_status`, `medicaid_plans`, `sliding_scale_available`, `verification_tier`. Every program renders "Unconfirmed" in `intake-confidence.js`. These fields are not reliably crawlable — they require phone confirmation.
- **All correction signals die in a Gmail inbox**: submit + report-outdated share one Formspree form; nothing is persisted anywhere automation can read. `report-outdated.html` is additionally behind the pro gate, so families can't reach it.
- **No scheduling exists**: no cron in `.github/workflows/`; no wrangler.toml, no KV, no API keys.
- `metadata.audit_*` counters in `programs.json` (74/38/0) have drifted from the actual per-record `verification.status` distribution (105 verified / 6 partially / 1 unable).

**Honesty constraint baked into this plan:** a purely automatic loop cannot certify "90% correct." Automation provides *coverage* (staleness, liveness, consistency); a small sampled human audit provides the *accuracy number*; a prioritized call queue closes the *availability* gap. Each layer below is explicit about what it proves.

### Default decisions (confirm with the site owner before or during implementation)
1. **Autonomy: PR-only.** The bot never pushes to `updated-main` (runbook: "do not auto-merge"; deploy-on-push risk).
2. **Signal sink: GitHub Issues** via the already-written-but-unwired `createGitHubIssue()` in `functions/api/submit-program.js`. Free, no new service.
3. **Accuracy metric: two-tier** — crawl-verifiable fields scored automatically; call-required fields scored by a quarterly sampled phone audit (~30 programs → ±9% CI, defensible for a 90% claim; degrade to n=15 if call capacity is low).
4. **LLM extraction: deferred** (no API key exists today). Phase 6 stub only; drafts are never auto-merged.

---

## Phase 0 — Fix bugs that corrupt measurement (small, do first)

| File | Bug | Fix |
|---|---|---|
| `src/js/modules/handoff-workspace.js:151,261` | tests `freshness === 'current'`, a value `getVerificationFreshness()` never returns — fresh programs score as unverified | change to `'recent'` (and decide whether `'fresh'` also earns score at line 151 per product intent) |
| `src/js/modules/friction-flags.js` (`insurance_unclear` branch) | tests `'not_listed'` but data uses `'not_listed_on_website'` — branch never fires | match the real enum value |
| `src/js/config/validation-schema.js:132` | `a && b \|\| c` precedence bug in `validateISODate` bypasses the `!isNaN` guard | parenthesize correctly |
| `public/data/programs.json` metadata | `audit_*` counters drifted (74/38/0 vs actual 105/6/1) | recomputed by the Phase 1 run |

Bump `?v=` on pages loading the edited modules (CLAUDE.md rule: `_headers` sets immutable caching; `?v=` is what ships JS changes).

## Phase 1 — Defuse the 2026-08-16 cliff and de-synchronize the cohort

1. **Parameterize hardcoded dates**: `scripts/verify-all-programs.js:20` hardcodes `const REVIEW_DATE='2026-05-17'`, making its skip logic dead — replace with a CLI/env param. Retire `scripts/mark-programs-verified.js` (stamps every program unconditionally regardless of pass/fail).
2. **Run a full re-verification now**: `AUDIT_DATE=<date> node scripts/audit-program-data.js --dry-run` → review diff → real run → `npm run sync-regional-data` → `npm run validate-data && npm run validate-filters`. Land as a PR.
3. **De-synchronize into rolling waves**: new `scripts/assign-verification-waves.js` deterministically assigns each `program_id` to one of 12 weekly waves (hash of id % 12), written as `verification_wave` per record. Future scheduled runs re-verify only the due wave (~9–10 programs/week) so the directory never again expires as one block.
4. **Record the bulk event** in `public/data/verification_changelog.json` (hand-maintained today; Phase 3's job takes over writing it).

## Phase 2 — Staleness gate + accuracy scorecard

1. **`scripts/validate-data.js`**: actually use `REVERIFICATION_THRESHOLD_DAYS`. Policy: >90 days = **warning** listing IDs; >120 days on >20% of records = **blocking error**. (A hard-fail at exactly 90 would brick CI on unrelated PRs the moment anything slips; the graduated gate keeps pressure without hostage-taking.)
2. **New `scripts/accuracy-scorecard.js`** → emits committed `public/data/accuracy_scorecard.json`:
   - **Tier A (crawl-provable)**: % live URLs, phone-on-page, city-on-page, hostname consistency, verification ≤90d — sourced from the audit report + `verification.signals`.
   - **Tier B (call-required)**: field-availability coverage (% populated `intake_phone`, `intake_hours`, `referral_required`, `accepting_new_patients`, `verification_tier ≥ phone_confirmed`) plus the latest sampled-audit agreement rate from Phase 5. **`null`/"unmeasured" until the first audit — never fake a number.**
   - Reuse `getVerificationFreshness()` (`src/js/utils/helpers.js`) thresholds and `buildSnapshot()` staleness math (`scripts/aggregate-gap-snapshot.js`); don't duplicate.
3. Wire the scorecard into `npm run verify` after `validate-data` (report-only; the gate lives in validate-data).

## Phase 3 — The scheduled workflow (the "automatic" part)

**New `.github/workflows/data-freshness.yml`** — `schedule:` cron weekly (e.g. Mon 06:00 CT) + `workflow_dispatch`. Model on `update-playwright-snapshots.yml` (existing commit-back precedent). Steps:

1. Checkout, `npm ci`.
2. `node scripts/audit-program-data.js --wave <current>` (new flag; wave = ISO week % 12), hardened per below.
3. `npm run sync-regional-data` → `node scripts/accuracy-scorecard.js` → `node scripts/aggregate-gap-snapshot.js --period <auto>`.
4. `npm run validate-data && npm run validate-filters && npm run build`.
5. If diff: branch `data-freshness/<date>`, commit, **open a PR** (never push `updated-main`) with a summary table — programs checked, status changes, new broken links, scorecard delta. Open/refresh a GitHub issue listing `needs_manual` programs.

**Crawler hardening (edits to `scripts/audit-program-data.js`):**
- Retry with jittered backoff (2 attempts) before marking a URL down.
- **Failure history** in new committed `scripts/state/url-health.json` (current reports are gitignored — history must be durable). Only flip a program to `unable_to_verify` after failures in **2 consecutive runs**; single failures are PR-note warnings.
- **Stop coercing 403/429 to "ok"**: new `bot_blocked` signal → keep prior status, add a note, route to the manual queue. (`verify-all-programs.js` has the same coercion — fix both, or fold its checks into audit-program-data and deprecate it.)
- `--wave N` filters to `verification_wave === N`, but always also include anything >100 days old regardless of wave (catch-up safety net).

**New generic `scripts/apply-patches.js <patchfile.json> [--dry-run]`** replacing the four frozen `apply-*.js` one-offs: reads a patch map keyed by `program_id`, merges, stamps dates, writes all three mirrors (reuse the `v()` verification-block builder pattern from `apply-internet-verification-may2026.js` and the three-file fan-out from `audit-program-data.js`), then run `sync-regional-data`. Phase 5 call results land through this. Add a `data:patch` npm script.

## Phase 4 — Stop correction signals dying in Gmail

1. **Wire the dormant Cloudflare Function**: point `src/js/submit.js` (`FORMSPREE_ENDPOINT`) and `src/html/report-outdated.html:97` at `/api/submit-program`, keeping Formspree as the existing fallback path. Deploy-side prerequisite (not code): set `GITHUB_TOKEN` (repo-scoped, issues:write) + `GITHUB_REPO` on Cloudflare Pages so `createGitHubIssue()` fires with labels `submission`/`review-needed`. Fix the placeholder Resend sender (`noreply@yourdomain.com`) or drop that branch. Add a `type: correction|submission` field so issues are filterable.
2. **Un-gate `report-outdated` for families**: `src/js/modules/report-outdated.js` wraps `init()` in `VMHRProGate.runWhenUnlocked` — families who spot a wrong phone number can't report it. Remove the gate for this one page (keep the PHI-heuristic blocking). **Product decision — call it out in the PR description for explicit sign-off.**
3. The weekly workflow lists open `correction` issues in its PR summary so reports feed the same loop.

## Phase 5 — Close the "information families most need" gap (human loop, tool-assisted)

Automation cannot phone a clinic; it can make every call count:

1. **New `scripts/build-call-queue.js`** → prioritized call sheet (markdown + JSON): programs ranked by (missing intake fields) × (demand proxy: thin-coverage city × care level from `aggregate-gap-snapshot.js`) × staleness × open correction issues. Each entry: phone, fields to confirm, and a patch-file skeleton for `apply-patches.js`. At ~10 calls/week the 112-program intake backfill completes in ~11 weeks, then sustains on the wave cadence.
2. **Populate `verification_tier`** (`phone_confirmed`) and the Phase 9B intake fields as calls complete — this flips `intake-confidence.js` from 112×"Unconfirmed" to real tiers, directly serving the availability criterion.
3. **Quarterly sampled accuracy audit**: `build-call-queue.js --audit-sample 30` selects a seeded random sample; the operator confirms phone/intake/insurance/availability by call; the agreement rate goes into the scorecard as the **published accuracy number**. This — not the crawl — is the ground truth behind any 90% claim.
4. Call batches append events to `verification_changelog.json` via `apply-patches.js`.

## Phase 6 (deferred, optional) — LLM-assisted extraction

Stub only: an `--extract` mode on the audit script that, given an `ANTHROPIC_API_KEY`, drafts intake-field patches from fetched program pages into a patchfile for human review via `apply-patches.js --dry-run`. Never auto-merged. Do not build until Phases 1–5 are running; requires a new credential.

---

## Critical files

**New:** `.github/workflows/data-freshness.yml`, `scripts/accuracy-scorecard.js`, `scripts/apply-patches.js`, `scripts/assign-verification-waves.js`, `scripts/build-call-queue.js`, `scripts/state/url-health.json`, `public/data/accuracy_scorecard.json`.

**Modified:** `scripts/audit-program-data.js` (retry/backoff, failure history, bot_blocked, `--wave`), `scripts/validate-data.js` (staleness gate), `scripts/verify-all-programs.js` (parameterize or deprecate), `src/js/modules/handoff-workspace.js`, `src/js/modules/friction-flags.js`, `src/js/config/validation-schema.js` (bug fixes), `src/js/submit.js` + `src/html/report-outdated.html` + `src/js/modules/report-outdated.js` (Phase 4), `functions/api/submit-program.js` (sender fix, `type` field), `package.json` (new scripts), `public/data/verification_changelog.json`.

**Reuse, don't rewrite:** `classifyProgram()` / `collectSourceUrls()` / three-mirror write in `audit-program-data.js`; `buildSnapshot()` in `aggregate-gap-snapshot.js`; `getVerificationFreshness()` in `helpers.js`; `createGitHubIssue()` in `functions/api/submit-program.js`; the `v()` block-builder pattern from `apply-internet-verification-may2026.js`; `sync-regional-data.js` as the mandatory post-write step.

## Deploy-side prerequisites (owner action, not code)
- Cloudflare Pages env: `GITHUB_TOKEN` (repo-scoped, issues:write), `GITHUB_REPO` — for Phase 4.
- GitHub repo settings: enable "Allow GitHub Actions to create and approve pull requests" so the workflow's default `GITHUB_TOKEN` can open PRs — verify before Phase 3.

## Verification per phase
1. **Phase 0:** `npm run build && npm run validate-data && npm run validate-filters && npm run test:e2e` (bump `?v=` first); handoff workspace now shows "verification current"-style reasons for fresh programs.
2. **Phase 1:** dry-run diff reviewed; post-run `last_verified` histogram shows the fresh date; all three mirrors in lockstep (validate-data hard-fails on ID drift); waves sum to 112.
3. **Phase 2:** back-date one record >120d in a scratch copy → validator warns; >20% of records → blocks. Scorecard reports Tier B accuracy as "unmeasured" until the first audit.
4. **Phase 3:** `workflow_dispatch` → confirm a PR opens (not a push), summary table renders; verify the two-consecutive-failure rule by pointing one program at a dead URL in a test branch.
5. **Phase 4:** `npx wrangler pages dev` POST to `/api/submit-program` → GitHub issue appears with labels; Formspree fallback still works when the function is unavailable; report-outdated reachable without pro unlock.
6. **Phase 5:** call queue generates; audit sample is seeded/reproducible; one end-to-end patchfile → `apply-patches.js` → `sync-regional-data` → `validate-data` green.
7. **End-to-end:** scorecard shows the staleness cohort broken into 12 wave dates by ~week 12, intake-field coverage trending up, and an accuracy line that honestly reads "unmeasured" until the first sampled audit lands.
