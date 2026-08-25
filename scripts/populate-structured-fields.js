#!/usr/bin/env node
/**
 * Populate the derived, machine-queryable fields on public/data/programs.json.
 *
 *   node scripts/populate-structured-fields.js [--dry-run] [--report <path>]
 *
 * ADDITIVE ONLY. The display/provenance fields these are derived from
 * (`ages_served`, `accepted_insurance.types`, `service_setting`, `locations`)
 * are read and never written. What this script writes:
 *
 *   age_min / age_max       from ages_served, via the REAL parseAgeSpec
 *   insurance_categories    from accepted_insurance.types[], via an explicit table
 *   virtual_available       from service_setting / locations[].city
 *
 * Idempotent: it recomputes each derived field from the source fields on every
 * run, so running it twice is a no-op. Re-running after a source field changes
 * updates the derived value, including clearing it when the source stops
 * supporting one — that is the point of a derived field.
 *
 * The one asymmetry is `virtual_available`, which is set but never unset. The
 * schema calls it an "explicit bool", so a hand-curated true (a program that is
 * virtual for reasons not visible in service_setting) must survive this script.
 *
 * Nothing is ever guessed. An unparseable ages_served leaves age_min/age_max
 * ABSENT rather than defaulted, and a payer string missing from the table is
 * printed under "UNMAPPED — FOR JARED'S REVIEW" and leaves the program
 * uncategorized for that string.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// The real production parser, imported the way scripts/validate-filters.js
// imports the real filters module. A hand-copied reimplementation can pass here
// while production breaks (see CLAUDE.md, "Path-trace every claim").
import { parseAgeSpec } from '../src/js/utils/helpers.js';
import { INSURANCE_CATEGORIES } from '../src/js/config/validation-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const PROGRAMS_PATH = join(rootDir, 'public', 'data', 'programs.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const reportFlagIndex = args.indexOf('--report');
const REPORT_PATH =
  reportFlagIndex !== -1 && args[reportFlagIndex + 1]
    ? resolve(process.cwd(), args[reportFlagIndex + 1])
    : join(rootDir, 'scripts', 'structured-fields-review.md');

// ── Insurance mapping ────────────────────────────────────────────────────────
// Keys are the ACTUAL distinct accepted_insurance.types[] strings in
// public/data/programs.json (extracted from the file, not invented), matched
// case-insensitively after whitespace collapse. Add a row here rather than
// loosening the matcher — a fuzzy matcher is how "Other government programs"
// silently becomes "medicaid_chip".
const INSURANCE_TYPE_MAP = new Map(
  Object.entries({
    // commercial
    'commercial': 'commercial',
    'commercial (most major)': 'commercial',
    'commercial (many)': 'commercial',
    'commercial (all)': 'commercial',
    'commercial (in-network)': 'commercial',
    // medicaid / chip
    'medicaid': 'medicaid_chip',
    'medicaid/chip': 'medicaid_chip',
    'medicaid (select states)': 'medicaid_chip',
    'medicaid/chip (some)': 'medicaid_chip',
    'medicaid/chip (under 21)': 'medicaid_chip',
    'medicaid/chip (some products)': 'medicaid_chip',
    'medicaid/chip plans (listed)': 'medicaid_chip',
    'medicaid/chip (varies by plan/service area)': 'medicaid_chip',
    // medicare
    'medicare': 'medicare',
    'medicare (incl. medicare advantage)': 'medicare',
    // tricare / military
    'military (tricare)': 'tricare',
    'tricare (keller location page)': 'tricare',
    'military/veterans (tricare, champva)': 'tricare',
  }),
);

const normalizeType = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// accepted_insurance.status values that mean "we have no payer list to
// categorize". Programs in these states get no insurance_categories at all.
const NO_CATEGORY_STATUSES = new Set(['not_applicable', 'contact_for_info']);

// ── Age parsing ──────────────────────────────────────────────────────────────
// parseAgeSpec caps open-ended specs ("11+", "All ages") at an internal
// DIRECTORY_MAX_AGE constant that helpers.js does not export. Rather than
// hardcode 24 — a second copy of a number that could drift — derive the
// sentinel from the real module by parsing a spec that is definitionally
// open-ended. If the sentinel ever changes in helpers.js, this follows it.
const OPEN_ENDED_SENTINEL = (() => {
  const probe = parseAgeSpec('0+');
  if (!probe.length) {
    throw new Error(
      "parseAgeSpec('0+') returned no range — helpers.js changed shape; " +
        'fix this script before trusting its output.',
    );
  }
  return probe[0][1];
})();

/**
 * @returns {{age_min?: number, age_max?: number}} — keys are omitted, never
 *   null, when the bound is unknown.
 */
function deriveAges(agesServed) {
  const ranges = parseAgeSpec(agesServed);
  if (!ranges.length) return {}; // unparseable / "Unknown" — never guess

  const min = Math.min(...ranges.map(([lo]) => lo));
  const max = Math.max(...ranges.map(([, hi]) => hi));

  // An upper bound equal to the sentinel is the parser's placeholder for
  // "open-ended", UNLESS the source string names that number itself
  // (e.g. "13–24"), in which case it is a real stated bound.
  const raw = String(agesServed ?? '');
  const namesSentinel = new RegExp(`(?<!\\d)${OPEN_ENDED_SENTINEL}(?!\\d)`).test(raw);
  if (max === OPEN_ENDED_SENTINEL && !namesSentinel) {
    return { age_min: min };
  }
  return { age_min: min, age_max: max };
}

