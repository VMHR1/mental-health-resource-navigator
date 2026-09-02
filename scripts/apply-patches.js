#!/usr/bin/env node
/**
 * Generic program-data patch applier.
 *
 *   node scripts/apply-patches.js <patchfile.json> [--dry-run]
 *
 * Replaces the frozen one-off apply-*.js scripts (each of which hardcoded one
 * dated batch of edits) with a data-driven equivalent: the batch lives in a
 * patchfile, the mechanics live here. Phase 5 call results land through this.
 *
 * Patchfile shape:
 * {
 *   "verified_on": "2026-08-05",          // ISO date stamped on patched records
 *   "source": "phone",                     // website | phone | provider_attestation
 *   "run_id": "call-queue-2026-w32",       // free label, recorded in metadata
 *   "notes": "Intake backfill, batch 3",
 *   "changelog": { "scope": "intake", "source": "Phone confirmation" },  // optional
 *   "patches": {
 *     "<program_id>": {
 *       "fields":  { "intake_phone": "903-870-1222" },   // shallow-merged onto the record
 *       "accepted_insurance": { "status": "verified_on_website" }, // merged, not replaced
 *       "locations": [ ... ],                            // replaced wholesale when present
 *       "verification": {                                // builds the verification block
 *         "status": "verified",
 *         "source_urls": ["https://..."],
 *         "notes": "Confirmed with intake by phone.",
 *         "signals": { "phone_on_page": true }
 *       },
 *       "stamp_verified": true                           // advance last_verified (default true)
 *     }
 *   }
 * }
 *
 * Everything is validated against the shared schema before a byte is written:
 * unknown program IDs, unknown field names, wrong types, bad dates and bad
 * verification statuses are hard errors. A patchfile either applies whole or
 * not at all — no partial writes.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const schemaModule = await import(
  pathToFileURL(join(rootDir, 'src', 'js', 'config', 'validation-schema.js')).href
);
const { PROGRAM_SCHEMA, VALID_VERIFICATION_STATUSES, validateISODate } = schemaModule;

const KNOWN_FIELDS = new Set([...PROGRAM_SCHEMA.required, ...PROGRAM_SCHEMA.optional]);

// Same three mirrors every writer in this repo has to keep in lockstep;
// validate-data hard-fails on ID drift between them.
const DATA_FILES = [
  'public/data/programs.json',
  'public/data/programs.geocoded.json',
  'public/data/regions/dfw.details.json',
];
const CHANGELOG_PATH = join(rootDir, 'public', 'data', 'verification_changelog.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const patchArg = args.find((a) => !a.startsWith('--'));

if (!patchArg) {
  console.error('Usage: node scripts/apply-patches.js <patchfile.json> [--dry-run]');
  process.exit(1);
}

const patchPath = resolve(process.cwd(), patchArg);
if (!existsSync(patchPath)) {
  console.error(`Patchfile not found: ${patchPath}`);
  process.exit(1);
}

/** @type {string[]} */
const errors = [];
const fail = (msg) => errors.push(msg);

let patchfile;
try {
  patchfile = JSON.parse(readFileSync(patchPath, 'utf8'));
} catch (e) {
  console.error(`Patchfile is not valid JSON: ${e.message}`);
  process.exit(1);
}

const VERIFIED_ON = patchfile.verified_on;
const patches = patchfile.patches || {};
const programIds = Object.keys(patches);

if (!VERIFIED_ON || !validateISODate(VERIFIED_ON)) {
  fail(`verified_on must be an ISO date (YYYY-MM-DD), got: ${JSON.stringify(VERIFIED_ON)}`);
}
if (programIds.length === 0) {
  fail('patchfile has no entries under "patches"');
}

const VALID_SOURCES = ['website', 'phone', 'provider_attestation'];
if (patchfile.source && !VALID_SOURCES.includes(patchfile.source)) {
  fail(`source must be one of ${VALID_SOURCES.join(', ')}, got: ${patchfile.source}`);
}

const programsPath = join(rootDir, DATA_FILES[0]);
const programsData = JSON.parse(readFileSync(programsPath, 'utf8'));
const knownIds = new Set(programsData.programs.map((p) => p.program_id));

function validateFieldTypes(programId, fields, label) {
  for (const [field, value] of Object.entries(fields)) {
    if (!KNOWN_FIELDS.has(field)) {
      fail(
        `${programId}: ${label}.${field} is not in the schema. ` +
          'Add it to src/js/config/validation-schema.js first if it is a real field.',
      );
      continue;
    }
    const expected = PROGRAM_SCHEMA.types[field];
    if (!expected || value === null) continue;
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (actual !== expected) {
      fail(`${programId}: ${label}.${field} should be ${expected}, got ${actual}`);
    }
    if (expected === 'string' && /_at$|^last_verified$|_confirmed$/.test(field) && value) {
      if (!validateISODate(value)) {
        fail(`${programId}: ${label}.${field} should be an ISO date, got "${value}"`);
      }
    }
  }
}

