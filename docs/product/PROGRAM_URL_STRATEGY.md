# Program URL Strategy

**Decision date:** 2026-05-23  
**Status:** Adopted — canonical slug URLs with legacy compatibility

## Canonical URL format

**Preferred (canonical):**

```
https://viablemhr.com/programs/{program_id}.html
```

Examples:

- `https://viablemhr.com/programs/nexus_recovery_dallas.html`
- Generated at build time by [scripts/generate-program-pages.js](../../scripts/generate-program-pages.js)

## Implementation map

| Surface | Current behavior | Target (Phase 2.2) |
|---------|------------------|---------------------|
| Card “Details” link | `/programs/{id}.html` via `programPublicPath()` | ✅ Already slug |
| Program detail canonical tag | Slug URL in [src/js/program-detail.js](../../src/js/program-detail.js) | ✅ Already slug |
| Share modal / QR | Slug URL via `programPublicPath()` in `shareProgram()` | ✅ Done (Phase 2.2) |
| Legacy dynamic page | `/program.html?id={id}` | Keep resolving; not canonical |
| Home deep link | `/?program={id}` expands card on home | Keep for backward compatibility |
| Sitemap (programs) | `dist/sitemap-programs.xml` — slug URLs | ✅ Already slug |
| Static sitemap | `program.html` listed in [public/sitemap.xml](../../public/sitemap.xml) | Demote or remove in Phase 5.1 |

## Helper function

[src/js/utils/helpers.js](../../src/js/utils/helpers.js):

```javascript
window.programPublicPath = function programPublicPath(programId) {
  const id = safeStr(programId);
  if (!id) return '/program.html';
  return `/programs/${encodeURIComponent(id)}.html`;
};
```

All new links should use `programPublicPath(id)`.

## Legacy URL support (do not break)

| URL pattern | Resolution |
|-------------|------------|
| `/programs/{id}.html` | Static page + `__ViableMHRProgramId` or path parse |
| `/program.html?id={id}` | [src/js/program-detail.js](../../src/js/program-detail.js) query param |
| `index.html?program={id}` | [src/app.js](../../src/app.js) `handleURLParams` expands card on home |
| Invalid / missing ID | Program detail empty state; 404 behavior on slug if file missing |

## Redirects

[_redirects](../../_redirects) documents optional rewrite:

```
/programs/:id    /program.html?id=:id    200
```

**Preference:** Static files in `dist/programs/{id}.html` (no rewrite needed). Rewrites are fallback only.

## SEO rules

1. **One canonical URL per program** — slug page `<link rel="canonical">` points to slug
2. **Do not index** `program.html` without ID as a duplicate listing page (Phase 5 sitemap cleanup)
3. **Share links** should use slug URLs so social previews and analytics align
4. **program_id** must remain stable; renaming requires redirect map (future) or accept broken bookmarks

## Phase 2 implementation checklist

- [x] Update `shareProgram()` to use `programPublicPath(sanitizedId)` with absolute origin
- [x] QR code encodes slug URL
- [ ] Verify `?program=` on home still expands card (regression test)
- [x] Remove or demote `program.html` from main sitemap (Phase 5.1)

## Testing

```bash
npm run build
# Open dist/programs/{known_id}.html — program loads
# Share from card — after Phase 2.2, URL should be slug
# Open index.html?program={id} — card expands
```

Manual:

1. Share program → copy link → incognito → lands on slug page with correct content
2. Old bookmark to `program.html?id=` still works

## Related documents

- [Phased Launch Build Plan](./ViableMHR-Phased-Launch-Build-Plan.md) — Phase 2.2
- [Deploy verification](../operations/DEPLOY_AND_ADMIN_VERIFICATION.md)