// ── Virtual ──────────────────────────────────────────────────────────────────
function isVirtual(program) {
  if (String(program.service_setting ?? '').trim().toLowerCase() === 'virtual') return true;
  const locations = Array.isArray(program.locations) ? program.locations : [];
  return locations.some((l) => String(l?.city ?? '').trim().toLowerCase() === 'virtual');
}

// ── Rewrite a record, keeping key order readable ─────────────────────────────
/**
 * Shallow-rebuild `program` with `derived` keys placed immediately after their
 * source field. Purely cosmetic — it keeps the JSON diff local instead of
 * appending three keys to the end of every record.
 */
function withDerivedKeys(program, derived, anchors) {
  const derivedKeys = new Set(Object.keys(derived));
  const out = {};
  for (const [key, value] of Object.entries(program)) {
    // A derived key already on the record is re-emitted at its anchor below.
    if (derivedKeys.has(key)) continue;
    out[key] = value;
    for (const [derivedKey, anchor] of Object.entries(anchors)) {
      if (anchor === key && derivedKeys.has(derivedKey) && !(derivedKey in out)) {
        out[derivedKey] = derived[derivedKey];
      }
    }
  }
  // Anchors that do not exist on this record (e.g. no ages_served at all).
  for (const [key, value] of Object.entries(derived)) {
    if (!(key in out)) out[key] = value;
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(PROGRAMS_PATH, 'utf8'));
const programs = data.programs;
if (!Array.isArray(programs)) {
  console.error('programs.json must contain a programs array');
  process.exit(1);
}

const counts = {
  total: programs.length,
  age_min: 0,
  age_max: 0,
  age_absent: 0,
  age_open_ended: 0,
  insurance_categories: 0,
  insurance_skipped_status: 0,
  insurance_no_types: 0,
  virtual_available: 0,
  virtual_preexisting: 0,
};
const categoryTotals = Object.fromEntries(INSURANCE_CATEGORIES.map((c) => [c, 0]));
/** @type {Map<string, string[]>} unmapped payer string -> program_ids */
const unmapped = new Map();
/** @type {string[]} */
const unparseableAges = [];

const nextPrograms = programs.map((program) => {
  const derived = {};

  // age_min / age_max
  const ages = deriveAges(program.ages_served);
  if (ages.age_min !== undefined) {
    derived.age_min = ages.age_min;
    counts.age_min += 1;
  }
  if (ages.age_max !== undefined) {
    derived.age_max = ages.age_max;
    counts.age_max += 1;
  } else if (ages.age_min !== undefined) {
    counts.age_open_ended += 1;
  }
  if (ages.age_min === undefined) {
    counts.age_absent += 1;
    unparseableAges.push(
      `${program.program_id} — ages_served: ${JSON.stringify(program.ages_served ?? null)}`,
    );
  }

  // insurance_categories
  const insurance = program.accepted_insurance || {};
  const status = insurance.status;
  const types = Array.isArray(insurance.types) ? insurance.types : [];
  if (NO_CATEGORY_STATUSES.has(status)) {
    counts.insurance_skipped_status += 1;
  } else if (types.length === 0) {
    counts.insurance_no_types += 1;
  } else {
    const categories = [];
    for (const raw of types) {
      const category = INSURANCE_TYPE_MAP.get(normalizeType(raw));
      if (!category) {
        const key = String(raw);
        if (!unmapped.has(key)) unmapped.set(key, []);
        unmapped.get(key).push(program.program_id);
        continue; // uncategorized — never guessed
      }
      if (!categories.includes(category)) categories.push(category);
    }
    if (categories.length > 0) {
      categories.sort();
      derived.insurance_categories = categories;
      counts.insurance_categories += 1;
      categories.forEach((c) => { categoryTotals[c] += 1; });
    }
  }

  // virtual_available — set, never unset (see header note).
  if (isVirtual(program)) {
    derived.virtual_available = true;
    counts.virtual_available += 1;
  } else if (program.virtual_available === true) {
    counts.virtual_preexisting += 1;
  }

  const next = withDerivedKeys(program, derived, {
    age_min: 'ages_served',
    age_max: 'ages_served',
    insurance_categories: 'accepted_insurance',
    virtual_available: 'service_setting',
  });

  // Clear a previously-derived value the sources no longer support, so a
  // re-run after a source edit does not leave a stale number behind.
  if (!('age_min' in derived)) delete next.age_min;
  if (!('age_max' in derived)) delete next.age_max;
  if (!('insurance_categories' in derived) && !NO_CATEGORY_STATUSES.has(status)) {
    // Only clear when we actually evaluated the payer list. A status-skipped
    // program never had categories to begin with.
    if (types.length > 0) delete next.insurance_categories;
  }
  if (NO_CATEGORY_STATUSES.has(status)) delete next.insurance_categories;

  return next;
});

// ── Report ───────────────────────────────────────────────────────────────────
const pct = (n) => `${((n / counts.total) * 100).toFixed(1)}%`;
const row = (label, n, note = '') =>
  `  ${label.padEnd(34)} ${String(n).padStart(4)}  ${String(pct(n)).padStart(6)}  ${note}`;

console.log('='.repeat(72));
console.log('Structured field population — public/data/programs.json');
console.log('='.repeat(72));
console.log(`\nPrograms: ${counts.total}`);
console.log(`Open-ended sentinel from parseAgeSpec('0+'): ${OPEN_ENDED_SENTINEL}\n`);
console.log('  FIELD                              COUNT   SHARE  NOTE');
console.log(row('age_min set', counts.age_min));
console.log(row('age_max set', counts.age_max));
console.log(row('age_min only (open-ended)', counts.age_open_ended, 'age_max deliberately absent'));
console.log(row('age fields absent', counts.age_absent, 'unparseable ages_served — never guessed'));
console.log(row('insurance_categories set', counts.insurance_categories));
console.log(row('insurance skipped (status)', counts.insurance_skipped_status, [...NO_CATEGORY_STATUSES].join('/')));
console.log(row('insurance skipped (no types[])', counts.insurance_no_types));
console.log(row('virtual_available set true', counts.virtual_available));
console.log(row('virtual_available pre-existing', counts.virtual_preexisting, 'left untouched'));

console.log('\n  insurance_categories by value (programs carrying each):');
for (const [cat, n] of Object.entries(categoryTotals)) {
  console.log(`    ${cat.padEnd(16)} ${String(n).padStart(4)}`);
}

const unmappedLines = [];
unmappedLines.push('## UNMAPPED — FOR JARED\'S REVIEW');
unmappedLines.push('');
if (unmapped.size === 0) {
  unmappedLines.push('No unmapped accepted_insurance.types[] values.');
} else {
  unmappedLines.push(
    `${unmapped.size} distinct accepted_insurance.types[] value(s) matched no row in ` +
      'INSURANCE_TYPE_MAP. They were left UNCATEGORIZED — no category was guessed. ' +
      'Decide a category (or "intentionally uncategorized") for each, then add a row ' +
      'to INSURANCE_TYPE_MAP in scripts/populate-structured-fields.js and re-run.',
  );
  unmappedLines.push('');
  for (const [value, ids] of [...unmapped.entries()].sort((a, b) => b[1].length - a[1].length)) {
    unmappedLines.push(`- **${value}** — ${ids.length} program(s): ${ids.join(', ')}`);
  }
}
unmappedLines.push('');
unmappedLines.push('## Unparseable ages_served (age_min/age_max left absent)');
unmappedLines.push('');
if (unparseableAges.length === 0) {
  unmappedLines.push('None.');
} else {
  unparseableAges.forEach((line) => unmappedLines.push(`- ${line}`));
}

console.log('');
console.log('='.repeat(72));
unmappedLines.forEach((l) => console.log(l));
console.log('='.repeat(72));

if (!DRY_RUN) {
  writeFileSync(PROGRAMS_PATH, `${JSON.stringify({ ...data, programs: nextPrograms }, null, 2)}\n`, 'utf8');
  console.log(`\nWrote public/data/programs.json (${nextPrograms.length} programs).`);

  const report = [
    '# Structured fields — review report',
    '',
    `Generated by \`node scripts/populate-structured-fields.js\` over ${counts.total} programs.`,
    'Regenerated on every run; edit the mapping table in the script, not this file.',
    '',
    '## Counts',
    '',
    '| Field | Count | Share |',
    '| --- | ---: | ---: |',
    `| age_min set | ${counts.age_min} | ${pct(counts.age_min)} |`,
    `| age_max set | ${counts.age_max} | ${pct(counts.age_max)} |`,
    `| age_min only (open-ended) | ${counts.age_open_ended} | ${pct(counts.age_open_ended)} |`,
    `| age fields absent | ${counts.age_absent} | ${pct(counts.age_absent)} |`,
    `| insurance_categories set | ${counts.insurance_categories} | ${pct(counts.insurance_categories)} |`,
    `| insurance skipped (status) | ${counts.insurance_skipped_status} | ${pct(counts.insurance_skipped_status)} |`,
    `| insurance skipped (no types[]) | ${counts.insurance_no_types} | ${pct(counts.insurance_no_types)} |`,
    `| virtual_available set true | ${counts.virtual_available} | ${pct(counts.virtual_available)} |`,
    '',
    '## insurance_categories by value',
    '',
    '| Category | Programs |',
    '| --- | ---: |',
    ...Object.entries(categoryTotals).map(([c, n]) => `| ${c} | ${n} |`),
    '',
    ...unmappedLines,
  ].join('\n');
  writeFileSync(REPORT_PATH, `${report}\n`, 'utf8');
  console.log(`Wrote ${REPORT_PATH}`);
  console.log('\nNext: node scripts/sync-regional-data.js && node scripts/validate-data.js');
} else {
  console.log('\n(dry run — no files modified)');
}
