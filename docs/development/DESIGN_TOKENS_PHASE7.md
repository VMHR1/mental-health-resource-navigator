# Design token unification (Phase 7.5)

**Status:** Roadmap — incremental  
**Last updated:** 2026-05-23

## Problem

Two token families coexist:

| Family | Files | Examples |
|--------|-------|----------|
| **Phase 1 / VM** | `public/phase1-design.css` | `--vm-ink`, `--vm-muted`, `--vm-accent-deep` |
| **Legacy** | `public/styles.css` | `--ink`, `--muted`, `--border` |

Legal pages and older components use legacy tokens; homepage Phase 1 uses `--vm-*`, causing subtle contrast and spacing drift.

## Target state

Single reference in `public/phase1-design.css` `:root`:

```css
:root {
  --ink: var(--vm-ink);
  --muted: var(--vm-muted);
  /* alias legacy → vm for one release */
}
```

Then migrate `styles.css` rules to `--vm-*` over time and delete duplicate definitions.

## Suggested order

1. [ ] Add alias block in `phase1-design.css` (no visual change)
2. [ ] Audit legal pages (privacy, terms, about) — replace `--ink` with `--vm-ink` where safe
3. [ ] Run Lighthouse contrast on privacy + home after each batch
4. [ ] Document component ownership table below

## Component ownership (draft)

| Surface | Primary CSS | Owner module |
|---------|-------------|--------------|
| Homepage hero / search | `phase1-design.css` | `home-phase1.js` |
| Program cards | `phase1-design.css` + `styles.css` | `render.js` |
| Modals / trays | `phase1-design.css` | `home-phase1.js`, `events.js` |
| Program slug detail | `styles.css` | `program-detail.js` |
| Submit wizard | `styles.css` | `submit.js` |
| Guides / About | `styles.css` | static HTML |

## Acceptance

- [ ] Token reference section in this doc matches `:root` in repo
- [ ] Legal pages pass contrast ≥ 4.5:1 for body text (WCAG AA)
- [ ] No visual regression on mobile snapshots (`tests/mobile.spec.js`)

## Related

- [Phase 4 baseline](../performance/PHASE4_BASELINE.md)
- [Manual a11y checklist](../operations/MANUAL_A11Y_CHECKLIST.md)
