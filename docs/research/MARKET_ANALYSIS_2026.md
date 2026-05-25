# ViableMHR Market Analysis 2026

**Type:** Phase 8 research deliverable (documentation only)  
**Access date for external sites:** 2026-05-25  
**Branch context:** `updated-main` (post-launch, Phase 7 active)  
**Disclaimer:** Competitive UX and business-model observations only. Not legal advice. Does not recommend monetization that conflicts with [Launch scope](../product/LAUNCH_SCOPE.md).

---

## Executive summary

ViableMHR occupies a narrow but valuable niche: a **neutral, Texas-focused youth program directory** with discharge-navigation framing, explicit care-level language (PHP/IOP/outpatient), and verification transparency—without accounts, booking, or paid placement.

### Strategic takeaways

1. **Neutrality is a differentiator, not a handicap.** Federal (SAMHSA) and state (Texas HHSC) resources are authoritative but not optimized for “PHP in Frisco for a 14-year-old” style discovery. Commercial directories (Psychology Today, Zocdoc) optimize for individual provider appointment booking and paid visibility—not multi-program facility comparison.
2. **Trust is won through methodology, not ratings.** Competitors lean on reviews, completeness scores, or institutional brand. VMHR’s 90-day verification model, stale badges (Phase 7), and “What verified means” copy align with navigator and caregiver mental models better than star ratings.
3. **Crisis must stay parallel, not competitive.** SAMHSA, NAMI, and hospital sites route crisis through hotlines and system intake. VMHR’s split intent path (crisis vs treatment) matches best practice; do not merge crisis into filtered program results.
4. **Search quality is the product.** Zero-result monitoring (Phase 7.1) matters more than map views or appointment slots. Competitors with weak freshness (FindTreatment.gov OIG findings) show the cost of scale without curation.
5. **SEO opportunity is programmatic + educational.** Few competitors combine city+care landing pages with a neutral directory. VMHR already has guides, slug program pages, and sitemaps—city landing pages are the highest-leverage SEO addition.

### Position vs market (headline)

| Dimension | VMHR position |
|-----------|----------------|
| Trust / neutrality | **Ahead** — no paid ranking; explicit verification |
| Smart search / presets | **Ahead** — NL queries, IOP/PHP presets, insurance parsing |
| National scale | **Behind** — SAMHSA/Zocdoc cover US; VMHR is DFW-centric |
| Appointment booking | **Intentionally absent** — aligns with scope |
| Map-first discovery | **Behind** — FindTreatment.gov, Zocdoc emphasize geo/map |
| Freshness at scale | **Parity risk** — OIG flagged federal locator; VMHR mitigates with 90-day UX |

---

## Section 0: ViableMHR baseline (comparison anchor)

### Product identity

| Attribute | Current state |
|-----------|----------------|
| **Mission** | Neutral directory for Texas youth MH programs; post-discharge and navigation focus |
| **Geo** | Dallas–Fort Worth metro and surrounding North Texas (`constants.js` city list) |
| **Users** | Caregivers, discharge planners, program staff (submit), crisis-adjacent searchers |
| **Monetization** | None — deferred indefinitely per launch scope |

### Discovery features (shipped)

- **Smart search** — natural language (e.g. “IOP in Plano for a 14 year old”), insurance plan parsing (~30 plans)
- **Filters** — care level, age, location, insurance, virtual-only, service domain (MH / SUD / eating disorders), SUD service chips, OSAR referral
- **Presets** — youth/teens, crisis, virtual, IOP/outpatient, eating disorder and SUD variants
- **Results model** — gated until Find Programs / Browse all / preset unlock; crisis toggle separate
- **Detail** — static slug `/programs/{id}.html`, share/QR, legacy `program.html?id=`, home `?program=` expand
- **Local UX** — favorites, history, compare (localStorage); no accounts

### Trust and data (Phases 3 + 7)

- Trust strip + privacy policy aligned with Statcounter (aggregate analytics)
- About page: methodology, 90-day cycle, report-outdated mailto
- **Verification filter enabled** (`SHOW_VERIFICATION_FILTERS: true`)
- **Stale UI** — “Verification overdue” badge >90 days; detail page notice
- **Metrics** — `VMHRProductMetrics` local rollup (no raw queries); see [ZERO_RESULT_MONITORING.md](../operations/ZERO_RESULT_MONITORING.md)

