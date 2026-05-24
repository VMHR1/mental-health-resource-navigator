# Deploy & Admin Verification Checklist

**Last updated:** 2026-05-23  
**Environment:** Cloudflare Pages (`viablemhr.com`)

## Purpose

Verify production security headers, admin protection, and deploy artifacts before launch and on each production deploy.

---

## 1. Admin access

### Expected state

| Control | Location | Expected |
|---------|----------|----------|
| Cloudflare Access | Zero Trust → Applications | `/admin.html` requires authenticated allow-list |
| `X-Robots-Tag` | [_headers](../../_headers) line 62–64 | `noindex, nofollow` on `/admin.html` |
| `robots.txt` | [public/robots.txt](../../public/robots.txt) | `Disallow: /admin.html` |
| Public build | [scripts/build.js](../../scripts/build.js) | `admin.html` **excluded** unless `INCLUDE_ADMIN=1` |

### Verification steps

- [ ] Unauthenticated browser → `https://viablemhr.com/admin.html` → Cloudflare Access login (not public dashboard)
- [ ] Authorized email login → admin dashboard loads
- [ ] View page source / headers → `X-Robots-Tag: noindex, nofollow` present
- [ ] `npm run build` → `dist/admin.html` **does not exist**
- [ ] Admin deploy (if needed): `npm run build:admin` → deploy with Access policy only

### Admin deploy (operators only)

```bash
INCLUDE_ADMIN=1 npm run build
# Deploy admin.html separately to protected path OR use Cloudflare Access on full Pages project
```

See [ADMIN_ACCESS_SETUP.md](./ADMIN_ACCESS_SETUP.md) for Access policy configuration.

---

## 2. Security headers (all pages)

From [_headers](../../_headers):

- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy` restricts geolocation to self

Verify with browser devtools → Network → document response headers on `index.html`.

---

## 3. Build artifacts

After `npm run build`:

| Artifact | Path | Check |
|----------|------|-------|
| Main sitemap | `dist/sitemap.xml` | Returns 200 in prod |
| Program sitemap | `dist/sitemap-programs.xml` | Generated; one URL per program |
| Slug pages | `dist/programs/*.html` | Count matches program count |
| Programs data | `dist/programs.json` | Matches `public/data/programs.json` |
| Service worker | `dist/sw.js` | `Cache-Control: no-cache` |

Production URLs:

- [ ] `https://viablemhr.com/sitemap.xml`
- [ ] `https://viablemhr.com/sitemap-programs.xml`
- [ ] `https://viablemhr.com/robots.txt` references both sitemaps

---

## 4. Pre-deploy command gate

```bash
npm run validate-data
npm run validate-filters
npm run build
npm run test:e2e          # or full npm run verify before major release
```

---

## 5. Post-deploy smoke

```bash
npm run smoke:prod
```

Manual (3 random programs):

- [ ] `/programs/{id}.html` — title, phone, verification line
- [ ] Homepage search returns results
- [ ] Submit page loads; Formspree endpoint configured
- [ ] Guides page loads

---

## 6. Known gaps (track in phased plan)

| Gap | Phase | Notes |
|-----|-------|-------|
| ~~Trust strip “no tracking” vs Statcounter~~ | 3.1 | ✅ Fixed May 2026 |
| `guides.html` missing from sitemap | 5.1 | SEO — guides added in Phase 1 |
| ~~Share URLs use `?program=` not slug~~ | 2.2 | ✅ Done |
| CSP `unsafe-inline` in meta tags | 7.4 | Security hardening |

---

## 7. Rollback

1. Cloudflare Pages → Deployments → Rollback to previous
2. Or git revert + redeploy
3. Confirm sitemaps and slug pages match rolled-back data

---

## Sign-off log

| Date | Environment | Tester | Pass/Fail | Notes |
|------|-------------|--------|-----------|-------|
| | staging | | | |
| | production | | | |

## Related documents

- [Submit-to-publish runbook](./SUBMIT_TO_PUBLISH_RUNBOOK.md)
- [Admin access setup](./ADMIN_ACCESS_SETUP.md)
- [Launch scope](../product/LAUNCH_SCOPE.md)
