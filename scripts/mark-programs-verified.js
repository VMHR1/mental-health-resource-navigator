#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const VERIFIED = '2026-05-17';
const idsPath = join(rootDir, 'scripts', 'full-program-verification-report.json');

const report = JSON.parse(readFileSync(idsPath, 'utf8'));
const idSet = new Set(report.all_results.map((r) => r.program_id));

const files = [
  'public/data/programs.json',
  'public/data/programs.geocoded.json',
  'public/data/regions/dfw.details.json',
];

for (const rel of files) {
  const path = join(rootDir, rel);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  let n = 0;
  data.programs = data.programs.map((p) => {
    if (!idSet.has(p.program_id)) return p;
    n += 1;
    const next = { ...p, last_verified: VERIFIED };
    if (next.accepted_insurance && typeof next.accepted_insurance === 'object') {
      next.accepted_insurance = { ...next.accepted_insurance, last_verified: VERIFIED };
    }
    return next;
  });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`${rel}: marked ${n} programs verified ${VERIFIED}`);
}

console.log('\nRun: npm run sync-regional-data');
