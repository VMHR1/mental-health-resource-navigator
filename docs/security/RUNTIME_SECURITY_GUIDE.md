# Runtime security guide

**Last updated:** 2026-05-25  
**Audience:** Developers and moderators testing ViableMHR in the browser

## What is “security” on this site?

| Layer | Location | Required? | What it does |
|-------|----------|-----------|--------------|
| **CSP** | Injected at build from [`scripts/csp-config.js`](../../scripts/csp-config.js) | **Yes** | Blocks unknown scripts and network calls (XSS mitigation) |
| **`security.js`** | [`public/security.js`](../../public/security.js) | **Mostly yes** | Submit sanitization, URL/email checks, optional JSON pollution check, favorites encryption, submit rate limit |
| **`_headers`** | [`_headers`](../../_headers) | **Yes** | `nosniff`, `X-Frame-Options`, referrer policy (not CSP) |
| **`validate-data.js`** | Build/CI only | **Yes** | Data quality — not browser runtime |
| **Pro gate** | [`src/js/modules/pro-gate.js`](../../src/js/modules/pro-gate.js) | Product | Preview password — not a security boundary |

## Console errors — what is ViableMHR vs noise?

### Not from this repository (ignore or disable extension)

| Message | Typical source | Action |
|---------|----------------|--------|
| `SES Removing unpermitted intrinsics` + `lockdown-install.js` | Browser extension (SES / lockdown tools) | Test in Guest/Incognito with extensions off |
| `Connecting to 'https://singleview.site/...'` blocked by CSP | Injected tracker (extension or third-party script) | **Do not** add `singleview.site` to CSP |
| `cloudflareinsights.com` blocked | Cloudflare Pages Web Analytics | Harmless; allowed in CSP via `scripts/csp-config.js` or disable analytics in CF dashboard |

Repo search confirms **no** references to `singleview.site` or `lockdown-install.js`.

### Real app issues (fixed in source — verify deploy)

| Message | Cause | Fix |
|---------|-------|-----|
| `events.js:666 Cannot read properties of null (reading 'querySelectorAll')` | Full search `bind()` on pages without modals | [`handoff.html`](../../src/html/handoff.html) uses slim [`handoff-catalog.js`](../../src/js/modules/handoff-catalog.js); [`events.js`](../../src/js/modules/events.js) guards null modals |
| `Could not load program data` on handoff | `loadPrograms()` called `renderSkeletons` without `#treatmentGrid` | Fixed in [`src/app.js`](../../src/app.js); handoff no longer loads full `app.js` |

## Does CSP block uploads or new program data?

**No**, for normal workflows:

| Workflow | Blocked by CSP? |
|----------|-----------------|
| `fetch('programs.json')` on same origin | No (`'self'`) |
| Submit form → Formspree | No (`connect-src` + `form-action` include `formspree.io`) |
| Editing `programs.json` in git + deploy | N/A (server-side) |

Stale data after deploy is usually **CDN/cache** (`programs.json` `max-age=3600` in `_headers`), not CSP.

## CSP profiles (single source of truth)

Built from [`scripts/csp-config.js`](../../scripts/csp-config.js) into each HTML file:

| Profile | Pages | Notes |
|---------|-------|-------|
| `standard` | index, handoff, professionals, boards, guides, … | No `unsafe-eval` |
| `eval` | program, about, privacy, terms | Legacy script compatibility |
| `submit` | submit.html | Formspree-only `connect-src` |
| `admin` | admin.html (optional build) | No Formspree |

Source HTML uses `<!-- VMHR_CSP:profile -->`; `npm run build` replaces with the full `<meta>` tag.

## `security.js` behavior

### Keep

- `sanitizeText` / `sanitizeId` on submit and user-generated strings
- `validateUrl` / `validateEmail` on submit
- `escapeHtml` (also in render modules)
- `validateJSON` on catalog load — **warnings only**, does not block load

### Rate limiting (submit form)

- Production: 3 submissions per hour per browser (`checkRateLimit('form_submission')`)
- **Bypass:** `localhost`, `127.0.0.1`, or `?debug=1` on any host (for moderator QA)

### Client-side encryption

- Protects favorites in localStorage from casual offline copy
- **Does not** stop XSS in the origin (documented in `security.js` header)

## Handoff page architecture (post–slim loader)

[`handoff.html`](../../src/html/handoff.html) loads:

1. `security.js` — optional JSON validation
2. `helpers.js` — `getVerificationFreshness`
3. **`handoff-catalog.js`** — `programDataMap` + `vmhr:programs-ready`
4. Handoff UI modules (builder, workspace, readiness, print, …)

It does **not** load `app.js`, `events.js`, or the search stack. This removes the class of bugs from missing search DOM.

## Clean-browser test procedure

1. Open **Guest** or **Private** window (extensions disabled).
2. **Handoff:** `/handoff.html` → unlock gate → fill scenario → Build workspace.
   - Console: `Handoff catalog loaded: N programs` (N > 0).
   - No `TypeError` from `events.js`.
3. **Submit:** `/submit.html` → complete wizard → Network tab shows POST to `formspree.io` (200/302).
4. **Search:** `/` → programs render; favorites still work.

## When to change CSP

Add a host to [`scripts/csp-config.js`](../../scripts/csp-config.js) only when the product **intentionally** loads that service. Run `npm run build` and smoke-test the affected page.

Do **not** allowlist unknown trackers to silence console noise.

## Related docs

- [Submit-to-publish runbook](../operations/SUBMIT_TO_PUBLISH_RUNBOOK.md)
- [CSP hardening roadmap](./CSP_HARDENING_ROADMAP.md)
- [Security reliability audit](./SECURITY_RELIABILITY_AUDIT.md)