### Technical / SEO

- `sitemap.xml` + `sitemap-programs.xml` (~112 slug URLs)
- Canonical + OG on static pages; Lighthouse CI on home, guides, submit, about, privacy, sample slug
- Multi-script homepage load (~15 deferred JS files) — bundle spike deferred ([BUNDLE_SPIKE_PHASE7.md](../development/BUNDLE_SPIKE_PHASE7.md))

---

## Section 8.1: Competitor profiles

### 1. FindTreatment.gov (SAMHSA)

| Field | Observation |
|-------|-------------|
| **URL** | https://findtreatment.gov/ |
| **Audience** | Anyone in US seeking MH or substance use treatment facilities |
| **Business model** | **Align** — government-funded neutral locator; facilities update via N-SUMHSS survey |
| **Search UX** | Geography: state, county, or distance; facility type (SA/MH/both); service codes; text filters on name/address/phone; paginated API |
| **Crisis** | Not a crisis hotline; separate SAMHSA locators (988, buprenorphine, OTP directories) |
| **Trust** | Confidential/anonymous search; annual facility survey updates; **OIG 2025** found significant inaccurate/outdated facility data at scale |
| **SEO** | Federal domain authority; not city+care landing strategy |
| **VMHR contrast** | VMHR is curated youth programs with care-level language; SAMHSA is facility-level, all ages, national |

### 2. Psychology Today — Therapist Directory

| Field | Observation |
|-------|-------------|
| **URL** | https://www.psychologytoday.com/us/therapists |
| **Audience** | Individuals seeking individual therapists |
| **Business model** | **Conflict** — providers pay **$29.95/month** for listings; platform companies subsidize thousands of profiles |
| **Search UX** | Location + filters: insurance, specialty, gender, modality, age, language, faith, etc.; ~20 results per page; ranking opaque (completeness, keywords, location—not disclosed paid rank) |
| **Crisis** | Not primary; editorial content separate |
| **Trust** | “Largest directory” brand; no facility verification methodology; reviews not central on listing |
| **SEO** | Dominant for “therapist near me” queries (~96% Google overlap claimed by PT) |
| **VMHR contrast** | VMHR lists **programs/facilities**, not individual clinicians; no monthly listing fee |

### 3. NAMI (national + Texas affiliates)

| Field | Observation |
|-------|-------------|
| **URL** | https://www.nami.org/ ; https://www.nami.org/findsupport (local affiliates) |
| **Audience** | Family members and caregivers |
| **Business model** | **Align** — nonprofit; donations; education and support programs |
| **Search UX** | Not a facility directory — **Find Your Local NAMI** by state; Resource Directory PDF/listings; HelpLine 1-800-950-NAMI |
| **Programs** | Family-to-Family, Basics, Family Support Group; Family Caregiver HelpLine (press 4) |
| **Trust** | Lived-experience framing; crisis guide; strong caregiver tone |
| **SEO** | Content hub + affiliate pages; not program slug URLs |
| **VMHR contrast** | VMHR complements NAMI — operational program finding vs emotional support and education |

### 4. Texas HHSC — LMHA/LBHA locator

| Field | Observation |
|-------|-------------|
| **URL** | https://www.hhs.texas.gov/.../find-your-local-mental-health-or-behavioral-health-authority ; https://resources.hhs.texas.gov/directories |
| **Audience** | Texans needing publicly funded MH/SUD services |
| **Business model** | **Align** — state government; 37 LMHAs + 2 LBHAs |
| **Search UX** | County or ZIP → authority contact; 24/7 crisis referral lines; YES Waiver county inquiry PDF |
| **Youth** | Youth-specific intake lines at some centers; not PHP/IOP facility comparison |
| **Trust** | Official; system-oriented (who to call), not program cards |
| **VMHR contrast** | VMHR fills gap for **private and hybrid programs** + care-level search; HHSC is entry to public system |

