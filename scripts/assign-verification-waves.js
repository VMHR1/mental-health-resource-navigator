#!/usr/bin/env node
/**
 * Verification wave assignment
 *
 * Every program currently carries the same last_verified date, so the whole
 * directory crosses the 90-day expiry on the same day and every card flips to
 * "stale" for families at once. This assigns each program to one of N rolling
 * waves so re-verification can be spread across the cycle instead.
 *
 * The wave is derived from a hash of program_id, so it is:
 *   - deterministic (same id always lands in the same wave, across machines)
 *   - stable (adding or removing programs does not reshuffle existing ones)
 *   - evenly distributed (no manual bucketing to maintain)
 *
 * Consumed by the scheduled freshness workflow, which re-verifies only the
 * wave that is due in the current ISO week.
 *
 * Usage:
 *   node scripts/assign-verification-waves.js [--waves N] [--dry-run]
 *
 * Writes `verification_wave` to all three data mirrors, then run:
 *   node scripts/sync-regional-data.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  if (i === -1 || i === args.length - 1) return fallback;
  const parsed = Number(args[i + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const WAVE_COUNT = argValue('--waves', 12);

if (!Number.isInteger(WAVE_COUNT) || WAVE_COUNT < 1 || WAVE_COUNT > 52) {
  console.error(`✗ --waves must be an integer between 1 and 52 (got ${WAVE_COUNT})`);
  process.exit(1);
}

// FNV-1a. Small, dependency-free, and well distributed for short ASCII keys.
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function waveForProgramId(programId, waveCount = WAVE_COUNT) {
  return hashString(String(programId)) % waveCount;
}

const MIRRORS = [
  join(rootDir, 'public', 'data', 'programs.json'),
  join(rootDir, 'public', 'data', 'programs.geocoded.json'),
  join(rootDir, 'public', 'data', 'regions', 'dfw.details.json'),
];

function programList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.programs)) return data.programs;
  return null;
}

function main() {
  const canonicalPath = MIRRORS[0];
  if (!existsSync(canonicalPath)) {
    console.error(`✗ programs.json not found at ${canonicalPath}`);
    process.exit(1);
  }

  const canonical = JSON.parse(readFileSync(canonicalPath, 'utf8'));
  const canonicalPrograms = programList(canonical);
  if (!canonicalPrograms) {
    console.error('✗ Could not read a programs array from programs.json');
    process.exit(1);
  }

  // Assign from the canonical file, then apply the same map to every mirror so
  // they cannot drift (validate-data.js hard-fails on ID drift between them).
  const assignment = new Map();
  const distribution = new Array(WAVE_COUNT).fill(0);

  for (const program of canonicalPrograms) {
    const id = program.program_id;
    if (!id) continue;
    const wave = waveForProgramId(id);
    assignment.set(id, wave);
    distribution[wave]++;
  }

  console.log('='.repeat(60));
  console.log(`Verification wave assignment (${WAVE_COUNT} waves)`);
  console.log('='.repeat(60));
  console.log(`Programs: ${assignment.size}`);
  console.log();

  const min = Math.min(...distribution);
  const max = Math.max(...distribution);
  distribution.forEach((count, wave) => {
    const bar = '█'.repeat(count);
    console.log(`  wave ${String(wave).padStart(2)}: ${String(count).padStart(3)}  ${bar}`);
  });
  console.log();
  console.log(`Spread: min ${min}, max ${max} (skew ${max - min})`);
  console.log(`At one wave per week, a full cycle takes ${WAVE_COUNT} weeks (~${Math.round(assignment.size / WAVE_COUNT)} programs/week).`);
  console.log();

  let filesWritten = 0;
  let recordsChanged = 0;

  for (const path of MIRRORS) {
    if (!existsSync(path)) {
      console.warn(`⚠ Skipping missing mirror: ${path}`);
      continue;
    }
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const programs = programList(data);
    if (!programs) {
      console.warn(`⚠ Skipping ${path} — no programs array`);
      continue;
    }

    let changed = 0;
    for (const program of programs) {
      const wave = assignment.get(program.program_id);
      if (wave === undefined) continue;
      if (program.verification_wave !== wave) {
        program.verification_wave = wave;
        changed++;
      }
    }

    if (!Array.isArray(data) && data.metadata) {
      data.metadata.verification_wave_count = WAVE_COUNT;
    }

    recordsChanged += changed;
    if (!DRY_RUN) {
      writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
      filesWritten++;
    }
    console.log(`${DRY_RUN ? 'would update' : 'updated'} ${path.replace(rootDir + '/', '')} — ${changed} record(s) changed`);
  }

  console.log();
  if (DRY_RUN) {
    console.log(`Dry run — no files written (${recordsChanged} record change(s) pending).`);
  } else {
    console.log(`✅ Wrote ${filesWritten} file(s), ${recordsChanged} record change(s).`);
    console.log('Next: node scripts/sync-regional-data.js && node scripts/validate-data.js');
  }
}

// Only run when invoked directly, so the scheduled workflow can import
// waveForProgramId() to compute the due wave without rewriting data files.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