for (const [programId, patch] of Object.entries(patches)) {
  if (!knownIds.has(programId)) {
    fail(`Unknown program_id: ${programId} (not in public/data/programs.json)`);
    continue;
  }
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    fail(`${programId}: patch entry must be an object`);
    continue;
  }

  if (patch.fields) validateFieldTypes(programId, patch.fields, 'fields');
  if (patch.locations !== undefined && !Array.isArray(patch.locations)) {
    fail(`${programId}: locations must be an array`);
  }
  if (patch.accepted_insurance !== undefined && typeof patch.accepted_insurance !== 'object') {
    fail(`${programId}: accepted_insurance must be an object`);
  }

  const ver = patch.verification;
  if (ver !== undefined) {
    if (typeof ver !== 'object' || ver === null) {
      fail(`${programId}: verification must be an object`);
    } else {
      if (!ver.status || !VALID_VERIFICATION_STATUSES.includes(ver.status)) {
        fail(
          `${programId}: verification.status must be one of ` +
            `${VALID_VERIFICATION_STATUSES.join(', ')}, got: ${ver.status}`,
        );
      }
      if (ver.source_urls !== undefined && !Array.isArray(ver.source_urls)) {
        fail(`${programId}: verification.source_urls must be an array of URL strings`);
      }
      if (Array.isArray(ver.source_urls)) {
        ver.source_urls.forEach((u, i) => {
          if (typeof u !== 'string' || !/^https?:\/\//.test(u)) {
            fail(`${programId}: verification.source_urls[${i}] must be an http(s) URL`);
          }
        });
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`\n✗ Patchfile rejected — ${errors.length} problem(s), nothing written:\n`);
  errors.forEach((e) => console.error(`  • ${e}`));
  process.exit(1);
}

const AUDITED_AT = new Date().toISOString();

/**
 * Verification block builder — the `v()` pattern from
 * apply-internet-verification-may2026.js, generalized.
 */
function buildVerification(existing, ver, stampVerified) {
  return {
    ...(existing || {}),
    // Kept in step with last_verified: a patch that does not claim a
    // re-verification must not advance either date.
    last_verified_at: stampVerified ? VERIFIED_ON : existing?.last_verified_at || null,
    source_urls: ver.source_urls || existing?.source_urls || [],
    status: ver.status,
    notes: ver.notes || '',
    audited_at: AUDITED_AT,
    signals: ver.signals || {},
    // A held record from a previous crawl is resolved by a human patch.
    hold_reason: undefined,
    last_attempted_at: undefined,
  };
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function applyPatch(program, patch) {
  const merged = { ...program, ...(patch.fields || {}) };

  // Advancing last_verified is what families see (render.js derives freshness
  // from it), so it is opt-out per patch: a patch that only corrects a typo
  // should not claim the program was re-verified.
  const stampVerified = patch.stamp_verified !== false;

  if (patch.locations) merged.locations = patch.locations;

  if (patch.accepted_insurance) {
    merged.accepted_insurance = {
      ...(program.accepted_insurance || {}),
      ...patch.accepted_insurance,
      last_verified:
        patch.accepted_insurance.last_verified ||
        (stampVerified ? VERIFIED_ON : program.accepted_insurance?.last_verified) ||
        VERIFIED_ON,
    };
  }

  if (patch.verification) {
    merged.verification = stripUndefined(
      buildVerification(program.verification, patch.verification, stampVerified),
    );
  }

  if (stampVerified) {
    merged.last_verified = VERIFIED_ON;
  }

  return merged;
}

const changedSummary = [];

for (const rel of DATA_FILES) {
  const path = join(rootDir, rel);
  if (!existsSync(path)) {
    console.warn(`Warning: ${rel} not found, skipping`);
    continue;
  }
  const fileData = JSON.parse(readFileSync(path, 'utf8'));
  let applied = 0;

  fileData.programs = fileData.programs.map((p) => {
    const patch = patches[p.program_id];
    if (!patch) return p;
    applied += 1;
    const next = applyPatch(p, patch);
    if (rel === DATA_FILES[0]) {
      const touched = new Set([
        ...Object.keys(patch.fields || {}),
        ...(patch.locations ? ['locations'] : []),
        ...(patch.accepted_insurance ? ['accepted_insurance'] : []),
        ...(patch.verification ? ['verification'] : []),
        ...(patch.stamp_verified !== false ? ['last_verified'] : []),
      ]);
      changedSummary.push({ program_id: p.program_id, fields: [...touched] });
    }
    return next;
  });

  if (rel === DATA_FILES[0]) {
    fileData.metadata = {
      ...fileData.metadata,
      last_patch_applied: VERIFIED_ON,
      last_patch_run_id: patchfile.run_id || null,
      last_patch_notes:
        patchfile.notes || `Patch batch applied ${VERIFIED_ON} from ${patchArg}.`,
      last_patch_programs: applied,
    };
  }

  if (!DRY_RUN) {
    writeFileSync(path, `${JSON.stringify(fileData, null, 2)}\n`, 'utf8');
    console.log(`${rel}: patched ${applied} program(s)`);
  } else {
    console.log(`${rel}: would patch ${applied} program(s)`);
  }
}

if (patchfile.changelog && !DRY_RUN) {
  const changelog = JSON.parse(readFileSync(CHANGELOG_PATH, 'utf8'));
  changelog.events = [
    {
      date: VERIFIED_ON,
      scope: patchfile.changelog.scope || 'patch',
      programs_reviewed_count: programIds.length,
      source: patchfile.changelog.source || patchfile.source || 'Manual patch',
      notes: patchfile.changelog.notes || patchfile.notes || '',
      source_run_id: patchfile.run_id || null,
    },
    ...changelog.events,
  ];
  changelog.metadata = { ...changelog.metadata, last_updated: VERIFIED_ON };
  writeFileSync(CHANGELOG_PATH, `${JSON.stringify(changelog, null, 2)}\n`, 'utf8');
  console.log('public/data/verification_changelog.json: event prepended');
} else if (patchfile.changelog) {
  console.log('public/data/verification_changelog.json: would prepend 1 event');
}

console.log(`\n${DRY_RUN ? 'Would apply' : 'Applied'} ${programIds.length} patch(es):`);
for (const c of changedSummary) {
  console.log(`  ${c.program_id}: ${c.fields.join(', ')}`);
}

if (DRY_RUN) {
  console.log('\n(dry run — no files modified)');
} else {
  console.log('\nNext: npm run sync-regional-data && npm run validate-data && npm run validate-filters');
}
