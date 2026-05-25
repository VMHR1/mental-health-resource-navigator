# Module bundle spike (Phase 7.3)

**Status:** Spike complete — **defer full migration**  
**Last updated:** 2026-05-23

## Problem

Homepage loads ~15 deferred scripts (`index.html`) plus `app.js`. Each file is a separate network round trip on cold load, which hurts LCP on mobile (Lighthouse homepage performance ~0.53 at launch).

## Current build (`scripts/build.js`)

| Setting | Value |
|---------|--------|
| Bundler | esbuild |
| `bundle` | `false` (copy/transpile per entry) |
| ESM entries | `app.js`, `search.js`, `constants.js`, `state-manager.js`, etc. |
| Copied unchanged | `filters.js`, `render.js`, `events.js`, `home-phase1.js`, … |

## Spike options

| Option | Effort | Risk | Notes |
|--------|--------|------|-------|
| **A. Single app bundle** | High | High | Must preserve `window.*` globals used across files |
| **B. Two bundles** (`core` + `ui`) | Medium | Medium | `core`: constants, helpers, filters, search; `ui`: render, events, home-phase1 |
| **C. Status quo + HTTP/2** | Low | Low | Cloudflare already multiplexes; biggest win is font defer + fewer scripts |

## Recommendation

**Defer Option A until after Phase 7.2/7.1 metrics stabilize.** Next incremental step:

1. Add one esbuild entry `src/js/home-bundle.js` that re-exports only homepage-critical path for experiment branch.
2. Compare waterfall on throttled 4G (3 runs median) — document in `docs/performance/PHASE4_BASELINE.md`.
3. Adopt Option B only if LCP improves ≥200ms without breaking admin/submit pages (they use smaller script sets).

## Globals that block naive bundling

- `window.matchesFilters`, `window.parseSmartSearch`, `window.sortPrograms`
- `window.FEATURE_FLAGS`, `window.programPublicPath`
- `app.js` assigns dozens of callbacks to `window` for `events.js`

Migration must be **incremental** (one module at a time) or use explicit `export` + single IIFE attaching to `window.VMHR`.

## Acceptance (when revisiting)

- [ ] Median LCP &lt; 2.5s on simulated 4G OR documented exception
- [ ] No regression in `npm run verify` e2e
- [ ] Admin/submit pages unchanged unless intentionally bundled

## Related

- [Performance findings](../performance/PERFORMANCE_FINDINGS.md)
- [Refactor plan](./REFACTOR_PLAN.md)
