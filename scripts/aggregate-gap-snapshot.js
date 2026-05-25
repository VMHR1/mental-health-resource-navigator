#!/usr/bin/env node
// ========== Aggregate Regional Gap Snapshot ==========
// Reads public/data/programs.json and produces public/data/regional_gap_snapshot.json
// containing counts and buckets only — no patient or query data.
//
// Optionally accepts a path to a metrics file exported via
// VMHRProductMetrics.exportMetricsJson() to fold in zero-result signatures.
//
// Usage:
//   node scripts/aggregate-gap-snapshot.js [--metrics <path>] [--period 2026-Q2] [--out <path>]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

function argFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function quarterFromDate(date) {
  const y = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function safeStr(x) {
  return (x == null ? '' : String(x)).trim();
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function hasIntakeLabel(program) {
  if (safeStr(program.intake_phone)) return true;
  if (program.phone_labels && typeof program.phone_labels === 'object') {
    const labels = Object.values(program.phone_labels).map((v) => safeStr(v).toLowerCase());
    if (labels.some((v) => v === 'intake' || v === 'admissions' || v === 'main')) return true;
  }
  const notes = safeStr(program.notes).toLowerCase();
  return /\bintake\b|\badmissions\b/.test(notes);
}

function buildSnapshot(programs, metrics, period) {
  const total = programs.length;
  let staleCount = 0;
  let missingWebsite = 0;
  let unclearInsurance = 0;
  let missingIntakeLabel = 0;
  let missingCareLevel = 0;
  let recentlyAdded = 0;
  let recentlyUpdated = 0;

  const cityCareCounts = new Map();
  const careLevels = new Set();

  programs.forEach((p) => {
    const lastVerified = safeStr(p.last_verified || (p.verification && p.verification.last_verified_at));
    const ds = daysSince(lastVerified);
    if (ds == null || ds > 90) staleCount++;
    if (ds != null && ds <= 30) recentlyUpdated++;

    if (!safeStr(p.website_url) && !safeStr(p.website)) missingWebsite++;

    const ins = p.accepted_insurance || {};
    const types = Array.isArray(ins.types) ? ins.types.filter(Boolean) : [];
    const plans = Array.isArray(ins.plans) ? ins.plans.filter(Boolean) : [];
    const insuranceStatus = safeStr(ins.status).toLowerCase();
    const insuranceNotes = safeStr(ins.notes) || safeStr(p.insurance_notes);
    if (insuranceStatus === 'not_listed' || insuranceStatus === 'contact_for_info' || insuranceStatus === 'unclear'
      || (!types.length && !plans.length && !insuranceNotes)) {
      unclearInsurance++;
    }

    if (!hasIntakeLabel(p)) missingIntakeLabel++;

    const care = safeStr(p.level_of_care);
    if (!care || /not\s*listed|unknown|tbd/i.test(care)) {
      missingCareLevel++;
    } else {
      careLevels.add(care);
    }

    const locations = Array.isArray(p.locations) ? p.locations : [];
    locations.forEach((loc) => {
      const city = safeStr(loc.city);
      if (!city || city.toLowerCase() === 'virtual' || city.toLowerCase() === 'multiple') return;
      if (!care) return;
      const key = `${city}::${care}`;
      cityCareCounts.set(key, (cityCareCounts.get(key) || 0) + 1);
    });
  });

  const THIN_COVERAGE_THRESHOLD = 2;
  const thinCoverage = [];
  for (const [key, count] of cityCareCounts.entries()) {
    if (count <= THIN_COVERAGE_THRESHOLD) {
      const [city, care_level] = key.split('::');
      thinCoverage.push({ city, care_level, program_count: count });
    }
  }
  thinCoverage.sort((a, b) => a.program_count - b.program_count || a.city.localeCompare(b.city));

  let topZeroSignatures = [];
  if (metrics && metrics.summary && Array.isArray(metrics.summary.topZeroResultSignatures)) {
    topZeroSignatures = metrics.summary.topZeroResultSignatures.slice(0, 10).map((row) => ({
      signature: row.signature,
      count: row.count,
    }));
  }

  return {
    metadata: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      period: period || quarterFromDate(new Date()),
      total_programs: total,
      methodology: 'Counts and buckets only. No raw search queries, no patient identifiers. Stale = last_verified > 90 days or missing. Thin coverage = <= 2 programs for a (city, care_level) pair.',
    },
    counts: {
      stale_program_count: staleCount,
      recently_updated_count: recentlyUpdated,
      missing_field_counts: {
        website_url: missingWebsite,
        insurance_clear: unclearInsurance,
        intake_phone_labeled: missingIntakeLabel,
        care_level: missingCareLevel,
      },
    },
    thin_coverage: thinCoverage,
    top_zero_result_signatures: topZeroSignatures,
    notes: [
      'Snapshot is intended for partner organizations (hospitals, LMHAs, coalitions).',
      'Re-run quarterly. Do not publish raw localStorage exports.',
    ],
  };
}

function main() {
  const programsPath = resolve(repoRoot, 'public/data/programs.json');
  const outPath = resolve(repoRoot, argFlag('--out', 'public/data/regional_gap_snapshot.json'));
  const metricsPath = argFlag('--metrics', '');
  const period = argFlag('--period', '');

  if (!existsSync(programsPath)) {
    console.error('Missing programs.json at', programsPath);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(programsPath, 'utf8'));
  const programs = Array.isArray(raw.programs) ? raw.programs : Array.isArray(raw) ? raw : [];

  let metrics = null;
  if (metricsPath && existsSync(metricsPath)) {
    try {
      metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
    } catch (e) {
      console.warn('Could not parse metrics file:', e.message);
    }
  }

  const snapshot = buildSnapshot(programs, metrics, period);

  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot written to ${outPath}`);
  console.log(`  Period: ${snapshot.metadata.period}`);
  console.log(`  Total programs: ${snapshot.metadata.total_programs}`);
  console.log(`  Stale: ${snapshot.counts.stale_program_count}`);
  console.log(`  Thin coverage entries: ${snapshot.thin_coverage.length}`);
}

main();
