#!/usr/bin/env node
/**
 * Data Validation Script
 * Blocking validator for programs.json
 * Enforces data integrity, required fields, and schema compliance
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const VALID_SERVICE_DOMAINS = [
  'mental_health',
  'substance_use',
  'co_occurring',
  'eating_disorders',
];
const REQUIRED_FIELDS = ['program_id', 'organization', 'program_name'];

let errorCount = 0;
const errors = [];

function error(message, programId = null) {
  errorCount++;
  const prefix = programId ? `[${programId}]` : '[GLOBAL]';
  errors.push(`${prefix} ${message}`);
  console.error(`✗ ${prefix} ${message}`);
}

function validateProgram(program, index) {
  const programId = program.program_id || `[index ${index}]`;

  // Check required fields
  REQUIRED_FIELDS.forEach((field) => {
    if (!program[field] || (typeof program[field] === 'string' && program[field].trim() === '')) {
      error(`Missing required field: ${field}`, programId);
    }
  });

  // Validate program_id format
  if (program.program_id) {
    if (!/^[a-z0-9_-]+$/.test(program.program_id)) {
      error(
        `Invalid program_id format: ${program.program_id} (should be lowercase alphanumeric with hyphens/underscores)`,
        programId,
      );
    }
  }

  // Validate service_domains (required field)
  if (!program.service_domains) {
    error(`Missing required field: service_domains`, programId);
  } else if (!Array.isArray(program.service_domains)) {
    error(`service_domains must be an array`, programId);
  } else {
    program.service_domains.forEach((domain, idx) => {
      if (!VALID_SERVICE_DOMAINS.includes(domain)) {
        error(
          `service_domains[${idx}]="${domain}" is not in allowlist. Valid values: ${VALID_SERVICE_DOMAINS.join(', ')}`,
          programId,
        );
      }
    });

    if (program.service_domains.length === 0) {
      error(`service_domains is empty array (must contain at least one domain)`, programId);
    }
  }

  // Validate level_of_care matches UI enum strings where applicable
  if (program.level_of_care) {
    const validLevels = [
      'Partial Hospitalization (PHP)',
      'Intensive Outpatient (IOP)',
      'Outpatient',
      'Navigation',
      'Residential',
      'Crisis Hotline',
      'Mobile Crisis',
      'Psychiatric Triage',
      'Walk-In Crisis / Urgent',
      'Walk-In Outpatient',
    ];
    // Only validate if it's a treatment program (not crisis/navigation which may have custom values)
    if (
      program.entry_type !== 'Crisis Service' &&
      program.entry_type !== 'Navigation' &&
      !validLevels.includes(program.level_of_care)
    ) {
      // Warning only, not error, as custom levels may be valid
      console.warn(
        `⚠ [${programId}] level_of_care "${program.level_of_care}" not in standard UI enum (may be valid)`,
      );
    }
  }
}

function validateProgramsJson() {
  console.log('Validating programs.json...\n');

  const programsPath = join(rootDir, 'programs.json');
  if (!existsSync(programsPath)) {
    error(`programs.json not found at ${programsPath}`);
    return false;
  }

  let data;
  try {
    const content = readFileSync(programsPath, 'utf8');
    data = JSON.parse(content);
  } catch (err) {
    error(`Failed to parse programs.json: ${err.message}`);
    return false;
  }

  if (!data.programs || !Array.isArray(data.programs)) {
    error(`programs.json must have a 'programs' array`);
    return false;
  }

  const programs = data.programs;
  console.log(`Found ${programs.length} programs\n`);

  // Check for duplicate program_ids
  const programIds = new Set();
  programs.forEach((program, index) => {
    if (program.program_id) {
      if (programIds.has(program.program_id)) {
        error(`Duplicate program_id: ${program.program_id}`, program.program_id);
      } else {
        programIds.add(program.program_id);
      }
    }
    validateProgram(program, index);
  });

  return true;
}

// Main execution
console.log('='.repeat(60));
console.log('Data Validation');
console.log('='.repeat(60));
console.log();

validateProgramsJson();

console.log();
console.log('='.repeat(60));
console.log('Validation Summary');
console.log('='.repeat(60));
console.log(`Errors: ${errorCount}`);

if (errorCount > 0) {
  console.log('\n❌ Validation failed with errors');
  process.exit(1);
} else {
  console.log('\n✅ Validation passed');
  process.exit(0);
}

