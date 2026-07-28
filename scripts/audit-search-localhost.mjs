#!/usr/bin/env node
/**
 * Offline audit: filter/search logic vs programs.json (mirrors browser modules).
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function loadBrowserScript(relativePath, win = {}) {
  const absPath = join(root, relativePath);
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
  new Function('window', code)(win);
  return win;
}

const win = {};
await loadBrowserScript('src/js/utils/location-match.js', win);
await loadBrowserScript('src/js/utils/helpers.js', win);
await loadBrowserScript('src/js/modules/search.js', win);
await loadBrowserScript('src/js/modules/filters.js', win);

// search.js's real exports are the raw parseSmartSearch(query, cities) /
// getTextSearchTerms(query, cities) - the browser-only window.* shims
// auto-inject cities via resolveSearchCities(). Reproduce that here so the
// rest of this script (and matchesFilters, which always calls
// options.parseSmartSearch with just the query) keep working the same as
// they did against the shims.
const { CITIES } = await import(pathToFileURL(join(root, 'src/js/config/constants.js')).href);
const rawParseSmartSearch = win.parseSmartSearch;
win.parseSmartSearch = (query) => rawParseSmartSearch(query, CITIES);
const rawGetTextSearchTerms = win.getTextSearchTerms;
win.getTextSearchTerms = (query) => rawGetTextSearchTerms(query, CITIES);

const data = JSON.parse(readFileSync(join(root, 'public/data/programs.json'), 'utf8'));
win.registerInsurancePlansFromData(data.programs);
const allPrograms = data.programs;
const treatment = allPrograms.filter((p) => (p.entry_type || '').toLowerCase() !== 'crisis service');
const crisis = allPrograms.filter((p) => (p.entry_type || '').toLowerCase() === 'crisis service');

const cities = new Set();
treatment.forEach((p) => {
  (p.locations || []).forEach((l) => {
    const c = (l.city || '').trim();
    const k = c.toLowerCase();
    if (c && !['virtual', 'multiple', 'national', 'n/a'].includes(k)) cities.add(k);
  });
});
win.getSearchCities = () => [...cities].map((c) => c.toLowerCase()).sort();

const safeStr = win.safeStr;
const opts = {
  safeStr,
  fuzzyMatch: win.fuzzyMatch,
  programServesAge: win.programServesAge,
  programServesLocation: win.programServesLocation,
  hasVirtual: (p) => {
    const s = (p.service_setting || '').toLowerCase();
    if (s.includes('virtual') || s.includes('tele')) return true;
    return (p.locations || []).some((l) => (l.city || '').toLowerCase() === 'virtual');
  },
  locLabel: (p) => {
    const l = (p.locations || [])[0] || {};
    return [l.city, l.state].filter(Boolean).join(', ') || 'Location not listed';
  },
  parseSmartSearch: win.parseSmartSearch,
  programs: allPrograms,
  ready: true,
  featureFlags: {},
};

function filter(list, filters, showCrisis = false) {
  const f = { ...filters, showCrisis };
  return list.filter((p) => win.matchesFilters(p, f, opts));
}

function cityOnlyCount(city) {
  return treatment.filter((p) =>
    (p.locations || []).some(
      (l) => (l.city || '').toLowerCase() === city.toLowerCase()
    )
  ).length;
}

const report = [];

function row(name, expected, actual, pass, notes = '') {
  report.push({ name, expected, actual, pass, notes });
}

// --- Baseline ---
row('Total programs in JSON', allPrograms.length, allPrograms.length, true);
row('Treatment programs (excl crisis)', treatment.length, treatment.length, true);
row('Crisis programs', crisis.length, crisis.length, true);

const baselineTreatment = filter(treatment, {}, false);
row('No filters (treatment view)', treatment.length, baselineTreatment.length, baselineTreatment.length === treatment.length);

// --- Location: Plano ---
const planoCityOnly = cityOnlyCount('Plano');
const planoFiltered = filter(treatment, { location: 'Plano' }, false);
row(
  'Location: Plano (service-area aware)',
  `>${planoCityOnly}`,
  planoFiltered.length,
  planoFiltered.length > planoCityOnly,
  `city-only would be ${planoCityOnly}; got ${planoFiltered.length}`
);

const planoHasMcKinney = planoFiltered.some((p) =>
  (p.locations || []).some((l) => /mckinney/i.test(l.city || ''))
);
row(
  'Plano includes same-county (McKinney)',
  true,
  planoHasMcKinney,
  planoHasMcKinney,
  'Collin County cross-match'
);

const planoHasVirtual = planoFiltered.some((p) => opts.hasVirtual(p));
row('Plano includes virtual programs', true, planoHasVirtual, planoHasVirtual);

const houstonExcluded = !filter(treatment, { location: 'Plano' }, false).some((p) =>
  (p.locations || []).some((l) => (l.city || '').toLowerCase() === 'houston')
);
row('Plano excludes Houston-only site', true, houstonExcluded, houstonExcluded);

// --- Care level synonyms ---
const phpDay = win.parseSmartSearch('day treatment Dallas');
row(
  'Smart parse: day treatment → PHP',
  'Partial Hospitalization (PHP)',
  phpDay.care,
  phpDay.care === 'Partial Hospitalization (PHP)'
);
const phpPartial = win.parseSmartSearch('partial hospitalization Plano');
row(
  'Smart parse: partial hospitalization → PHP',
  'Partial Hospitalization (PHP)',
  phpPartial.care,
  phpPartial.care === 'Partial Hospitalization (PHP)'
);

// --- Smart search: IOP Plano ---
const iopPlano = filter(treatment, { query: 'IOP in Plano' }, false);
const iopPlanoParsed = win.parseSmartSearch('IOP in Plano');
row(
  'Smart parse: IOP in Plano → care',
  'Intensive Outpatient (IOP)',
  iopPlanoParsed.care,
  iopPlanoParsed.care === 'Intensive Outpatient (IOP)'
);
row(
  'Smart parse: IOP in Plano → loc',
  'Plano',
  iopPlanoParsed.loc,
  /plano/i.test(iopPlanoParsed.loc || '')
);
const iopOnly = treatment.filter(
  (p) => (p.level_of_care || '') === 'Intensive Outpatient (IOP)'
);
const iopInPlanoCity = iopOnly.filter((p) =>
  (p.locations || []).some((l) => (l.city || '').toLowerCase() === 'plano')
);
row(
  'Query "IOP in Plano" result count',
  `≥${iopInPlanoCity.length}`,
  iopPlano.length,
  iopPlano.length >= iopInPlanoCity.length && iopPlano.every((p) => p.level_of_care === 'Intensive Outpatient (IOP)'),
  `IOP in Plano city only: ${iopInPlanoCity.length}`
);

// --- Age 14 ---
const age14 = filter(treatment, { age: '14' }, false);
const unknownAge = treatment.filter((p) => win.programServesAge(p, 14) === null);
const serves14False = treatment.filter((p) => win.programServesAge(p, 14) === false);
row(
  'Age 14: includes unknown ages_served',
  treatment.length - serves14False.length,
  age14.length,
  age14.length >= treatment.length - serves14False.length - 5,
  `excluded only ${serves14False.length} definite non-serves; unknown kept: ${unknownAge.length}`
);

const youth180 = allPrograms.find((p) => (p.ages_served || '').includes('13') && (p.ages_served || '').includes('24'));
if (youth180) {
  const yIn14 = age14.some((p) => p.program_id === youth180.program_id);
  row('Age 14 includes 13–24 program (Youth180 if present)', true, yIn14, yIn14, youth180.program_name);
}

// --- Age filter excludes wrong range ---
const age5 = filter(treatment, { age: '5' }, false);
const php1317 = treatment.filter(
  (p) => (p.ages_served || '').replace(/\u2013/g, '-') === '13-17'
);
const php1317InAge5 = age5.filter((p) => php1317.some((x) => x.program_id === p.program_id));
row(
  'Age 5 excludes typical 13–17 only programs',
  0,
  php1317InAge5.length,
  php1317InAge5.length === 0,
  `13-17 programs in age-5 results: ${php1317InAge5.length}`
);

// --- Insurance Medicaid bucket ---
const medicaid = filter(treatment, { insurance: 'bucket:medicaid' }, false);
const medicaidManual = treatment.filter((p) => {
  const ins = p.accepted_insurance || {};
  const hay = [
    ...(ins.types || []),
    ...(ins.plans || []),
    p.insurance_notes || '',
  ]
    .join(' ')
    .toLowerCase();
  return /medicaid|chip/.test(hay);
});
row(
  'Insurance: Medicaid bucket',
  `~${medicaidManual.length}`,
  medicaid.length,
  medicaid.length > 0 && medicaid.length <= medicaidManual.length + 15,
  `manual upper bound ~${medicaidManual.length}`
);

// --- Insurance smart search ---
const medicaidParse = win.parseSmartSearch('accepts Medicaid');
row(
  'Smart parse: accepts Medicaid → bucket',
  'bucket:medicaid',
  medicaidParse.insurance,
  medicaidParse.insurance === 'bucket:medicaid'
);
const medicaidQuery = filter(treatment, { query: 'accepts Medicaid' }, false);
row(
  'Query "accepts Medicaid" matches bucket filter',
  medicaid.length,
  medicaidQuery.length,
  medicaidQuery.length === medicaid.length,
  `bucket-only: ${medicaid.length}`
);
const iopMedicaidParse = win.parseSmartSearch('IOP accepts Medicaid');
row(
  'Smart parse: IOP accepts Medicaid → care + insurance',
  'IOP + medicaid',
  `${iopMedicaidParse.care}|${iopMedicaidParse.insurance}`,
  iopMedicaidParse.care === 'Intensive Outpatient (IOP)' &&
    iopMedicaidParse.insurance === 'bucket:medicaid'
);
const iopMedicaid = filter(treatment, { query: 'IOP accepts Medicaid' }, false);
row(
  'Query "IOP accepts Medicaid" narrows results',
  `>0 and <${medicaid.length}`,
  iopMedicaid.length,
  iopMedicaid.length > 0 && iopMedicaid.length < medicaid.length,
  `medicaid-only: ${medicaid.length}`
);

// Spot-check named plans (full matrix: npm run audit:insurance)
const uhcParse = win.parseSmartSearch('accepts uhc');
const uhcPlanCount = filter(treatment, { insurance: 'plan:UnitedHealthcare' }, false).length;
const uhcQueryCount = filter(treatment, { query: 'accepts uhc' }, false).length;
row(
  'Smart parse: accepts uhc → plan:UnitedHealthcare',
  'plan:UnitedHealthcare',
  uhcParse.insurance,
  uhcParse.insurance === 'plan:UnitedHealthcare' && uhcQueryCount === uhcPlanCount
);
const umrParse = win.parseSmartSearch('accepts umr');
const umrPlanCount = filter(treatment, { insurance: 'plan:UMR' }, false).length;
const umrQueryCount = filter(treatment, { query: 'accepts umr' }, false).length;
row(
  'Smart parse: accepts umr → plan:UMR (not UnitedHealthcare)',
  'plan:UMR',
  umrParse.insurance,
  umrParse.insurance === 'plan:UMR' && umrQueryCount === umrPlanCount
);
const bhsParse = win.parseSmartSearch('accepts bhs');
const bhsCount = filter(treatment, { insurance: 'plan:Behavioral Health Systems' }, false).length;
row(
  'Smart parse: accepts bhs → Behavioral Health Systems',
  'plan:Behavioral Health Systems',
  bhsParse.insurance,
  bhsParse.insurance === 'plan:Behavioral Health Systems' &&
    filter(treatment, { query: 'accepts bhs' }, false).length === bhsCount
);

// --- Virtual only ---
const virtualOnly = filter(treatment, { onlyVirtual: true }, false);
const virtualManual = treatment.filter((p) => opts.hasVirtual(p));
row(
  'Virtual only toggle',
  virtualManual.length,
  virtualOnly.length,
  virtualOnly.length === virtualManual.length
);

// --- Care level ---
const phpCare = filter(treatment, { care: 'Partial Hospitalization (PHP)' }, false);
const phpManual = treatment.filter(
  (p) => p.level_of_care === 'Partial Hospitalization (PHP)'
);
row('Care: PHP', phpManual.length, phpCare.length, phpCare.length === phpManual.length);

// --- Crisis hidden by default ---
const crisisHidden = filter(treatment, {}, false);
const crisisInTreatment = crisisHidden.filter((p) =>
  (p.entry_type || '').toLowerCase().includes('crisis')
);
row('Crisis hidden in treatment view', 0, crisisInTreatment.length, crisisInTreatment.length === 0);

const crisisShown = filter(crisis, { showCrisis: true }, true);
row('Crisis view count', crisis.length, crisisShown.length, crisisShown.length === crisis.length);

// --- Crisis smart parse ---
const crisisParse = win.parseSmartSearch('crisis support');
row('Smart parse crisis → showCrisis', true, crisisParse.showCrisis, crisisParse.showCrisis === true);

// --- Stopword: "IOP in Plano" must not match all programs on "in" ---
const iopInPlanoQueryOnly = filter(treatment, { query: 'IOP in Plano' }, false);
row(
  'Query "IOP in Plano" (no stray "in" match)',
  16,
  iopInPlanoQueryOnly.length,
  iopInPlanoQueryOnly.length === 16,
  `getTextSearchTerms="${win.getTextSearchTerms('IOP in Plano')}"`
);

const virtualQuery = filter(treatment, { query: '', onlyVirtual: true }, false);
row(
  'Virtual preset logic: onlyVirtual (no query)',
  5,
  virtualQuery.length,
  virtualQuery.length === 5
);

// --- Relevance: getTextSearchTerms no recursion ---
let textTermsOk = true;
try {
  const terms = win.getTextSearchTerms('Childrens Health');
  textTermsOk = typeof terms === 'string';
} catch (e) {
  textTermsOk = false;
}
row('getTextSearchTerms runs without error', true, textTermsOk, textTermsOk);

// --- Dallas + age 13 preset logic ---
const teensDallas = filter(
  treatment,
  { location: 'Dallas', age: '13' },
  false
);
row(
  'Preset logic: Dallas + age 13',
  '>0',
  teensDallas.length,
  teensDallas.length > 0
);

// --- Eating disorder domain (if in data) ---
const eating = filter(
  treatment,
  { serviceDomain: 'eating_disorders' },
  false
);
const eatingManual = treatment.filter((p) =>
  (p.service_domains || []).includes('eating_disorders')
);
row(
  'Service domain: eating_disorders',
  eatingManual.length,
  eating.length,
  eating.length === eatingManual.length
);

// Print report
console.log('\n=== SEARCH/FILTER AUDIT (programs.json) ===\n');
let passed = 0;
let failed = 0;
for (const r of report) {
  const icon = r.pass ? 'PASS' : 'FAIL';
  if (r.pass) passed++;
  else failed++;
  console.log(`${icon}  ${r.name}`);
  console.log(`       expected: ${r.expected}  actual: ${r.actual}`);
  if (r.notes) console.log(`       ${r.notes}`);
  console.log('');
}
console.log(`Summary: ${passed} passed, ${failed} failed, ${report.length} total\n`);
process.exit(failed > 0 ? 1 : 0);
