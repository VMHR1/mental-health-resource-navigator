# Phase 4 performance baseline

Document LCP, INP, and CLS on throttled mobile for launch sign-off. Re-run after major UI or script changes.

**Last captured:** _not yet run — fill after first measurement_

---

## How to measure

1. `npm run build && npm run preview:serve`
2. Chrome DevTools → Lighthouse → Mobile → Performance + Accessibility
3. Throttling: **Slow 4G** + **Mobile CPU slowdown**
4. URLs (priority):

| Page | URL | LCP | INP | CLS | Perf score |
|------|-----|-----|-----|-----|------------|
| Home | `/` | | | | |
| Program slug | `/programs/crisis-988.html` | | | | |
| Guides | `/guides.html` | | | | |
| Submit | `/submit.html` | | | | |

**Targets (launch guidance):**
- LCP &lt; 2.5s (ideal); document mitigation if higher
- CLS &lt; 0.1
- INP &lt; 200ms where measurable

---

## Current mitigations

- Google Fonts use `display=swap` on pages that load DM Sans / Inter
- `preconnect` to `fonts.googleapis.com` and `fonts.gstatic.com` on primary templates
- Service worker caches static assets; HTML/JS use network-first where configured (`public/sw.js`)
- Build bundles app JS via esbuild; program slug pages are static HTML

---

## Known cost drivers

- Full `programs.json` fetch on homepage (~112 programs)
- Multiple script modules on index (search, render, filters, phase-1 flow)
- Statcounter analytics (minimal; third-party)
- Phase 1 design CSS (~1.9k lines) loaded on homepage

---

## If LCP regresses

1. Confirm font swap and preconnect on all high-traffic pages
2. Defer non-critical scripts below first paint
3. Consider self-hosting font subset
4. Re-measure after change; update table above

---

## CI

Lighthouse runs via `npm run audit` (see `lighthouserc.json`). Performance thresholds are warn-only in CI; accessibility is **error at ≥0.95**.
