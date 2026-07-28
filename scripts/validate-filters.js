#!/usr/bin/env node
/**
 * Filter Validation Script
 * Tests that statewide-ready fields don't break filtering logic
 * Run during dev builds to catch regressions early
 */

import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { matchesFilters } from '../src/js/modules/filters.js';
import { FEATURE_FLAGS } from '../src/js/config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Mock DOM elements for testing
function createMockElements() {
  return {
    county: { value: '' },
    serviceDomain: { value: '' },
    sudServices: { selectedOptions: [] },
    verificationRecency: { value: '' },
    q: { value: '' },
    loc: { value: '' },
    age: { value: '' },
    care: { value: '' },
    insurance: { value: '' },
    onlyVirtual: { checked: false },
    showCrisis: { checked: false }
  };
}

// Simplified safeStr for testing
function safeStr(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

// Adapts the mock DOM `els` shape (kept from the old hand-copied version, so
// all 8 call sites below stay unchanged) into the real filters object the
// production matchesFilters() expects, then calls the real function - not a
// reimplementation. STATEWIDE_MODE is forced on here (production has it off)
// because this suite's whole purpose is validating the statewide-ready
// fields matchesFilters gates behind it; SHOW_SUD_FILTERS/SHOW_VERIFICATION_FILTERS
// are left at their real production values (both true today).
function testMatchesFilters(p, els) {
  const filters = {
    query: els.q ? safeStr(els.q.value || '') : '',
    location: els.loc ? safeStr(els.loc.value || '') : '',
    age: els.age ? safeStr(els.age.value || '') : '',
    care: els.care ? safeStr(els.care.value || '') : '',
    insurance: els.insurance ? safeStr(els.insurance.value || '') : '',
    onlyVirtual: Boolean(els.onlyVirtual?.checked),
    showCrisis: Boolean(els.showCrisis?.checked),
    county: els.county ? safeStr(els.county.value || '') : '',
    serviceDomain: els.serviceDomain ? safeStr(els.serviceDomain.value || '') : '',
    selectedSudServices: els.sudServices
      ? Array.from(els.sudServices.selectedOptions).map((opt) => opt.value)
      : [],
    verificationRecency: els.verificationRecency ? safeStr(els.verificationRecency.value || '') : '',
  };
  return matchesFilters(p, filters, {
    featureFlags: { ...FEATURE_FLAGS, STATEWIDE_MODE: true },
  });
}

// Test cases
function runFilterTests() {
  console.log('Running filter validation tests...\n');
  
  // Load test fixtures
  const fixturesPath = join(rootDir, 'tests', 'fixtures', 'test-programs.json');
  let testData;
  try {
    testData = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to load test fixtures: ${err.message}`);
    process.exit(1);
  }

  const programs = testData.programs;
  // Keep verification-recency test deterministic without relying on a hard-coded date.
  // Set the fixture program to "7 days ago" at runtime so it must pass a 30-day filter.
  const verifiedProgramFixture = programs.find(p => p.program_id === 'test-verified-program');
  if (verifiedProgramFixture?.verification) {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 7);
    const recentIso = recentDate.toISOString();
    verifiedProgramFixture.verification.last_verified_at = recentIso;
    verifiedProgramFixture.last_verified = recentIso.split('T')[0];
  }
  let passed = 0;
  let failed = 0;
  const failures = [];

  // Test 1: Legacy program (no new fields) - should not crash
  console.log('Test 1: Legacy program with no statewide fields');
  const legacyProgram = programs.find(p => p.program_id === 'test-legacy-program');
  const els1 = createMockElements();
  try {
    const result = testMatchesFilters(legacyProgram, els1);
    if (result === true) {
      console.log('  ✓ Passed: Legacy program filters correctly\n');
      passed++;
    } else {
      console.log('  ✗ Failed: Legacy program should pass with no filters\n');
      failed++;
      failures.push('Test 1: Legacy program filtering');
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err.message}\n`);
    failed++;
    failures.push(`Test 1: ${err.message}`);
  }

  // Test 2: County filter with service_area.counties
  console.log('Test 2: County filter with service_area.counties');
  const statewideProgram = programs.find(p => p.program_id === 'test-statewide-program');
  const els2 = createMockElements();
  els2.county = { value: 'Dallas' };
  try {
    const result = testMatchesFilters(statewideProgram, els2);
    if (result === true) {
      console.log('  ✓ Passed: County filter works with service_area.counties\n');
      passed++;
    } else {
      console.log('  ✗ Failed: County filter should match Dallas county\n');
      failed++;
      failures.push('Test 2: County filter with service_area');
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err.message}\n`);
    failed++;
    failures.push(`Test 2: ${err.message}`);
  }

  // Test 3: Service domain filter
  console.log('Test 3: Service domain filter');
  const sudProgram = programs.find(p => p.program_id === 'test-sud-program');
  const els3 = createMockElements();
  els3.serviceDomain = { value: 'substance_use' };
  try {
    const result = testMatchesFilters(sudProgram, els3);
    if (result === true) {
      console.log('  ✓ Passed: Service domain filter works\n');
      passed++;
    } else {
      console.log('  ✗ Failed: Service domain filter should match substance_use\n');
      failed++;
      failures.push('Test 3: Service domain filter');
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err.message}\n`);
    failed++;
    failures.push(`Test 3: ${err.message}`);
  }

  // Test 4: SUD services filter
  console.log('Test 4: SUD services filter');
  const els4 = createMockElements();
  // matchesFilters only applies the SUD-services filter when serviceDomain is
  // also 'substance_use' (mirrors the real UI, where these checkboxes only
  // appear under that domain) - without this the filter silently no-ops and
  // the test would pass without ever exercising the real logic.
  els4.serviceDomain = { value: 'substance_use' };
  els4.sudServices = {
    selectedOptions: [
      { value: 'detox' },
      { value: 'otp' }
    ]
  };
  try {
    const result = testMatchesFilters(sudProgram, els4);
    if (result === true) {
      console.log('  ✓ Passed: SUD services filter works\n');
      passed++;
    } else {
      console.log('  ✗ Failed: SUD services filter should match\n');
      failed++;
      failures.push('Test 4: SUD services filter');
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err.message}\n`);
    failed++;
    failures.push(`Test 4: ${err.message}`);
  }

  // Test 5: Verification recency filter
  console.log('Test 5: Verification recency filter');
  const verifiedProgram = programs.find(p => p.program_id === 'test-verified-program');
  const els5 = createMockElements();
  els5.verificationRecency = { value: '30' };
  try {
    const result = testMatchesFilters(verifiedProgram, els5);
    if (result === true) {
      console.log('  ✓ Passed: Verification recency filter works\n');
      passed++;
    } else {
      console.log('  ✗ Failed: Verification recency filter should match\n');
      failed++;
      failures.push('Test 5: Verification recency filter');
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err.message}\n`);
    failed++;
    failures.push(`Test 5: ${err.message}`);
  }

  // Test 6: Edge cases - null/empty arrays
  console.log('Test 6: Edge cases with null/empty arrays');
  const edgeCaseProgram = programs.find(p => p.program_id === 'test-edge-case-nulls');
  const els6 = createMockElements();
  try {
    const result = testMatchesFilters(edgeCaseProgram, els6);
    if (result === true) {
      console.log('  ✓ Passed: Edge case program handles nulls/empty arrays\n');
      passed++;
    } else {
      console.log('  ✗ Failed: Edge case program should pass with no filters\n');
      failed++;
      failures.push('Test 6: Edge cases with nulls');
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err.message}\n`);
    failed++;
    failures.push(`Test 6: ${err.message}`);
  }

  // Test 7: Empty arrays don't break intersection logic
  console.log('Test 7: Empty arrays in filter intersection');
  const els7 = createMockElements();
  els7.serviceDomain = { value: 'mental_health' };
  try {
    // Program with empty service_domains should not match
    const result = testMatchesFilters(edgeCaseProgram, els7);
    if (result === false) {
      console.log('  ✓ Passed: Empty arrays correctly exclude programs\n');
      passed++;
    } else {
      console.log('  ✗ Failed: Empty arrays should exclude programs\n');
      failed++;
      failures.push('Test 7: Empty array intersection');
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err.message}\n`);
    failed++;
    failures.push(`Test 7: ${err.message}`);
  }

  // Test 8: Missing service_area doesn't crash
  console.log('Test 8: Missing service_area with county filter');
  const els8 = createMockElements();
  els8.county = { value: 'Dallas' };
  try {
    // Legacy program without service_area should not match county filter
    const result = testMatchesFilters(legacyProgram, els8);
    if (result === false) {
      console.log('  ✓ Passed: Missing service_area handled correctly\n');
      passed++;
    } else {
      console.log('  ✗ Failed: Missing service_area should exclude from county filter\n');
      failed++;
      failures.push('Test 8: Missing service_area');
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err.message}\n`);
    failed++;
    failures.push(`Test 8: ${err.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests passed: ${passed}`);
  console.log(`Tests failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
    console.log('\n❌ Filter validation failed. Please fix the issues above.');
    return false;
  }
  console.log('\n✅ All filter validation tests passed!');
  return true;
}