### 5. Children’s Health — Psychiatry & Psychology

| Field | Observation |
|-------|-------------|
| **URL** | https://www.childrens.com/specialties-services/specialty-centers-and-programs/psychiatry-and-psychology |
| **Audience** | Families seeking care within Children’s system |
| **Business model** | **N/A** — single health system marketing |
| **UX** | Condition/program pages (Depression Clinic, SPARC IOP, Early Childhood MH); phone trees (214-456-8899, 214-456-5937); request appointment |
| **Care levels** | IOP named (SPARC); outpatient; multidisciplinary teams |
| **Crisis** | 911 / emergency messaging; SPARC for suicide behaviors |
| **Trust** | Academic affiliation (UT Southwestern faculty); institutional credibility |
| **VMHR contrast** | VMHR lists Children’s programs **alongside** competitors neutrally |

### 6. UT Southwestern — Psychiatry

| Field | Observation |
|-------|-------------|
| **URL** | https://utswmed.org/conditions-treatments/psychiatry-psychology/ |
| **Audience** | Referrals and patients for UTSW system |
| **Business model** | **N/A** — academic medical center |
| **UX** | Provider profiles (`/doctors/{name}`); Multispecialty Psychiatry Clinic 214-645-8500; conditions/treatments taxonomy |
| **Youth** | Child/adolescent psychiatry; TAY clinic; ties to Children’s programs |
| **Trust** | Research reputation; physician credentials |
| **VMHR contrast** | Provider-centric vs program-centric directory |

### 7. SAMHSA OTP / Buprenorphine locator pattern

| Field | Observation |
|-------|-------------|
| **URL** | https://www.samhsa.gov/find-help/locators (OTP directory, buprenorphine locator being phased) |
| **Audience** | OUD treatment seekers |
| **UX** | Separate specialized locators; FindTreatment.gov includes MAT filters |
| **Note** | Buprenorphine web locator removal planned (maintained transition ended) — points users to FindTreatment.gov |
| **VMHR contrast** | VMHR integrates SUD in **service_domain** + chips (OSAR, etc.) in one search UX |

### 8. ANAD — Eating Disorder Treatment Directory

| Field | Observation |
|-------|-------------|
| **URL** | https://anad.org/learning-library/treatment-directory/ |
| **Audience** | ED patients and families |
| **Business model** | **Mixed** — free peer email referrals; **paid listings** ($5–$500/mo by tier); premium placement options |
| **Search UX** | Browse/list providers and centers; filter by disorder type; referral form (7–10 business days, peer-led) |
| **Trust** | Disclaimer: not clinical referral; verify with provider |
| **VMHR contrast** | VMHR has eating disorder presets + `service_domain`; no paid listing tiers |

### 9. NEDA Treatment Directory (reference)

| Field | Observation |
|-------|-------------|
| **URL** | https://map.nationaleatingdisorders.org/ |
| **UX** | Location search; filters; sponsor callouts (Equip, Fay); provider listing caps |
| **VMHR contrast** | Similar condition-specific goal; VMHR embeds ED in unified directory |

### 10. Zocdoc (light touch — patterns only)

| Field | Observation |
|-------|-------------|
| **URL** | https://www.zocdoc.com/therapist-counselors |
| **Audience** | Patients booking appointments |
| **Business model** | **Conflict** — marketplace; providers pay for visibility; booking is conversion |
| **Search UX** | Location + insurance plan required; map; availability slots; same-day filter; video visit filter |
| **Trust** | “Verified” = credential check for platform onboarding, not listing freshness |
| **Do not copy** | Appointment-first funnel; insurance as gate to see providers |

### 11. Healthgrades (light touch)

| Field | Observation |
|-------|-------------|
| **Pattern** | Physician ratings, hospital scores, search by specialty and location |
| **Business model** | **Conflict** — advertising and sponsored profiles |
| **Do not copy** | Star ratings as primary sort; pay-for-reputation |

---

## Comparison matrix

