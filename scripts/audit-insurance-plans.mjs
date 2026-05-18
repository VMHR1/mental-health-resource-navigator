#!/usr/bin/env node
/**
 * Verifies every insurance plan in programs.json is reachable via smart search
 * with the same result count as the plan: dropdown filter.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadBrowserScript(relativePath, win = {}) {
  const code = readFileSync(join(root, relativePath), 'utf8');
  new Function('window', code)(win);
  return win;
}

const win = {};
loadBrowserScript('src/js/utils/location-match.js', win);
loadBrowserScript('src/js/utils/helpers.js', win);
loadBrowserScript('src/js/modules/search.js', win);
loadBrowserScript('src/js/modules/filters.js', win);

const data = JSON.parse(readFileSync(join(root, 'public/data/programs.json'), 'utf8'));
const allPrograms = data.programs;
const treatment = allPrograms.filter(
  (p) => (p.entry_type || '').toLowerCase() !== 'crisis service'
);

win.registerInsurancePlansFromData(allPrograms);

const safeStr = win.safeStr;
const opts = {
  safeStr,
  fuzzyMatch: win.fuzzyMatch,
  programServesAge: win.programServesAge,
  programServesLocation: win.programServesLocation,
  hasVirtual: () => false,
  locLabel: () => '',
  parseSmartSearch: win.parseSmartSearch,
  programs: allPrograms,
  ready: true,
  featureFlags: {},
};

function filter(list, filters) {
  return list.filter((p) => win.matchesFilters(p, { ...filters, showCrisis: false }, opts));
}

function countPlan(plan) {
  return filter(treatment, { insurance: `plan:${plan}` }).length;
}

/** Plans where a short query should map to a bucket (broader than plan: filter). */
const BUCKET_PLAN_EXPECTED = {
  Medicaid: { queries: ['accepts medicaid', 'medicaid'], expect: 'bucket:medicaid' },
  Medicare: { queries: ['accepts medicare', 'medicare'], expect: 'bucket:medicare' },
  TRICARE: { queries: ['accepts tricare', 'tricare'], expect: 'bucket:tricare' },
  CHIP: { queries: ['chip', 'accepts chip'], expect: 'bucket:medicaid' },
};

const planNameSet = new Set();
allPrograms.forEach((p) => {
  (p.accepted_insurance?.plans || []).forEach((pl) => {
    if (pl) planNameSet.add(pl);
  });
});
const planNames = [...planNameSet].sort();

function candidateQueries(plan) {
  const entry = win.getInsurancePlanAliasEntry(plan);
  const aliases = entry?.aliases || [];
  const set = new Set();
  set.add(`accepts ${plan.toLowerCase()}`);
  set.add(plan.toLowerCase());
  aliases.forEach((a) => {
    set.add(`accepts ${a}`);
    set.add(a);
  });
  return [...set];
}

let passed = 0;
let failed = 0;
const failures = [];

console.log('\n=== INSURANCE PLAN SMART SEARCH AUDIT ===\n');

for (const plan of planNames) {
  const planCount = countPlan(plan);
  const bucketSpec = BUCKET_PLAN_EXPECTED[plan];

  if (bucketSpec) {
    const q = bucketSpec.queries[0];
    const parsed = win.parseSmartSearch(q);
    const bucketCount = filter(treatment, {
      insurance: bucketSpec.expect,
    }).length;
    const queryCount = filter(treatment, { query: q }).length;
    const ok =
      parsed.insurance === bucketSpec.expect &&
      queryCount === bucketCount &&
      bucketCount >= planCount;
    const icon = ok ? 'PASS' : 'FAIL';
    console.log(
      `${icon}  ${plan} (bucket via "${q}") → ${parsed.insurance || '(none)'} | plan:${planCount} bucket:${bucketCount} query:${queryCount}`
    );
    if (ok) passed++;
    else {
      failed++;
      failures.push(plan);
    }
    continue;
  }

  if (planCount === 0) {
    console.log(`SKIP  ${plan} (0 programs in treatment view)`);
    passed++;
    continue;
  }

  let ok = false;
  let winningQuery = '';
  let winningParse = '';
  let queryCount = 0;

  for (const q of candidateQueries(plan)) {
    const parsed = win.parseSmartSearch(q);
    if (parsed.insurance !== `plan:${plan}`) continue;
    const n = filter(treatment, { query: q }).length;
    if (n === planCount) {
      ok = true;
      winningQuery = q;
      winningParse = parsed.insurance;
      queryCount = n;
      break;
    }
  }

  const icon = ok ? 'PASS' : 'FAIL';
  console.log(
    `${icon}  ${plan} | "${winningQuery || candidateQueries(plan)[0]}" → ${winningParse || 'no match'} | expected ${planCount} got ${queryCount}`
  );
  if (ok) passed++;
  else {
    failed++;
    failures.push(plan);
  }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed, ${planNames.length} plans\n`);
if (failures.length) {
  console.log('Failures:', failures.join(', '));
}
process.exit(failed > 0 ? 1 : 0);
