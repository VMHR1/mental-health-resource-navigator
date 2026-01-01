#!/usr/bin/env node
/**
 * Filter Validation Script
 * Tests that statewide-ready fields don't break filtering logic
 * Run during dev builds to catch regressions early
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// Simplified matchesFilters logic (extracted from app.js)
function testMatchesFilters(p, els) {
  // County filter
  const countyVal = els.county ? safeStr(els.county.value || '') : '';
  if (countyVal) {
    const programCounty = safeStr(p.primary_county || '').toLowerCase();
    const serviceAreaCounties = Array.isArray(p.service_area?.counties) 
      ? p.service_area.counties.map(c => safeStr(c).toLowerCase())
      : [];
    const countyMatch = programCounty === countyVal.toLowerCase() ||
                        serviceAreaCounties.includes(countyVal.toLowerCase());
    if (!countyMatch) return false;
  }

  // Service domain filter
  const serviceDomainVal = els.serviceDomain ? safeStr(els.serviceDomain.value || '') : '';
  if (serviceDomainVal) {
    const programDomains = Array.isArray(p.service_domains) 
      ? p.service_domains.map(d => safeStr(d).toLowerCase())
      : [];
    if (!programDomains.includes(serviceDomainVal.toLowerCase())) return false;
  }

  // SUD services filter
  if (els.sudServices) {
    const selectedOptions = Array.from(els.sudServices.selectedOptions).map(opt => opt.value);
    if (selectedOptions.length > 0) {
      const programSudServices = Array.isArray(p.sud_services)
        ? p.sud_services.map(s => safeStr(s).toLowerCase())
        : [];
      const hasMatch = selectedOptions.some(selected =>
        programSudServices.includes(selected.toLowerCase())
      );
      if (!hasMatch) return false;
    }
  }

  // Verification recency filter
  const verificationRecencyVal = els.verificationRecency ? safeStr(els.verificationRecency.value || '') : '';
  if (verificationRecencyVal) {
    const recencyDays = parseInt(verificationRecencyVal, 10);
    if (!isNaN(recencyDays) && recencyDays > 0) {
      const verifiedAt = p.verification?.last_verified_at || p.last_verified;
      if (!verifiedAt) return false;
      
      try {
        const verifiedDate = new Date(verifiedAt);
        if (isNaN(verifiedDate.getTime())) return false;
        
        const now = new Date();
        const daysDiff = Math.floor((now - verifiedDate) / (1000 * 60 * 60 * 24));
        if (daysDiff > recencyDays) return false;
      } catch (e) {
        return false;
      }
    }
  }

  return true;
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
    process.exit(1);
  } else {
    console.log('\n✅ All filter validation tests passed!');
    process.exit(0);
  }
}

// Run tests
runFilterTests();