| Criterion | ViableMHR | FindTreatment.gov | Psychology Today | NAMI | Texas HHSC | Children's / UTSW | ANAD | Zocdoc |
|-----------|-----------|-------------------|------------------|------|------------|-------------------|------|--------|
| **Model alignment** | Baseline | Align | Conflict | Align | Align | N/A (system) | Mixed | Conflict |
| **NL / smart search** | Strong | Weak (codes) | Keyword | N/A | N/A | N/A | N/A | Symptom text |
| **Faceted filters** | Strong | Strong | Strong | N/A | County only | N/A | Moderate | Strong |
| **Care level (PHP/IOP)** | Explicit | Service codes | Modality | N/A | N/A | Program pages | Level in listing | N/A |
| **Insurance filter** | Plans + buckets | N/A | Yes | N/A | N/A | Per system | In listing | Required |
| **Location model** | City + service area | State/county/miles | ZIP/city | State affiliate | County/ZIP | Single system | Region | Map + ZIP |
| **Telehealth toggle** | Yes | Via services | Yes | N/A | N/A | Some | Virtual providers | Video filter |
| **Crisis handling** | 988 + intent path | Separate tools | Secondary | HelpLine | 24/7 LMHA line | 911 + program | Hotline | N/A |
| **Verification UX** | Date + stale badge | Survey cycle | Profile completeness | N/A | N/A | Institutional | Self-reported | Credential verify |
| **Accounts** | No | No | No (provider account) | No | No | Patient portal | No | Yes (booking) |
| **Monetization visible** | None | None | $/mo listing | Donation | Public | System | Listing fees | Marketplace |
| **Mobile filters** | Tray + advanced | Form-heavy | Responsive | N/A | Basic | Mobile site | Variable | Strong |

---

## Section 8.2: Business models and VMHR neutrality

| Model | Examples | vs VMHR neutrality |
|-------|----------|-------------------|
| Government / grant neutral | SAMHSA, HHSC | **Align** — VMHR should cite and link, not compete on authority |
| Nonprofit education + support | NAMI, ANAD (partial) | **Align** for mission; ANAD listing fees are minor conflict |
| Provider subscription listings | Psychology Today | **Conflict** — reject |
| Marketplace / booking | Zocdoc, Healthgrades | **Conflict** — reject |
| Lead gen to treatment centers | Some call-tracking directories | **Conflict** — reject |
| Health system funnel | Children's, UTSW | **N/A** — not competitors; listing sources |
| Paid featured placement | NEDA sponsors noted on map | **Conflict** — reject for VMHR |

**VMHR rule:** Revenue must not change sort order, visibility, or verification status.

---

## Section 8.3: UX strengths (market patterns)

| Source | Strength to note |
|--------|------------------|
| FindTreatment.gov | Anonymous search; clear SA vs MH type; API for integrators |
| Psychology Today | Dense filters; insurance-first mental model for families |
| NAMI | Caregiver language; helpline + local affiliate path |
| HHSC | County-based routing to live crisis line |
| Children's Health | Program-level pages by condition; clear phone routing |
| Zocdoc | Availability and insurance upfront; map + list |
| ANAD | Condition-specific directory + human referral option |
| VMHR (self) | Presets, smart search, compare, slug share, verification honesty |

---

## Section 8.4: UX weaknesses (avoid)

| Source | Weakness |
|--------|----------|
| FindTreatment.gov | Stale/inaccurate data at scale; not youth-specific |
| Psychology Today | Listing ≠ fit; platform-managed profile flooding; referral decline |
| Zocdoc | Account/booking friction; not program-level |
| ANAD | Slow peer referral; paid tier confusion |
| Healthgrades | Rating gaming; sponsored results |
| General | Pay-to-rank opacity; PHI-heavy intake forms; account walls for phone numbers |

---

## Section 8.5: Trust and credibility comparison

| Signal | VMHR | Federal/State | Commercial |
|--------|------|---------------|------------|
| Neutrality statement | About + trust strip | Implicit | Often absent or buried |
| Verification methodology | 90-day + source + stale badge | Survey-based | Profile completeness |
| Last updated | Footer + per listing | Varies | Often missing |
| Reviews / stars | None | None | Common (risk) |
| Crisis disclaimer | Banner + intent | Hotlines | Variable |
| Paid endorsement risk | Low | Low | High |

