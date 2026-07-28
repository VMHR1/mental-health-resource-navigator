# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build           # esbuild transpile + copy static assets + generate program slug pages
npm run dev             # build in watch mode
npm run preview         # build, then serve dist/ at http://localhost:4173
npm run preview:serve   # serve existing dist/ without rebuilding

npm run verify          # FULL GATE, what CI runs: build + validate-data + validate-filters + e2e + lighthouse
npm run validate-data   # programs.json schema/integrity (blocking)
npm run validate-filters# filter + smart-search logic against real modules (blocking; also runs inside build)
npm run audit           # Lighthouse CI

npm run test:e2e        # all Playwright specs (auto-starts server on 4173)
npm run test:mobile     # mobile + mobile-webkit projects only
```

Running a single test:

```bash
npx playwright test tests/smoke.spec.js              # one spec file
npx playwright test -g "reset clears state"          # one test by name
npx playwright test --project=desktop                # one browser project (desktop|mobile|mobile-webkit)
npx playwright test tests/mobile.spec.js --project=mobile --headed
```

E2E runs against built output, so `dist/` must be current — `npm run build` first if you changed source.
Playwright's `webServer` reuses an already-running server locally, so kill stray `http-server` processes on 4173 if tests behave oddly.

Screenshot snapshots are platform-specific and CI runs Linux. Update them with `npm run test:e2e:update:linux` (Docker) and commit the `*-linux.png` files; `npm run test:e2e:update-snapshots` only produces macOS ones.

## Architecture

Static multi-page site — no framework, no runtime dependencies. `src/html/*.html` are the pages; each has hand-ordered `<script>` tags. esbuild runs with **`bundle: false`**, so it transpiles each entry point to a matching file in `dist/` rather than producing one bundle. `scripts/build.js` also copies static assets, injects CSP, and generates one static page per program.

**Module system is mid-migration.** Historically every file attached its exports to `window` and correctness depended on `<script>` tag order. Files are being converted to real ES modules using a dual-export "strangler fig": add real `export` statements *while keeping* the existing `window.foo = foo` assignments, then flip that file's tag to `type="module"`. Both forms must stay until the whole cluster is converted — not-yet-converted siblings still read through `window`.

When converting a file:
- A classic `<script>` containing `export`/`import` is a hard SyntaxError, so the tag must flip to `type="module"` on **every page that loads it**. Check fan-out first (`grep -rl "<filename>" src/html/`) — `helpers.js` is on 3 pages, `pro-gate.js` on 8, `public/security.js` on 12.
- Grep for bare-identifier reads of the symbols (not `window.`-prefixed) in files that haven't converted — those break when the file gains its own module scope.
- Module scripts are deferred by default and keep document order, so converting a tag in place doesn't require reordering anything.

**Watch for auto-injecting window shims.** Some files export a raw function but expose a *different* signature on `window` — e.g. `search.js` exports `parseSmartSearch(query, cities)` but `window.parseSmartSearch(query)` auto-injects the city list. Node test harnesses that relied on the single-arg shim break when they start importing the raw export; they must re-wrap it explicitly.

**Node test harnesses load real browser source.** `scripts/validate-filters.js`, `audit-insurance-plans.mjs`, and `audit-search-localhost.mjs` load real source files into a mock `window` object so they test production logic rather than a copy. Their `loadBrowserScript` detects real ES modules and `import()`s them, falling back to `new Function('window', code)` for classic files. Keep them testing the real modules — a hand-copied reimplementation can pass while production is broken.

### Data pipeline

`public/data/*.json` is the source of truth; the build copies it into `dist/` (some files to two paths for legacy consumers). `programs.json` drives everything; `programs.geocoded.json` adds lat/lng for distance sorting and is generated separately via `node scripts/geocode-programs.js` (Nominatim, rate-limited to 1 req/sec, must be committed).

At build time `scripts/generate-program-pages.js` emits `dist/programs/{program_id}.html` per program plus a sitemap, so shareable URLs resolve without SPA rewrites.

### Cross-cutting build behavior

- **CSP** is injected per-page at build time from `scripts/csp-config.js` using named profiles (`standard`, `eval`, `submit`, `admin`). Edit the profiles there, never per-page copies.
- **Cache busting is manual**: `?v=N` query strings on script/link tags in the HTML. `_headers` sets a 1-year `immutable` cache on `/*.js`, so bumping `?v=` is what actually ships a JS change.
- `admin.html` is excluded from builds unless `INCLUDE_ADMIN=1`.

### Deployment

Cloudflare Pages deploys on push to **`updated-main`** (the default branch) and **does not wait for CI to pass** — a broken push can go live before the red X appears. Prefer a feature branch + PR for anything non-trivial. `npm run push:deploy` pushes HEAD straight to `updated-main`; treat it accordingly.

## Domain rules

These are enforced in `src/js/config/validation-schema.js` and `src/js/modules/filters.js`, and are easy to get subtly wrong:

- **Verification expires after 90 days.** Freshness buckets (`recent`/`fresh`/`stale`/`missing`) are computed in `helpers.js`.
- **Service areas** are point, county, statewide, or multi-region. A program can match a search city by direct city, by county mapping, by `service_area.counties`, by broad regional coverage ("Multiple", "North Texas", "Dallas County", "National"), or by being virtual — see `location-match.js`.
- **Age ranges** use domain-specific parsing including "and up" forms; unparseable `ages_served` returns `null` and must **not** exclude the program.
- **Care levels**: PHP, IOP, Outpatient, Navigation, Crisis services.
- **Service domains**: `mental_health`, `substance_use`, `co_occurring`, `eating_disorders`.
- **Crisis listings are hidden by default** and only surface via the crisis toggle or crisis-specific presets — 988 stays the primary crisis path.
- Several filters are gated behind `FEATURE_FLAGS` in `constants.js` (`STATEWIDE_MODE` is off in production), and the SUD-services filter only applies when `serviceDomain` is also `substance_use`. Tests that ignore these gates silently pass without exercising the real logic.

## Conventions

- Only modify code relevant to the request; avoid touching unrelated functionality.
- Never leave placeholder comments like `// ... rest of the logic` — write the complete code.
- The site is informational, not medical advice, and programs never pay for placement or ranking. Copy changes should preserve that neutrality.
