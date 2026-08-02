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

Static multi-page site — no framework, no runtime dependencies. `src/html/*.html` are the pages; each has hand-ordered `<script>` tags. esbuild runs with **`bundle: false`**, so it transpiles each entry point to a matching file in `dist/` rather than producing one bundle. `scripts/build.js` also copies static assets, injects CSP, and generates one static page per program. The list of pages the build ships (and each page's CSP profile) lives in the `htmlFiles` array in `scripts/build.js` — add new pages there.

### Two layers: family-facing vs. professional

The app has a **public family-facing layer** and a **professional layer** gated behind a client-side password.

- **Family-facing:** `index.html` (the search app — `src/app.js` orchestrates search/filter/sort/render over `programs.json`), plus `program.html`, `guides.html`, `submit.html`, `about.html`, `privacy.html`, `terms.html`, `report-outdated.html`, `404.html`.
- **Professional layer** (all behind the pro gate): `professionals.html`, `handoff.html`, `boards.html`, `regional-snapshot.html`, `export.html`, `changelog.html`, plus **navigator mode** on the search page (`index.html?mode=navigator`).

**Pro gate** (`src/js/modules/pro-gate.js`, config `public/data/pro_gate.json`) is a lightweight *preview* gate, **not** real auth, a paywall, or a login — no accounts, no billing, no server check. It SHA-256-compares a password in the browser and sets a `sessionStorage` unlock flag; it fails closed on pro routes if config can't load. `pro-gate.js` loads on 8 pages (the 6 pro pages above + `index.html` for navigator mode). `pro-events.js` is a privacy-preserving, local-only (no upload) event rollup for the pro layer.

**Professional feature clusters** (each is session-only, category-values-only, **no PHI / no free-text / no server calls**):

- **Navigator mode** (`navigator-mode.js`, `navigator-presets.js`) — a professional overlay on the normal family search results: adds a "Pro" toolbar, workflow presets, per-card match explainers (`match-explain.js`), and operational "friction flags" (`friction-flags.js`). It **never** changes search order, filtering, or ranking.
- **Discharge handoff builder** (`handoff.html`) — build a printable step-down-program packet from a category-only scenario. `handoff-builder.js` (scenario form) → `handoff-workspace.js` (filters programs, computes call order / confirmation items) → `handoff-readiness.js` + `handoff-completeness.js` (procedural completeness checks — **not** a quality/clinical score; print is never blocked) → `handoff-print.js` (packet). `handoff-catalog.js` loads `programs.json` into `programDataMap` on this page alone, avoiding the full search stack. Copy from `handoff_copy.json`; rules from `handoff_readiness_rules.json`.
- **Scenario state** (`scenario-state.js`, taxonomy `scenario_taxonomy.json`) — session-only storage + URL encode/decode for sharing a scenario, shared by navigator mode and the handoff builder. Strict field/value allowlist so no PHI reaches storage or the URL.
- **Export center** (`export.html`, `export-center.js`) — self-serve CSV/JSON download of the public directory for partners. Emits **only** the neutral fields allowlisted in `export_schema.json` (never distance, rankings, or internal fields); file is generated client-side.
- **Resource boards** (`boards.html`, `resource_boards.json`) — curated, editorially-ordered (non-paid) link boards of presets, guide anchors, and external links.
- **Regional gap snapshot** (`regional-snapshot.html`, `regional_gap_snapshot.json`) — aggregate, non-PHI directory-health report (stale counts, missing-field trends, thin-coverage buckets). **Not** the same as `public/data/regions/` (see Data pipeline).

**Module system is mid-migration.** Historically every file attached its exports to `window` and correctness depended on `<script>` tag order. Files are being converted to real ES modules using a dual-export "strangler fig": add real `export` statements *while keeping* the existing `window.foo = foo` assignments, then flip that file's tag to `type="module"`. Both forms must stay until the whole cluster is converted — not-yet-converted siblings still read through `window`.

When converting a file:
- A classic `<script>` containing `export`/`import` is a hard SyntaxError, so the tag must flip to `type="module"` on **every page that loads it**. Check fan-out first (`grep -rl "<filename>" src/html/`) — `helpers.js` is on 3 pages, `pro-gate.js` on 8, `public/security.js` on 12.
- Grep for bare-identifier reads of the symbols (not `window.`-prefixed) in files that haven't converted — those break when the file gains its own module scope.
- Module scripts are deferred by default and keep document order, so converting a tag in place doesn't require reordering anything.

**Watch for auto-injecting window shims.** Some files export a raw function but expose a *different* signature on `window` — e.g. `search.js` exports `parseSmartSearch(query, cities)` but `window.parseSmartSearch(query)` auto-injects the city list. Node test harnesses that relied on the single-arg shim break when they start importing the raw export; they must re-wrap it explicitly.

**Node test harnesses load real browser source.** `scripts/validate-filters.js`, `audit-insurance-plans.mjs`, and `audit-search-localhost.mjs` load real source files into a mock `window` object so they test production logic rather than a copy. Their `loadBrowserScript` detects real ES modules and `import()`s them, falling back to `new Function('window', code)` for classic files. Keep them testing the real modules — a hand-copied reimplementation can pass while production is broken.

### Data pipeline

`public/data/*.json` is the source of truth; the build copies it into `dist/` (some files to two paths for legacy consumers). `programs.json` drives everything; `programs.geocoded.json` adds lat/lng for distance sorting and is generated separately via `node scripts/geocode-programs.js` (Nominatim, rate-limited to 1 req/sec, must be committed).

Other data files: `pro_gate.json` (pro-gate password hash), `scenario_taxonomy.json` (allowed scenario vocabulary), `handoff_copy.json` + `handoff_readiness_rules.json` (handoff builder), `export_schema.json` (export field allowlist + license), `resource_boards.json` (boards), `regional_gap_snapshot.json` (snapshot page), `verification_changelog.json` (changelog page).

**`public/data/regions/` is a different thing from the regional-snapshot page** despite the name. It's a manifest-driven regional dataset (`manifest.json`, `dfw.index.json`, `dfw.details.json`) that the main search app (`src/app.js`) loads and **merges as an augmentation on top of `programs.json`**.

At build time `scripts/generate-program-pages.js` emits `dist/programs/{program_id}.html` per program plus a sitemap, so shareable URLs resolve without SPA rewrites.

**Data-ops scripts** (see `npm run` names in `package.json`): `validate-data` (schema/integrity, blocking), `verify-all-programs` / `mark-programs-verified` (verification workflow), `audit-program-data` / `spot-check-25` (audits), `verify-program-links` / `apply-link-fixes` (link health), `sync-regional-data` (regions dataset), `geocode-programs` (lat/lng), `remove-program`. Several `apply-*.js` scripts encode one-off dated fix batches.

### Cross-cutting build behavior

- **CSP** is injected per-page at build time from `scripts/csp-config.js` using named profiles (`standard`, `eval`, `submit`, `admin`). Edit the profiles there, never per-page copies.
- **Cache busting is manual**: `?v=N` query strings on script/link tags in the HTML. `_headers` sets a 1-year `immutable` cache on `/*.js`, so bumping `?v=` is what actually ships a JS change.
- `admin.html` is excluded from builds unless `INCLUDE_ADMIN=1`.
- `_headers` and `_redirects` are Cloudflare Pages config. Don't add `200` rewrites for pretty URLs in `_redirects` — Pages' Pretty URLs already handle `.html` → extensionless and manual rewrites loop.

### Cloudflare Pages Functions (backend)

`functions/api/` holds serverless endpoints deployed alongside the static site (Cloudflare Pages Functions, not part of the esbuild build): `GET /api/programs` (serves `programs.json` with caching + optional query filtering) and `POST /api/submit-program` (program submission with an Origin allowlist / CORS, replacing Formspree). These run at the edge — there is no local Node server for them; `npx wrangler pages dev` is the way to exercise them locally.

### Deployment

Cloudflare Pages deploys on push to **`updated-main`** (the default branch) and **does not wait for CI to pass** — a broken push can go live before the red X appears. Prefer a feature branch + PR for anything non-trivial. `npm run push:deploy` pushes HEAD straight to `updated-main`; treat it accordingly. CI (`.github/workflows/ci.yml`) runs `npm run verify` on PRs and pushes to `updated-main`.

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

- **Operating timezone is America/Chicago (Central).** Interpret any bare time — runbook SLAs, deploy windows, "this evening" — as Central unless stated otherwise. GitHub Actions cron is UTC only, so scheduled workflows carry a comment mapping the UTC hour to Central and drift by one hour across DST.
- Only modify code relevant to the request; avoid touching unrelated functionality.
- Never leave placeholder comments like `// ... rest of the logic` — write the complete code.
- The site is informational, not medical advice, and programs never pay for placement or ranking. Copy changes should preserve that neutrality.

## Further documentation

`docs/README.md` is the documentation hub, indexing deeper references under `docs/architecture/` (overview, data flow, API), `docs/operations/` (deploy, admin, pro-gate, runbooks), `docs/performance/`, `docs/security/`, `docs/product/`, and `docs/research/`. Consult these for anything beyond this file's summary.

`AGENTS.md` is a symlink to this file — edit `CLAUDE.md` and both stay in sync.