**Recommendation:** Keep **no star ratings**. Double down on verification transparency and report-outdated flow.

---

## Section 8.6: SEO observations

| Tactic | Competitors | VMHR today | Opportunity |
|--------|-------------|------------|-------------|
| Program slug URLs | Some | Yes (~112) | Maintain |
| City + care landing pages | PT, Zocdoc local SEO | No | **Phase9+** static pages with search prefill |
| JSON-LD | Hospitals, Zocdoc | Limited | Add `MedicalOrganization` / `FAQ` where accurate |
| Content hub | NAMI, hospital blogs | Guides page | Link guides → pre-filled searches |
| Sitemap scale | Massive (federal) | Static + programs | Keep both sitemaps fresh on build |
| Branded vs non-branded | PT owns “therapist” | “ViableMHR” + DFW | Target “IOP Plano adolescent” long-tail |

---

## Section 8.7: Feature inventory vs VMHR

| Feature | VMHR | SAMHSA | PT | NAMI | HHSC | Zocdoc |
|---------|------|--------|----|----|------|--------|
| Natural language search | Yes | No | Partial | No | No | Partial |
| Age filter | Yes | No | Yes | N/A | N/A | No |
| Insurance filter | Yes | No | Yes | N/A | N/A | Yes |
| Care level PHP/IOP/OP | Yes | Codes | No | N/A | N/A | No |
| Telehealth toggle | Yes | Services | Yes | N/A | N/A | Yes |
| Distance sort | Yes | Miles | Location | N/A | N/A | Map |
| Compare programs | Yes | No | No | N/A | No | No |
| Favorites / local history | Yes | No | No | N/A | No | Account |
| Crisis toggle | Yes | Separate | No | HelpLine | Crisis line | No |
| SUD / ED domains | Yes | Types | Specialty | N/A | N/A | Specialty |
| OSAR / referral chips | Yes | No | No | N/A | N/A | No |
| Multi-location programs | Yes | Facilities | N/A | N/A | N/A | N/A |
| Service area (county/point) | Yes | County | ZIP | County | County | ZIP |
| Waitlist / accepting patients | Partial text | Sometimes | Sometimes | N/A | N/A | Availability |
| Map view | No | Yes | No | No | No | Yes |
| Book appointment | No | No | No | No | No | Yes |
| Verification recency filter | Yes (P7) | No | No | N/A | N/A | No |

---

## Section 8.8: Inspiration backlog (prioritized)

| Priority | Item | Tag | Rationale |
|----------|------|-----|-----------|
| P1 | City + care landing pages (“IOP in Plano”) with search prefill | **Phase9+** | Highest SEO gap vs PT/Zocdoc local pages |
| P1 | Structured report-outdated form (not only mailto) | **Phase9+** | ANAD/HHSC use forms; reduces moderator friction |
| P2 | First-party zero-result dashboard (aggregate from metrics export) | **Phase7+** | Extends 7.1 local rollup for team review |
| P2 | JSON-LD on program slug pages (validated schema) | **Phase9+** | Hospital sites use structured data |
| P2 | Navigator printable PDF / one-page resource sheet | **Phase9+** | NAMI-style caregiver export |
| P3 | Verification badge tiers (source documented vs phone confirmed) | **Phase9+** | Differentiate without paid badges |
| P3 | Map view optional layer (list default) | **Phase9+** | SAMHSA/Zocdoc pattern; keep list primary |
| P3 | Empty-state suggested presets from zero-result signatures | **Phase7+** | Uses product-metrics data |
| P4 | School counselor bulk sheet / zip export | **Phase9+** | Institutional referrer need |
| — | Paid featured listings | **Won't do** | Conflicts with launch scope |
| — | Star ratings / reviews | **Won't do** | Trust and moderation risk |
| — | Provider subscription listings | **Won't do** | Psychology Today model |
| — | In-app appointment booking | **Won't do** | Out of scope |
| — | Phone number account wall | **Won't do** | Zocdoc-style friction |

### Top 5 for next quarter

