#!/usr/bin/env node
/**
 * Apply verified URL corrections across program data files.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const LAST_VERIFIED = '2026-05-17';

const REPLACEMENTS = [
  {
    from: 'https://www.childrens.com/patient-resources/billing-and-insurance',
    to: 'https://www.childrens.com/patient-families/billing-and-insurance',
  },
  {
    from: 'https://basepointacademy.com/insurance-coverage/',
    to: 'https://basepointacademy.com/insurance/',
  },
  {
    from: 'https://www.bricolagebh.com/',
    to: 'https://www.bricolagewellness.com/',
  },
  {
    from: 'https://www.bricolagebh.com/patient-information/insurances-accepted',
    to: 'https://www.bricolagewellness.com/',
  },
  {
    from: 'https://www.imagineprograms.net',
    to: 'https://imagineprograms.net',
  },
  {
    from: 'https://www.sundownranchinc.org',
    to: 'https://www.sundownranchinc.com',
  },
];

const DOMAIN_REPLACEMENTS = [
  { from: 'bricolagebh.com', to: 'bricolagewellness.com' },
  { from: 'imagineprograms.net', to: 'imagineprograms.net' }, // www stripped in URLs
  { from: 'sundownranchinc.org', to: 'sundownranchinc.com' },
];

function replaceInString(value) {
  if (typeof value !== 'string') return value;
  let out = value;
  const ordered = [...REPLACEMENTS].sort((a, b) => b.from.length - a.from.length);
  for (const { from, to } of ordered) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  for (const { from, to } of DOMAIN_REPLACEMENTS) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

function walkAndReplace(obj, touched) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    const next = replaceInString(obj);
    if (next !== obj) touched.add('string');
    return next;
  }
  if (Array.isArray(obj)) return obj.map((item) => walkAndReplace(item, touched));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = walkAndReplace(v, touched);
    }
    return out;
  }
  return obj;
}

function patchProgram(program) {
  const ids = new Set([
    'php-childrens-health-dallas',
    'iop-childrens-sparc-dallas',
    'php-basepoint-mckinney',
    'php-basepoint-frisco',
    'php-basepoint-forney',
    'php-virtual-basepoint',
    'iop-basepoint-mckinney',
    'iop-basepoint-frisco',
    'iop-virtual-basepoint',
    'iop-basepoint-forney',
    'iop-basepoint-arlington',
    'php-bricolage-flower-mound',
    'iop-bricolage-flower-mound',
    'substance-use-imagine-programs-plano',
    'substance-use-sundown-ranch-canton',
  ]);

  const touched = new Set();
  const updated = walkAndReplace(program, touched);
  if (ids.has(program.program_id) && touched.size > 0) {
    updated.last_verified = LAST_VERIFIED;
    if (updated.accepted_insurance && typeof updated.accepted_insurance === 'object') {
      updated.accepted_insurance.last_verified = LAST_VERIFIED;
    }
  }
  return updated;
}

const files = [
  'public/data/programs.json',
  'public/data/programs.geocoded.json',
  'public/data/regions/dfw.details.json',
];

for (const rel of files) {
  const path = join(rootDir, rel);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  let count = 0;
  data.programs = data.programs.map((p) => {
    const before = JSON.stringify(p);
    const next = patchProgram(p);
    if (before !== JSON.stringify(next)) count += 1;
    return next;
  });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`${rel}: updated ${count} program record(s)`);
}

console.log('Link fixes applied.');
