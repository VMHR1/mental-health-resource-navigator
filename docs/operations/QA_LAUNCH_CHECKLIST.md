# Launch QA checklist (Phase 6.2)

Execute on a **production-like build** before public launch:

```bash
npm run build && npm run preview:serve
# Open http://127.0.0.1:4173
```

Also run automated gate:

```bash
npm run verify
```

Log pass/fail below. Cross-browser spot check (6.4) requires manual sessions in Chrome, Firefox, and Safari (desktop + iOS).

---

## Environment

| Field | Value |
|-------|--------|
| Tester | |
| Date | |
| Build / commit | |
| URL tested | staging / preview / production |

---

## Crisis and intent paths

| # | Check | Pass |
|---|--------|------|
| C1 | 988 banner visible on homepage; links work | ☐ |
| C2 | Crisis intent card → crisis resources visible; treatment search still reachable | ☐ |
| C3 | Treatment intent → search section reveals; **Find Programs** shows results | ☐ |
| C4 | Guidance intent → guides link / path works | ☐ |
| C5 | **Browse all** shows full program list without extra clicks | ☐ |

---

## Smart search and filters

| # | Check | Pass |
|---|--------|------|
| S1 | `PHP in Frisco for a 14 year old` returns sensible results | ☐ |
| S2 | `IOP in Plano` returns results | ☐ |
| S3 | Insurance query (e.g. `accepts Cigna`) filters correctly | ☐ |
| S4 | Virtual therapy preset returns telehealth programs | ☐ |
| S5 | Reset clears search, chips, and filters | ☐ |
| S6 | Mobile filter tray opens, applies filter, closes; focus returns | ☐ |

---

## Program cards and detail

| # | Check | Pass |
|---|--------|------|
| P1 | Expand card shows details; collapse works (Safari: test `inert`) | ☐ |
| P2 | **View details** opens `/programs/{id}.html` slug page | ☐ |
| P3 | Legacy `program.html?id=` still resolves | ☐ |
| P4 | Home `?program={id}` deep link expands card | ☐ |
| P5 | Share modal copies slug URL; QR encodes slug | ☐ |
| P6 | Call link uses `tel:`; website opens in new tab with SR disclosure | ☐ |
| P7 | Verification date / “What verified means” link to About | ☐ |

---

## Favorites, history, compare

| # | Check | Pass |
|---|--------|------|
| F1 | Save favorite persists after reload (same browser) | ☐ |
| F2 | History records recent searches | ☐ |
| F3 | Compare tray (if used) opens and closes without trap | ☐ |

---

## Submit wizard

| # | Check | Pass |
|---|--------|------|
| SU1 | **Back to search** in header works | ☐ |
| SU2 | Empty step shows validation alert (`#alert`) | ☐ |
| SU3 | Draft persists in localStorage on refresh (optional spot check) | ☐ |
| SU4 | Do **not** submit real PHI in QA; use test data only if testing Formspree | ☐ |

---

## Guides and About

| # | Check | Pass |
|---|--------|------|
| G1 | Guides internal links and footer links work | ☐ |
| G2 | Copy checklist feedback (visual + screen reader) | ☐ |
| G3 | About `#report-outdated` mailto and submit links work | ☐ |

---

## Legal and trust

| # | Check | Pass |
|---|--------|------|
| L1 | Trust strip accurately describes analytics (not “zero tracking”) | ☐ |
| L2 | Privacy policy mentions Statcounter | ☐ |
| L3 | Footer “Last updated” dates reasonable | ☐ |

---

## Cross-browser spot check (6.4)

Repeat **S1**, **P1**, **P2** in each environment:

| Browser | Desktop pass | Mobile pass | Notes |
|---------|--------------|-------------|-------|
| Chrome | ☐ | ☐ | |
| Firefox | ☐ | — | |
| Safari | ☐ | ☐ | |

---

## Sign-off

| Result | |
|--------|---|
| **Launch ready** | Yes / No |
| Blockers | |

---

## Related automation

| Suite | Command |
|-------|---------|
| Smoke | `npm run test:e2e -- tests/smoke.spec.js` |
| Submit / guides | `npm run test:e2e -- tests/submit.spec.js tests/guides.spec.js` |
| Links | `npm run test:e2e -- tests/links.spec.js` |
| Accessibility | `npm run test:e2e -- tests/accessibility.spec.js` |
| Manual a11y | [MANUAL_A11Y_CHECKLIST.md](./MANUAL_A11Y_CHECKLIST.md) |
| Launch deploy | [LAUNCH_DAY_DEPLOY_CHECKLIST.md](./LAUNCH_DAY_DEPLOY_CHECKLIST.md) |