1. City + care landing pages (SEO + zero-result reduction)  
2. Structured report-outdated intake  
3. Zero-result dashboard from `VMHRProductMetrics` exports  
4. JSON-LD on slug pages (with legal/schema review)  
5. Empty-state dynamic suggestions from top zero-result signatures  

---

## Section 8.9: Do not copy (explicit)

From phased plan plus research:

- Paid placement or “featured provider” slots  
- Star ratings without moderation  
- Provider-paid “verified” badges  
- Lead sale to treatment centers or call-tracking arbitrage  
- Aggressive intake forms collecting PHI  
- Dark patterns favoring specific providers  
- Hidden affiliate links  
- Account requirement to view phone numbers  
- Psychology Today–style monthly listing rank  
- Zocdoc-style booking-first UX that hides neutral comparison  
- NEDA-style sponsor callouts in search results  

**Launch scope reinforcement:** Monetization remains deferred; Phase 8 must not be used to justify pay-to-play ranking ([LAUNCH_SCOPE.md](../product/LAUNCH_SCOPE.md) § Monetization).

---

## Section 8.10: Legal, ethics, and compliance (desk review)

*For counsel review—not legal conclusions.*

| Topic | VMHR current posture | Gap / action |
|-------|---------------------|--------------|
| **FTC health claims** | Informational directory; no outcome claims | Review marketing copy if adding testimonials |
| **HIPAA** | No PHI in analytics; submit warns against PHI | Keep submit review human; no auto-publish |
| **Texas HHSC / licensing** | Lists programs; does not license | Optional: link license types in About |
| **42 CFR Part 2 (SUD)** | Display only; no SUD patient data collection | Avoid logging SUD-specific search queries externally |
| **Crisis liability** | 988 banner; disclaimers; not triage | Periodic copy review with clinical advisor |
| **Minors / local storage** | Favorites/history local only | Privacy policy mentions; no child accounts |
| **COPPA** | No under-13 accounts | Maintain no-account model |
| **ADA / WCAG** | Target 2.2 AA; CI axe/Lighthouse | Continue manual SR checklist |
| **“Verified” advertising** | Defined on About; stale badge | Avoid implying clinical quality |
| **GDPR/CCPA** | Minimal collection; Statcounter | Update privacy if first-party analytics added |

---

## Sources consulted

| Resource | URL | Date accessed |
|----------|-----|---------------|
| FindTreatment.gov | https://findtreatment.gov/ | 2026-05-25 |
| SAMHSA locators | https://www.samhsa.gov/find-help/locators | 2026-05-25 |
| HHS OIG FindTreatment audit | https://oig.hhs.gov/reports/all/2025/samhsas-findtreatmentgov-contained-some-inaccurate-information-on-substance-use-and-mental-health-treatment-facilities/ | 2026-05-25 |
| Psychology Today signup | https://join.psychologytoday.com/us/signup | 2026-05-25 |
| NAMI caregivers | https://www.nami.org/family-members-and-caregivers/ | 2026-05-25 |
| Texas HHSC LMHA finder | https://www.hhs.texas.gov/services/mental-health-substance-use/mental-health-substance-use-resources/find-your-local-mental-health-or-behavioral-health-authority | 2026-05-25 |
| Children's Health psychiatry | https://www.childrens.com/specialties-services/specialty-centers-and-programs/psychiatry-and-psychology | 2026-05-25 |
| UT Southwestern psychiatry | https://utswmed.org/conditions-treatments/psychiatry-psychology/ | 2026-05-25 |
| ANAD treatment directory | https://anad.org/learning-library/treatment-directory/ | 2026-05-25 |
| Zocdoc therapists | https://www.zocdoc.com/therapist-counselors | 2026-05-25 |

---

## Related internal documents

- [Phased Launch Build Plan](../product/ViableMHR-Phased-Launch-Build-Plan.md) — Phase 8 spec  
- [Phase 7 post-launch](../product/PHASE7_POST_LAUNCH.md)  
- [Analytics plan](../product/ANALYTICS_PLAN.md)  
- [Launch scope](../product/LAUNCH_SCOPE.md)  
- [Program URL strategy](../product/PROGRAM_URL_STRATEGY.md)

---

*End of report. No application code changes in Phase 8.*
