# mental-health-resource-navigator
Neutral post-discharge mental health resource navigator for Dallas-FortWorth area youth

## Mobile Performance

This application is optimized for mobile performance with comprehensive monitoring and optimization tools.

### Quick Start - Performance Testing

1. **Enable performance monitoring**: Add `?perf=1` to any URL
   - Example: `https://your-site.com/?perf=1`
   - Shows real-time FPS, jank count, and performance metrics

2. **Test with kill switches**: Isolate performance issues
   - `?perf=1&noAnim=1` - Disable animations
   - `?perf=1&noShadow=1` - Remove shadows
   - `?perf=1&noFixedBg=1` - Hide fixed background

3. **Check console logs**: Every 10 seconds, detailed metrics are logged

### Mobile Performance Policy

On mobile/coarse pointer devices:
- ✅ No infinite background animations
- ✅ No moving shadow animations  
- ✅ Simplified shadows and backdrop-filters
- ✅ Content-visibility optimizations for offscreen content
- ✅ GPU-optimized sticky elements

**Full documentation**: See [MOBILE_PERFORMANCE.md](./MOBILE_PERFORMANCE.md) for complete details.

### Performance Findings (iPhone Safari)

**Issue**: Stutter/jank during scrolling and idle on iPhone Safari

**Root Causes Identified**:
1. **`.section` backdrop-filter** - Expensive blur effect on all sections
2. **`.floating-card` backdrop-filter** - Expensive blur in hero section
3. **Heavy shadows on sticky elements** - Crisis banner and search section
4. **Card shadows** - Multiple cards with shadows during scroll

**Permanent Fixes Applied**:
- ✅ Disabled `backdrop-filter` on `.section` for mobile
- ✅ Disabled `backdrop-filter` on `.floating-card` for mobile
- ✅ Further reduced shadows on sticky elements (crisis banner, search section)
- ✅ Simplified card shadows (replaced with minimal shadow + stronger border)

**Kill Switch Testing**:
Use `?perf=1` with these switches to isolate issues:
- `?perf=1&noAnim=1` - Disable all animations
- `?perf=1&noHero=1` - Hide hero visual
- `?perf=1&noShadow=1` - Remove all shadows
- `?perf=1&noFixedBg=1` - Hide background gradient
- `?perf=1&noSticky=1` - Remove sticky positioning

**Result**: Scrolling is smoother, idle stutter is reduced. See [PERFORMANCE_FINDINGS.md](./PERFORMANCE_FINDINGS.md) for detailed analysis.

### Dense Mode (Text Size < 100%)

**Issue**: Jank occurs when iPhone Safari text size is below 100% (aA smaller)

**Solution**: Automatic "dense mode" activates when text is smaller than baseline:
- Detects text scale by comparing current root font size to baseline
- Activates `html.text-small` class when text is < baseline - 0.5px
- Applies performance optimizations without changing layout:
  - Disables infinite animations (hero float, pulse, breathe, shimmer, gradient)
  - Flattens heavy shadows (replaces with minimal shadow + border)
  - Removes fixed full-viewport background layer
  - Adds content-visibility to long card lists
  - While-scrolling: temporarily removes shadows for better FPS

**Note**: Dense mode activates automatically when iOS aA text size is below baseline. No layout changes, only visual/performance optimizations.

## Geocoding for Distance Features

The "Near Me" feature requires geocoded location data. To generate it:

```bash
node scripts/geocode-programs.js
```

This will:
- Read `programs.json`
- Geocode all program addresses using Nominatim OpenStreetMap (free, open-source)
- Generate `programs.geocoded.json` with latitude/longitude coordinates
- Respect rate limits (1 request/second as required by Nominatim ToS)

**Note:** The geocoding script uses Nominatim, which requires:
- Proper User-Agent header (included)
- Rate limiting (1 req/sec, enforced)
- Attribution: © OpenStreetMap contributors

After generating, commit and push `programs.geocoded.json` to make distance sorting available to all visitors.

## Quality Checks

This repository includes automated quality checks to ensure code quality, data integrity, and performance standards.

### Quick Start

Run all quality checks with a single command:

