# Launch day deploy checklist (Phase 6.5)

Single ordered runbook for staging dry-run and production launch. Complete every step; do not skip validation gates.

**Owners:** See [Submit-to-publish runbook](./SUBMIT_TO_PUBLISH_RUNBOOK.md) role assignments.

---

## Pre-deploy (local / CI)

```bash
git pull origin updated-main   # or your production branch
npm ci
npm run validate-data
npm run validate-filters
npm run build
npm run test:e2e
npm run audit                    # optional same-day; required before major release
```

### Build artifact verification

- [ ] `dist/sitemap.xml` — no legacy `program.html`; includes guides + about
- [ ] `dist/sitemap-programs.xml` — URL count matches program count (~112)
- [ ] `dist/programs/*.html` — one slug file per program
- [ ] `dist/programs.json` — matches `public/data/programs.json`
- [ ] `dist/admin.html` — **absent** unless intentional admin deploy (`INCLUDE_ADMIN=1`)

---

## Staging dry-run (recommended)

- [ ] Deploy `dist/` to staging / preview URL
- [ ] Run preview smoke:

```bash
npm run preview:serve
# Or against staging:
PROD_URL=https://staging.example.com npm run smoke:prod
```

- [ ] Open 3 random `/programs/{id}.html` URLs — title, phone, verification line correct
- [ ] Homepage search: `IOP in Plano` returns results
- [ ] Submit page loads; **do not** submit production Formspree from staging unless intended
- [ ] `/sitemap.xml` and `/sitemap-programs.xml` return 200
- [ ] `/robots.txt` lists both sitemaps

---

## Production deploy

- [ ] Merge approved release branch to production branch (Cloudflare Pages)
- [ ] Wait for Cloudflare Pages build → **Success**
- [ ] Note deployment ID / timestamp in sign-off log below

---

## Post-deploy smoke (production)

```bash
npm run smoke:prod
# Or: PROD_URL=https://viablemhr.com npm run smoke:prod
```

Manual (incognito):

- [ ] `https://viablemhr.com/` — programs load; no “unable to load” banner
- [ ] Share from one program → slug URL opens correctly
- [ ] `https://viablemhr.com/guides.html` — 200
- [ ] `https://viablemhr.com/about.html#report-outdated` — 200
- [ ] Unauthenticated `https://viablemhr.com/admin.html` — Cloudflare Access gate (not public dashboard)

Security headers (Network tab on `index.html`):

- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`

---

## Operations handoff

- [ ] Formspree inbox monitored; moderator on SLA ([runbook](./SUBMIT_TO_PUBLISH_RUNBOOK.md))
- [ ] Rollback path confirmed (previous Cloudflare deployment or git revert)
- [ ] [QA launch checklist](./QA_LAUNCH_CHECKLIST.md) signed for this release (or note deferred items)
- [ ] [Manual a11y checklist](./MANUAL_A11Y_CHECKLIST.md) signed before public announcement if not done pre-release

---

## Rollback (if needed)

1. Cloudflare Pages → Deployments → Rollback to previous successful deploy
2. Or `git revert <sha>` → rebuild → redeploy
3. Re-run `npm run smoke:prod`
4. Document incident in sign-off log

---

## Sign-off log

| Date | Environment | Deployer | Smoke | QA sign-off | Notes |
|------|-------------|----------|-------|-------------|-------|
| | staging dry-run | | | | |
| | production | | | | |

---

## Related documents

- [Deploy & admin verification](./DEPLOY_AND_ADMIN_VERIFICATION.md)
- [Submit-to-publish runbook](./SUBMIT_TO_PUBLISH_RUNBOOK.md)
- [Launch scope](../product/LAUNCH_SCOPE.md)
