# ViableMHR Launch Scope

**Status:** Approved for Phase 1 foundation  
**Last updated:** 2026-05-23  
**Branch context:** `updated-main`

## Purpose

ViableMHR is a neutral, informational directory helping families and caregivers find youth mental health programs in Texas—especially after hospital discharge or during care navigation. This document defines what ships at launch, what is explicitly out of scope, and how success is measured.

## Target users (launch)

| User | Primary need |
|------|----------------|
| Parents / caregivers | Find age-appropriate programs (PHP, IOP, outpatient) near home or via telehealth |
| Discharge planners / navigators | Quick, filterable list with verification dates and contact info |
| Program staff | Submit or request updates to listings |
| Crisis-adjacent searchers | Immediate 988 / SAMHSA paths without blocking treatment search |

## In scope at launch

- **Program discovery:** Smart search, filters (care level, age, insurance, location, service domain), specialized presets, compare/favorites (local storage)
- **Program detail:** Static slug pages at `/programs/{program_id}.html`, legacy `program.html?id=` resolution
- **Guidance content:** Guides page (care levels, call checklist)
- **Submissions:** Multi-step submit form → Formspree → human review → `programs.json` update
- **Trust & legal:** Privacy, terms, about (methodology shell expanding in Phase 3)
- **Accessibility:** WCAG 2.2 AA target; Lighthouse accessibility ≥ 95 on priority pages
- **Crisis handling:** Persistent 988 banner; crisis intent path; no clinical triage on-site

## Explicitly out of scope (launch)

- **Diagnosis or clinical advice** — informational directory only
- **Booking / intake scheduling** — users contact programs directly
- **Paid ranking or featured listings** — no pay-to-play placement
- **Monetization** — ads, lead gen, provider subscriptions (deferred indefinitely per product decision)
- **User accounts** — no login; favorites/history in browser storage only
- **Real-time availability / waitlists** — unless publicly verified and manually maintained
- **Automated publish from submissions** — all listings require human review
- **PHI collection** — submit form warns against patient-specific health details

## Success metrics (first 90 days post-launch)

Measure monthly unless noted. Baselines established in first two weeks.

| # | Metric | Target / signal | How measured |
|---|--------|-----------------|--------------|
| 1 | **Zero-result search rate** | &lt; 15% of unlocked searches return 0 programs | Statcounter + manual query log / future analytics plan |
| 2 | **Submit funnel completion** | ≥ 60% of started drafts reach Formspree submit | Formspree submissions vs. client-side draft starts (approximate until analytics) |
| 3 | **Program detail views** | Growing week-over-week; ≥ 30% of search sessions open ≥ 1 detail | Statcounter page paths for `/programs/*.html` |
| 4 | **Crisis path usage** | Crisis card clicks and 988 link clicks tracked qualitatively | Manual review + link analytics |
| 5 | **Data freshness** | 100% of listed programs verified within 90 days OR flagged stale in UI (Phase 7) | `validate-data.js` + `metadata.generated_at` |
| 6 | **Accessibility regression** | No drop below 95 Lighthouse accessibility on home, guides, submit, program slug, privacy | CI / pre-deploy `npm run audit` |
| 7 | **Trust incidents** | Zero unresolved false claims (tracking, paid ranking, clinical endorsement) | User reports + internal review |

## Launch-critical dependencies (from phased plan)

Must complete before public launch:

- Submit-to-publish runbook (`docs/operations/SUBMIT_TO_PUBLISH_RUNBOOK.md`)
- Program URL strategy documented (`docs/product/PROGRAM_URL_STRATEGY.md`)
- Admin/deploy verification (`docs/operations/DEPLOY_AND_ADMIN_VERIFICATION.md`)
- Trust strip accuracy (Phase 3.1 — no false “zero tracking” claim)
- Privacy policy alignment with Statcounter (Phase 3.2)
- Sitemap includes guides + about (Phase 5.1)
- Full QA checklist (Phase 6)

## Monetization

**Deferred.** No implementation, design, or pricing work in launch phases. Phase 8 market analysis may inform future product direction but must not introduce paid placement conflicting with neutrality principles.

## Ownership

| Area | Owner (fill before launch) |
|------|----------------------------|
| Product scope | _________________ |
| Data / listings | _________________ |
| Deploy / infra | _________________ |
| Legal / privacy copy | _________________ |

## Related documents

- [Phased Launch Build Plan](./ViableMHR-Phased-Launch-Build-Plan.md)
- [Submit-to-publish runbook](../operations/SUBMIT_TO_PUBLISH_RUNBOOK.md)
- [Program URL strategy](./PROGRAM_URL_STRATEGY.md)
- [Deploy & admin verification](../operations/DEPLOY_AND_ADMIN_VERIFICATION.md)
