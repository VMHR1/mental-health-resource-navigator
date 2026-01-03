# QA + Performance Pipeline

This document describes the QA and performance testing pipeline added to the repository.

## Overview

The pipeline includes:
- **Data validation** - Ensures `programs.json` integrity
- **E2E testing** - Playwright tests for critical user flows
- **Performance monitoring** - Lighthouse CI for performance metrics
- **Code quality** - Prettier + ESLint for new scripts/tests

## Quick Start

### Install Dependencies

```bash
npm install
npx playwright install --with-deps
```

### Run All Checks Locally

```bash
# Build the project
npm run build

# Validate data integrity
npm run validate-data

# Validate filters
npm run validate-filters

# Run E2E tests (requires build first)
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Format code (new scripts/tests only)
npm run format

# Lint code (new scripts/tests only)
npm run lint
```

## Components

### 1. Data Validation (`scripts/validate-data.js`)

**Purpose**: Blocking validator that ensures data integrity before deployment.

**Checks**:
- Unique `program_id` values
- Required fields: `program_id`, `organization`, `program_name`, `level_of_care` (where applicable)
- `service_domains` allowlist: `mental_health`, `substance_use`, `co_occurring`, `eating_disorders`
- Valid JSON structure
- Optional `programs.geocoded.json` validation

**Usage**:
```bash
npm run validate-data
```

**Exit codes**:
- `0` - Success (warnings allowed)
- `1` - Errors found (blocks deployment)

### 2. E2E Testing (Playwright)

**Purpose**: End-to-end tests for critical user flows.

**Test Coverage**:
- Homepage loads without console errors
- Specialized resources section displays correctly
- Filter buttons apply filters and scroll to results
- Search returns expected results for known keywords
- Empty state renders gracefully
- Favorites modal opens and renders

**Test Files**:
- `tests/e2e/homepage.spec.js` - Homepage functionality
- `tests/e2e/search.spec.js` - Search functionality
- `tests/e2e/empty-state.spec.js` - Empty state handling
- `tests/e2e/favorites.spec.js` - Favorites functionality

**Usage**:
```bash
# Run all tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug
```

**Browsers**: Tests run on Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.

### 3. Performance Monitoring (Lighthouse CI)

**Purpose**: Prevents performance regressions.

**Thresholds**:
- Performance: ≥ 70
- Accessibility: ≥ 90
- Best Practices: ≥ 80
- SEO: ≥ 80

**Usage**:
```bash
# Build first
npm run build

# Run Lighthouse CI
npx lhci autorun
```

**Configuration**: `.lighthouserc.js`

### 4. Code Quality (Prettier + ESLint)

**Purpose**: Consistent formatting and linting for new scripts/tests.

**Scope**: Only formats/lints new files:
- `scripts/validate-data.js`
- `tests/**/*.js`
- `playwright.config.js`
- `.lighthouserc.js`

**Existing files excluded**: `app.js`, `styles.css`, `index.html`, etc.

**Usage**:
```bash
# Format code
npm run format

# Lint code
npm run lint
```

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on:
- Pull requests to `main`
- Pushes to `main`

**Pipeline Steps**:
1. Install dependencies (`npm ci`)
2. Build (`npm run build`)
3. Validate filters (`npm run validate-filters`)
4. Validate data (`npm run validate-data`)
5. Run E2E tests (`npm run test:e2e`)
6. Run Lighthouse CI (performance checks)

## Local Development Workflow

1. **Before committing**:
   ```bash
   npm run build
   npm run validate-data
   npm run validate-filters
   npm run format
   npm run lint
   ```

2. **Before pushing**:
   ```bash
   npm run test:e2e
   ```

3. **For debugging tests**:
   ```bash
   npm run test:e2e:ui
   ```

## Troubleshooting

### E2E Tests Fail

- Ensure `npm run build` completed successfully
- Check that `dist/` directory exists with built files
- Verify local server can start: `npx http-server dist -p 8080`

### Data Validation Fails

- Check `programs.json` syntax (valid JSON)
- Verify all required fields are present
- Check `service_domains` values match allowlist
- Ensure no duplicate `program_id` values

### Lighthouse CI Fails

- Check performance metrics in report
- Review `.lighthouserc.js` thresholds
- Ensure build is optimized (`npm run build`)

## Files Changed

### New Files
- `scripts/validate-data.js` - Data validator
- `playwright.config.js` - Playwright configuration
- `tests/e2e/*.spec.js` - E2E test files (4 files)
- `.github/workflows/ci.yml` - GitHub Actions workflow
- `.lighthouserc.js` - Lighthouse CI configuration
- `.prettierrc.json` - Prettier configuration
- `.prettierignore` - Prettier ignore patterns
- `.eslintrc.json` - ESLint configuration
- `.eslintignore` - ESLint ignore patterns
- `QA_PIPELINE.md` - This documentation

### Modified Files
- `package.json` - Added scripts and dev dependencies

## Notes

- **No breaking changes**: All existing build/deploy processes remain unchanged
- **Clean clone compatible**: All scripts work on a fresh `npm install`
- **Selective formatting**: Only new scripts/tests are formatted, existing code untouched

