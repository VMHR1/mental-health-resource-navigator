# Manual accessibility checklist (Phase 4.3)

Execute on **staging or production** before launch. Log pass/fail in the deploy verification doc or a dated comment on the release PR.

**Tools:** Keyboard only, VoiceOver (iOS Safari) or NVDA (Windows), optional Android Chrome spot check.

**Target:** WCAG 2.2 AA on critical paths. Automated Lighthouse (≥95) and axe Playwright tests must pass first.

---

## Global (every page)

| # | Check | Pass |
|---|--------|------|
| G1 | Skip link (`Skip to main content`) visible on focus and jumps to `#main` | ☐ |
| G2 | Page has one logical `h1`; heading order is not skipped | ☐ |
| G3 | Focus indicator visible on links, buttons, form controls | ☐ |
| G4 | No keyboard trap; Esc closes modals/trays | ☐ |
| G5 | External links announce “opens in new tab” (screen reader) | ☐ |
| G6 | `prefers-reduced-motion`: no essential content hidden by animation | ☐ |

---

## Homepage — discovery flow

| # | Check | Pass |
|---|--------|------|
| H1 | Crisis banner links reachable and readable | ☐ |
| H2 | Decision cards: Tab order crisis → treatment → guidance; Enter activates | ☐ |
| H3 | After intent: search section revealed; **Find Programs** reachable | ☐ |
| H4 | Search combobox/suggestions: arrow keys, Escape dismisses | ☐ |
| H5 | **Browse all** shows results; results count announced (`aria-live`) | ☐ |
| H6 | Active filter chips removable via keyboard | ☐ |
| H7 | Program card: View details, Call, Share reachable; verified link to About | ☐ |
| H8 | Favorites / History modals: focus trapped, close returns focus | ☐ |

---

## Mobile — filter tray

| # | Check | Pass |
|---|--------|------|
| M1 | **Filters** opens bottom tray; backdrop dismisses | ☐ |
| M2 | Close tray returns focus to **Filters** button | ☐ |
| M3 | Native selects usable inside tray; no horizontal page scroll | ☐ |
| M4 | Results overflow menu (⋯) opens Saved / History on narrow viewports | ☐ |
| M5 | Card primary actions ≥44px tap height | ☐ |

---

## Program detail (`/programs/{id}.html`)

| # | Check | Pass |
|---|--------|------|
| P1 | Program title and care level readable | ☐ |
| P2 | Verification section + “What verified means” link | ☐ |
| P3 | Back to search / crisis links work | ☐ |
| P4 | Share modal: URL readable, close with Esc | ☐ |

---

## Submit wizard

| # | Check | Pass |
|---|--------|------|
| S1 | **Back to search** in header | ☐ |
| S2 | Step labels and required fields announced | ☐ |
| S3 | Validation errors in `#alert` (`role="alert"`) | ☐ |
| S4 | Can complete or abandon without trap | ☐ |

---

## Guides

| # | Check | Pass |
|---|--------|------|
| GU1 | Copy checklist button; live region confirms copy | ☐ |
| GU2 | Care level sections expandable via keyboard | ☐ |

---

## Sign-off

| Field | Value |
|-------|--------|
| Tester | |
| Date | |
| Environment | staging / production |
| Blockers | |

---

## Related automation

```bash
npm run build
npm run test:e2e -- tests/accessibility.spec.js
npm run audit   # Lighthouse multi-page (lighthouserc.json)
```

See also: [Deploy & admin verification](./DEPLOY_AND_ADMIN_VERIFICATION.md)
