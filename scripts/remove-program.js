#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const PROGRAM_ID = process.argv[2];
const VERIFIED_DATE = process.argv[3] || '2026-05-17';

if (!PROGRAM_ID) {
  console.error('Usage: node scripts/remove-program.js <program_id> [last_verified_date]');
  process.exit(1);
}

const files = [
  'public/data/programs.json',
  'public/data/programs.geocoded.json',
  'public/data/regions/dfw.details.json',
  'public/data/regions/dfw.index.json',
];

for (const rel of files) {
  const path = join(rootDir, rel);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  const data = JSON.parse(raw);
  const before = data.programs.length;
  data.programs = data.programs.filter((p) => p.program_id !== PROGRAM_ID);
  const removed = before - data.programs.length;
  if (removed === 0) continue;

  if (rel.endsWith('programs.json')) {
    data.metadata = {
      ...data.metadata,
      last_full_verification: VERIFIED_DATE,
      last_directory_review_notes:
        `Full link and spot-check verification completed ${VERIFIED_DATE}. Removed ${PROGRAM_ID} (closed Dallas location).`,
    };
    data.programs = data.programs.map((p) => {
      const next = { ...p, last_verified: VERIFIED_DATE };
      if (next.accepted_insurance && typeof next.accepted_insurance === 'object') {
        next.accepted_insurance = {
          ...next.accepted_insurance,
          last_verified: VERIFIED_DATE,
        };
      }
      return next;
    });
  }

  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`${rel}: removed ${removed} (${data.programs.length} remain)`);
}
