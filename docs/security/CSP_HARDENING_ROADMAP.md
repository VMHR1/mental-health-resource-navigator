# CSP hardening roadmap (Phase 7.4)

**Status:** Roadmap — not started  
**Last updated:** 2026-05-23

## Current state

- **Canonical CSP** lives in [`scripts/csp-config.js`](../../scripts/csp-config.js); `npm run build` injects into each HTML file (replaces `<!-- VMHR_CSP:profile -->`).
- Typical directives include `'unsafe-inline'` for scripts (Statcounter bootstrap, inline handlers).
- Cloudflare Web Analytics (`static.cloudflareinsights.com`) is allowlisted to reduce console noise.
- Cloudflare **`_headers`** does not duplicate CSP — only nosniff, frame options, cache.

## Goals

1. Move canonical CSP to [`_headers`](../../_headers) for consistent enforcement.
2. Remove `'unsafe-inline'` from `script-src` without breaking analytics or app boot.
3. Keep Statcounter and Formspree allowed explicitly.

## Phased approach

### Phase A — Header parity (low risk)

- [ ] Copy exact CSP from `index.html` meta into `_headers` for `/*`
- [ ] Remove meta CSP one page at a time after verifying no console violations
- [ ] Run `npm run verify` + manual load of home, guides, submit, slug page

### Phase B — Externalize inline boot (medium risk)

- [ ] Move Statcounter init to `public/js/statcounter-init.js` (single file, hash-friendly)
- [ ] Audit remaining inline `<script>` blocks; move to deferred files
- [ ] Tighten `script-src` to `'self'` + `https://secure.statcounter.com` + nonce if needed

### Phase C — Strict CSP (high risk)

- [ ] `script-src` with nonces per deploy build
- [ ] `style-src` review (`unsafe-inline` often required for legacy CSS)
- [ ] Report-only CSP (`Content-Security-Policy-Report-Only`) for one week before enforce

## Testing checklist

| Page | Load | Statcounter | Search | Submit |
|------|------|-------------|--------|--------|
| `/` | ☐ | ☐ | ☐ | — |
| `/guides.html` | ☐ | ☐ | — | — |
| `/submit.html` | ☐ | — | — | ☐ |
| `/programs/{id}.html` | ☐ | ☐ | — | — |

## Do not break

- Crisis 988 / SAMHSA links (`https:` allowlist)
- QR API (`api.qrserver.com`) on share modal
- Google Fonts if still loaded from CDN

## Related

- [Security audit](./SECURITY_RELIABILITY_AUDIT.md)
- [Privacy policy](../../src/html/privacy.html)