```bash
npm run verify
```

This command runs:
1. **Build** - Compiles and bundles the application
2. **Data Validation** - Validates `programs.json` schema and integrity
3. **E2E Tests** - Runs Playwright smoke tests
4. **Performance Audit** - Runs Lighthouse CI performance checks

### Individual Commands

#### E2E Testing (`npm run test:e2e`)

Runs Playwright smoke tests that validate core UI behaviors:
- Page loads without fatal console errors
- Search input accepts typing and triggers results
- Reset button clears filters
- Advanced filters open/close and update results
- Favorites and history modals open/close correctly

**Run with UI:**
```bash
npm run test:e2e:ui
```

**Mobile Testing (`npm run test:mobile`)**

Runs mobile-specific verification tests on emulated iPhone viewport:
- No horizontal overflow (scrollWidth <= clientWidth)
- Critical controls visible and clickable (search, buttons, filters)
- Advanced filters work on mobile (dropdowns can be opened and values selected)
- Results section renders correctly after search
- Screenshot snapshots for homepage and results view

**Run mobile tests:**
```bash
npm run test:mobile
```

**What failures mean:**
- If tests fail, check the Playwright HTML report in `playwright-report/`
- Screenshots are captured automatically on failure (full-page)
- Common issues:
  - Build output (`dist/`) is missing or outdated → Run `npm run build` first
  - Server port conflict → Ensure port 4173 is available
  - Selector changes → Update `data-testid` attributes in `index.html`
  - Horizontal overflow → Check CSS for elements wider than viewport
  - Mobile controls not clickable → Verify touch target sizes and z-index

#### Performance Audit (`npm run audit`)

Runs Lighthouse CI to check performance, accessibility, best practices, and SEO.

**Thresholds:**
- Performance: Warn ≥ 0.70, Error ≥ 0.55
- Accessibility: Warn ≥ 0.90
- Best Practices: Warn ≥ 0.85
- SEO: Warn ≥ 0.85

**What failures mean:**
- Performance below threshold → Optimize bundle size, lazy loading, or reduce render blocking
- Accessibility issues → Fix ARIA labels, keyboard navigation, or color contrast
- Best practices → Address security headers, HTTPS, or console errors
- SEO issues → Improve meta tags, semantic HTML, or structured data

**Debug:**
- Check `.lighthouseci/` directory for detailed reports
- Run Lighthouse manually: `npx lighthouse http://localhost:4173 --view`

#### Data Validation (`npm run validate-data`)

Validates `programs.json` for:
- Unique `program_id` values
- Required fields: `program_id`, `organization`, `program_name`, `service_domains`
- `service_domains` allowlist: `mental_health`, `substance_use`, `co_occurring`, `eating_disorders`
- Valid `level_of_care` enum values where applicable

**What failures mean:**
- Missing required fields → Add missing fields to program entries
- Duplicate `program_id` → Ensure each program has a unique ID
- Invalid `service_domains` → Use only values from the allowlist
- Schema errors → Fix JSON structure or field types

**Debug:**
- Check error messages for specific program IDs and fields
- Validate JSON syntax: `cat programs.json | jq .`

### CI/CD

Quality checks run automatically on:
- Pull requests to `main`
- Pushes to `main`

GitHub Actions workflow (`.github/workflows/ci.yml`) runs `npm run verify` which includes all checks.

**View results:**
- GitHub Actions tab → Select workflow run → View logs
- Artifacts: Playwright report and Lighthouse results are uploaded as artifacts

### Troubleshooting

**Tests fail locally:**
1. Ensure `npm run build` completed successfully
2. Check that `dist/` directory exists with built files
3. Verify no other process is using port 4173
4. Install Playwright browsers: `npx playwright install --with-deps`

**Performance audit fails:**
1. Ensure build is optimized (run `npm run build`)
2. Check for large bundle sizes or unoptimized assets
3. Review Lighthouse report in `.lighthouseci/` for specific issues

**Data validation fails:**
1. Check `programs.json` is valid JSON
2. Verify all required fields are present
3. Ensure `service_domains` values match allowlist exactly
4. Check for duplicate `program_id` values