async function loadBrowserScript(relativePath, win = {}) {
  const absPath = join(rootDir, relativePath);
  const code = readFileSync(absPath, 'utf8');
  // Real ES modules (converted files) can't run through `new Function` (a
  // top-level `export` is a SyntaxError in a function body) - import them
  // directly instead, and merge their exports into `win` so later
  // not-yet-converted classic files loaded into the same `win` still find
  // these symbols via window.foo, same as they do in the browser.
  if (/(^|\n)export\s/.test(code)) {
    const mod = await import(pathToFileURL(absPath).href);
    Object.assign(win, mod);
    return win;
  }
  const fn = new Function('window', code);
  fn(win);
  return win;
}

async function runSearchFilterTests() {
  console.log('\nRunning search/location/age filter tests...\n');
  const win = {};
  await loadBrowserScript('src/js/utils/location-match.js', win);
  await loadBrowserScript('src/js/utils/helpers.js', win);
  await loadBrowserScript('src/js/modules/search.js', win);

  const {
    programServesLocation,
    countyForCity,
    parseAgeSpec,
    programServesAge,
    detectCareLevel,
    parseSmartSearch,
    getTextSearchTerms,
    stripFilterFromQuery,
  } = win;

  let passed = 0;
  let failed = 0;
  const failures = [];

  const assert = (name, condition) => {
    if (condition) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}`);
      failed++;
      failures.push(name);
    }
  };

  const hasVirtual = (p) => {
    const s = (p.service_setting || '').toLowerCase();
    return s.includes('virtual') || (p.locations || []).some((l) => (l.city || '').toLowerCase() === 'virtual');
  };
  const opts = { safeStr, hasVirtual };

  assert(
    'Same-county match (McKinney program, Plano search)',
    programServesLocation(
      { locations: [{ city: 'McKinney' }] },
      'Plano',
      opts
    ) === true
  );

  assert(
    'Direct city match',
    programServesLocation(
      { locations: [{ city: 'Dallas' }] },
      'Dallas',
      opts
    ) === true
  );

  assert(
    'Houston program excluded for Plano search',
    programServesLocation(
      { locations: [{ city: 'Houston' }], notes: '' },
      'Plano',
      opts
    ) === false
  );

  assert(
    'Virtual program included for Plano search',
    programServesLocation(
      {
        service_setting: 'Virtual',
        locations: [{ city: 'Virtual' }],
      },
      'Plano',
      opts
    ) === true
  );

  assert(
    'Broad location (Multiple) matches any city',
    programServesLocation(
      { locations: [{ city: 'Multiple' }] },
      'Frisco',
      opts
    ) === true
  );

  assert(
    'service_area county match',
    programServesLocation(
      {
        locations: [{ city: 'Austin' }],
        service_area: { counties: ['Collin'] },
      },
      'Plano',
      opts
    ) === true
  );

  assert('countyForCity(Plano) is Collin', countyForCity('Plano') === 'Collin');

  assert(
    'parseAgeSpec handles 13–24',
    JSON.stringify(parseAgeSpec('13–24')) === JSON.stringify([[13, 24]])
  );

  assert(
    'parseAgeSpec handles Child & Adolescent',
    parseAgeSpec('Child & Adolescent').length > 0
  );

  assert(
    'programServesAge 15 for 13-24',
    programServesAge({ ages_served: '13-24' }, 15) === true
  );

  assert(
    'programServesAge unknown returns null',
    programServesAge({ ages_served: 'Unknown' }, 14) === null
  );

  assert(
    'detectCareLevel: day treatment → PHP',
    detectCareLevel('day treatment Dallas') === 'Partial Hospitalization (PHP)'
  );
  assert(
    'detectCareLevel: partial hospitalization → PHP',
    detectCareLevel('partial hospitalization') === 'Partial Hospitalization (PHP)'
  );
  assert(
    'detectCareLevel: intensive outpatient → IOP',
    detectCareLevel('intensive outpatient') === 'Intensive Outpatient (IOP)'
  );
  assert(
    'parseSmartSearch: outpatient without intensive',
    parseSmartSearch('outpatient Frisco', ['frisco', 'dallas']).care === 'Outpatient'
  );

  const iopFrisco14 = parseSmartSearch('IOP in Frisco for 14', ['frisco', 'dallas']);
  assert(
    'parseSmartSearch: IOP in Frisco for 14',
    iopFrisco14.care === 'Intensive Outpatient (IOP)' &&
      iopFrisco14.loc === 'Frisco' &&
      iopFrisco14.age === '14'
  );
  win.getSearchCities = () => ['frisco', 'dallas', 'plano'];
  assert(
    'getTextSearchTerms: IOP in Frisco for 14 has no leftover tokens',
    getTextSearchTerms('IOP in Frisco for 14') === ''
  );
  assert(
    'getTextSearchTerms: PHP in Frisco for a 14 year old has no leftover tokens',
    getTextSearchTerms('PHP in Frisco for a 14 year old') === ''
  );
  const phpFrisco14 = parseSmartSearch('PHP in Frisco for a 14 year old', ['frisco', 'dallas']);
  assert(
    'parseSmartSearch: PHP in Frisco for a 14 year old',
    phpFrisco14.care === 'Partial Hospitalization (PHP)' &&
      phpFrisco14.loc === 'Frisco' &&
      phpFrisco14.age === '14'
  );
  assert(
    'stripFilterFromQuery: remove location keeps care and age',
    stripFilterFromQuery('IOP in Frisco for 14', 'parsedLocation') === 'IOP 14'
  );
  assert(
    'parseSmartSearch: does not treat "in" as a city',
    parseSmartSearch('IOP in for 14', ['frisco', 'in', 'dallas']).loc === ''
  );

  console.log(`\nSearch filter tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    failures.forEach((f) => console.log(`  - ${f}`));
    return false;
  }
  console.log('✅ Search/location/age tests passed!');
  return true;
}

function runInsurancePlanAudit() {
  console.log('\nRunning insurance plan smart-search audit...\n');
  const result = spawnSync('node', ['scripts/audit-insurance-plans.mjs'], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.log('\n❌ Insurance plan audit failed.');
    return false;
  }
  console.log('\n✅ Insurance plan audit passed!');
  return true;
}

const statewideOk = runFilterTests();
const searchOk = await runSearchFilterTests();
const insuranceOk = runInsurancePlanAudit();
process.exit(statewideOk && searchOk && insuranceOk ? 0 : 1);

