# Post-launch analytics plan (privacy-preserving)

**Status:** Planning document — no additional tracking implemented at launch  
**Last updated:** 2026-05-23  
**Aligns with:** [Privacy Policy](../../src/html/privacy.html#analytics), [Launch scope](./LAUNCH_SCOPE.md)

## Current state at launch

| Tool | Scope | Data collected |
|------|--------|----------------|
| **Statcounter** | All public pages (including guides as of Phase 5.3) | Aggregate page views, referrers, coarse geography; invisible mode; no ad profiling |
| **Formspree** | Submit wizard only | Program submission payload (moderator review) |
| **Browser storage** | Favorites, history, drafts | Local only; not sent to VMHR servers |

No Google Analytics, Meta Pixel, or ad/marketing trackers.

---

## Goals (post-launch, when traffic warrants)

Measure product health without storing PII or raw search queries on third-party servers:

1. Reduce zero-result searches
2. Understand which entry paths work (intent cards, presets, smart search)
3. Track submit funnel drop-off (client-side only until policy update)
4. Monitor crisis vs treatment path usage (aggregate counts)

---

## Proposed event catalog (future)

Events are **counts or buckets only** — not user-identifiable profiles.

| Event | Trigger | Properties (allowed) | Properties (never) |
|-------|---------|----------------------|---------------------|
| `search_executed` | Find Programs click | `results_count` bucket (0, 1–5, 6–20, 21+), `has_location`, `has_care_filter` | Raw query string, user ID |
| `zero_results` | Results count = 0 after search | `filter_count`, `care_level` if set | Full query text |
| `preset_used` | Quick-start / specialized preset | `preset_id` (e.g. `youth-teens`, `iop`) | — |
| `intent_chosen` | Decision card | `intent` (`crisis`, `treatment`, `guidance`) | — |
| `program_detail_view` | Slug page load or card expand | `program_id` (public listing ID) | — |
| `call_click` | Call program button | `program_id`, `surface` (`card`, `detail`) | Phone number dialed |
| `share_click` | Share modal open | `program_id` | — |
| `submit_step` | Submit wizard navigation | `step` (1–4), `action` (`next`, `back`, `submit`) | Form field values |
| `submit_success` | Formspree 200 | — | Submission body |
| `browse_all` | Browse all programs | — | — |
| `crisis_toggle` | Show crisis resources | `enabled` boolean | — |

---

## Implementation options (deferred)

| Approach | Pros | Cons |
|----------|------|------|
| **Statcounter event goals** | Already deployed; minimal new code | Limited custom dimensions |
| **First-party aggregate endpoint** | Full control; hash queries server-side | Requires backend + privacy review |
| **Client-only weekly rollup** | No new third parties | Hard to aggregate across users |

**Recommendation:** Start with Statcounter page paths + manual zero-result sampling (Phase 7). Add custom events only after privacy policy section update and 90-day review.

---

## Privacy review checklist (before any new tracking)

- [ ] Event list reviewed against [Privacy Policy](../../src/html/privacy.html)
- [ ] No raw search query sent to third parties
- [ ] No cross-site ad tracking or remarketing pixels
- [ ] No fingerprinting or persistent user IDs beyond Statcounter defaults
- [ ] Crisis searches not singled out in identifiable way
- [ ] Submit form contents never duplicated to analytics
- [ ] User can still use site with analytics blocked (graceful degradation)
- [ ] Change logged in privacy policy “Last updated” date

---

## Success metrics mapping

From [Launch scope](./LAUNCH_SCOPE.md):

| Metric | Primary signal |
|--------|----------------|
| Zero-result rate | `zero_results` / `search_executed` (future) or manual log |
| Submit completion | Formspree count vs. client `submit_step` reach step 4 |
| Program detail views | Statcounter `/programs/*.html` paths |
| Crisis path usage | `intent_chosen` crisis + 988 link clicks (qualitative until events) |

---

## Related documents

- [Phased Launch Build Plan](./ViableMHR-Phased-Launch-Build-Plan.md) — Phase 5.4
- [Submit-to-publish runbook](../operations/SUBMIT_TO_PUBLISH_RUNBOOK.md)
- [Phase 4 performance baseline](../performance/PHASE4_BASELINE.md)
