#!/usr/bin/env node
/**
 * Sync regional DFW data files from canonical programs.json.
 * - dfw.details.json: full program records (same shape as programs.json entries)
 * - dfw.index.json: lightweight index for fast region listing
 * - Refreshes insurance/website coverage metadata on all three outputs
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const CANONICAL_PATH = join(rootDir, 'public', 'data', 'programs.json');
const GEOCODED_PATH = join(rootDir, 'public', 'data', 'programs.geocoded.json');
const DETAILS_PATH = join(rootDir, 'public', 'data', 'regions', 'dfw.details.json');
const INDEX_PATH = join(rootDir, 'public', 'data', 'regions', 'dfw.index.json');

function computeCoverageStats(programs) {
  let insurance_verified_programs = 0;
  let insurance_not_listed_programs = 0;
  let insurance_not_applicable_entries = 0;

  for (const program of programs) {
    const status = program.accepted_insurance?.status;
    if (status === 'verified_on_website') {
      insurance_verified_programs += 1;
    } else if (status === 'not_listed_on_website') {
      insurance_not_listed_programs += 1;
    } else if (status === 'not_applicable' || status === 'navigation_only') {
      insurance_not_applicable_entries += 1;
    }
  }

  const withWebsite = programs.filter((p) => Boolean(p.website_url)).length;

  return {
    insurance_verified_programs,
    insurance_not_listed_programs,
    insurance_not_applicable_entries,
    website_links_coverage: {
      with_website_url: withWebsite,
      missing_website_url: programs.length - withWebsite,
    },
  };
}

function buildRegionalMetadata(baseMetadata, programs) {
  const syncedAt = new Date().toISOString();
  const coverage = computeCoverageStats(programs);

  return {
    ...baseMetadata,
    generated_at: baseMetadata.generated_at || syncedAt.split('T')[0],
    generatedAt: syncedAt,
    regional_sync_at: syncedAt,
    regional_sync_source: 'public/data/programs.json',
    regional_program_count: programs.length,
    ...coverage,
  };
}

function buildIndexEntry(program) {
  return {
    program_id: program.program_id,
    program_name: program.program_name,
    organization: program.organization,
    level_of_care: program.level_of_care,
    locations: program.locations || [],
  };
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const canonical = JSON.parse(readFileSync(CANONICAL_PATH, 'utf8'));
if (!Array.isArray(canonical.programs)) {
  console.error('programs.json must contain a programs array');
  process.exit(1);
}

const programs = canonical.programs;
const metadata = buildRegionalMetadata(canonical.metadata || {}, programs);

const detailsPayload = { metadata, programs };
const indexPayload = {
  metadata,
  programs: programs.map(buildIndexEntry),
};

writeJson(DETAILS_PATH, detailsPayload);
writeJson(INDEX_PATH, indexPayload);

const updatedCanonical = {
  ...canonical,
  metadata: buildRegionalMetadata(canonical.metadata || {}, programs),
};
writeJson(CANONICAL_PATH, updatedCanonical);

if (existsSync(GEOCODED_PATH)) {
  const geocoded = JSON.parse(readFileSync(GEOCODED_PATH, 'utf8'));
  const geocodedPrograms = Array.isArray(geocoded.programs) ? geocoded.programs : programs;
  writeJson(GEOCODED_PATH, {
    ...geocoded,
    metadata: buildRegionalMetadata(geocoded.metadata || canonical.metadata || {}, geocodedPrograms),
  });
  console.log(`  ${GEOCODED_PATH} (metadata only)`);
}

console.log(`Synced ${programs.length} programs to regional data files.`);
console.log(`  ${DETAILS_PATH}`);
console.log(`  ${INDEX_PATH}`);
console.log(
  `Insurance: ${metadata.insurance_verified_programs} verified, ${metadata.insurance_not_listed_programs} not listed, ${metadata.insurance_not_applicable_entries} not applicable`,
);
console.log(
  `Websites: ${metadata.website_links_coverage.with_website_url}/${programs.length} with website_url`,
);
