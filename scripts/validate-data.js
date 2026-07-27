#!/usr/bin/env node
/**
 * Data Validation Script
 * Blocking validator for programs.json
 * Enforces data integrity, required fields, and schema compliance
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Import shared validation schema
let VALID_SERVICE_DOMAINS, REQUIRED_FIELDS, validateISODate, REVERIFICATION_THRESHOLD_DAYS;
try {
  const schemaPath = join(rootDir, 'src', 'js', 'config', 'validation-schema.js');
  if (existsSync(schemaPath)) {
    const schemaModule = await import(pathToFileURL(schemaPath).href);
    VALID_SERVICE_DOMAINS = schemaModule.VALID_SERVICE_DOMAINS;
    REQUIRED_FIELDS = schemaModule.PROGRAM_SCHEMA.required;
    validateISODate = schemaModule.validateISODate;
    REVERIFICATION_THRESHOLD_DAYS = schemaModule.REVERIFICATION_THRESHOLD_DAYS;
  } else {
    throw new Error('Schema file not found');
  }
} catch (e) {
  // Fallback to inline definitions if schema file not available
  VALID_SERVICE_DOMAINS = [
    'mental_health',
    'substance_use',
    'co_occurring',
    'eating_disorders',
  ];
  REQUIRED_FIELDS = ['program_id', 'organization', 'program_name', 'level_of_care', 'service_domains'];
  validateISODate = function(dateString) {
    if (!dateString || typeof dateString !== 'string') return false;
    const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
    if (!ISO_DATE_REGEX.test(dateString)) return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && (dateString === date.toISOString().split('T')[0] || dateString === date.toISOString());
  };
  REVERIFICATION_THRESHOLD_DAYS = 90;
}

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
    if (program.service_domains.length === 0) {
      error(`service_domains is empty array (must contain at least one domain)`, programId);
    }
    program.service_domains.forEach((domain, idx) => {
      if (!VALID_SERVICE_DOMAINS.includes(domain)) {
        error(
          `service_domains[${idx}]="${domain}" is not in allowlist. Valid values: ${VALID_SERVICE_DOMAINS.join(', ')}`,
          programId,
        );
      }
    });
  }
  
  // Validate ISO date format for last_verified
  if (program.last_verified) {
    if (!validateISODate(program.last_verified)) {
      error(`last_verified date format is invalid (expected ISO 8601): ${program.last_verified}`, programId);
    }
  }
  
  // Validate ISO date format for verification.last_verified_at
  if (program.verification && program.verification.last_verified_at) {
    if (!validateISODate(program.verification.last_verified_at)) {
      error(`verification.last_verified_at date format is invalid (expected ISO 8601): ${program.verification.last_verified_at}`, programId);
    }
  }

  if (program.verification && program.verification.status) {
    const validStatuses = [
      'verified',
      'partially_verified',
      'unable_to_verify',
      'conflicting_information',
    ];
    if (!validStatuses.includes(program.verification.status)) {
      error(
        `verification.status must be one of: ${validStatuses.join(', ')}`,
        programId,
      );
    }
  }

  if (program.verification && program.verification.source_urls) {
    if (!Array.isArray(program.verification.source_urls)) {
      error(`verification.source_urls must be an array`, programId);
    }
  }

  // Validate Phase 9B optional enum fields
  const yesNoVaries = ['yes', 'no', 'varies', 'unknown'];
  if (program.referral_required != null && !yesNoVaries.includes(program.referral_required)) {
    error(`referral_required must be one of: ${yesNoVaries.join(', ')}`, programId);
  }
  if (program.self_referral_accepted != null && !yesNoVaries.includes(program.self_referral_accepted)) {
    error(`self_referral_accepted must be one of: ${yesNoVaries.join(', ')}`, programId);
  }
  if (program.school_coordination != null && !yesNoVaries.includes(program.school_coordination)) {
    error(`school_coordination must be one of: ${yesNoVaries.join(', ')}`, programId);
  }
  const yesNoUnknown = ['yes', 'no', 'unknown'];
  if (program.assessment_required != null && !yesNoUnknown.includes(program.assessment_required)) {
    error(`assessment_required must be one of: ${yesNoUnknown.join(', ')}`, programId);
  }
  const contactMethods = ['website', 'phone', 'provider_attestation'];
  if (program.last_intake_confirm_method != null && !contactMethods.includes(program.last_intake_confirm_method)) {
    error(`last_intake_confirm_method must be one of: ${contactMethods.join(', ')}`, programId);
  }
  const verificationTiers = ['website_confirmed', 'phone_confirmed', 'provider_attestation', 'unconfirmed'];
  if (program.verification_tier != null && !verificationTiers.includes(program.verification_tier)) {
    error(`verification_tier must be one of: ${verificationTiers.join(', ')}`, programId);
  }
  const successContactMethods = ['phone', 'email', 'web_form', 'unknown'];
  if (program.last_successful_contact_method != null && !successContactMethods.includes(program.last_successful_contact_method)) {
    error(`last_successful_contact_method must be one of: ${successContactMethods.join(', ')}`, programId);
  }
  const familyInvolvementModels = ['expected', 'optional', 'varies', 'unknown'];
  if (program.family_involvement_model != null && !familyInvolvementModels.includes(program.family_involvement_model)) {
    error(`family_involvement_model must be one of: ${familyInvolvementModels.join(', ')}`, programId);
  }
  // Validate ISO dates for new fields
  const newDateFields = ['last_intake_confirm_at', 'waitlist_last_confirmed', 'insurance_verified_at', 'provider_attestation_at'];
  newDateFields.forEach((field) => {
    if (program[field] != null) {
      if (!validateISODate(program[field])) {
        error(`${field} date format is invalid (expected ISO 8601): ${program[field]}`, programId);
      }
    }
  });

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

  const programsPath = join(rootDir, 'public', 'data', 'programs.json');
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

function toProgramsArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.programs)) return data.programs;
  return [];
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    error(`Failed to parse ${path}: ${err.message}`);
    return null;
  }
}

function validateCrossFileParity() {
  console.log('\nValidating cross-file parity...\n');

  const canonicalPath = join(rootDir, 'public', 'data', 'programs.json');
  const geocodedPath = join(rootDir, 'public', 'data', 'programs.geocoded.json');
  const regionalPath = join(rootDir, 'public', 'data', 'regions', 'dfw.details.json');

  const canonicalData = readJson(canonicalPath);
  const geocodedData = readJson(geocodedPath);
  const regionalData = readJson(regionalPath);
  if (!canonicalData || !geocodedData || !regionalData) return;

  const canonicalPrograms = toProgramsArray(canonicalData);
  const geocodedPrograms = toProgramsArray(geocodedData);
  const regionalPrograms = toProgramsArray(regionalData);

  const canonicalIds = new Set(canonicalPrograms.map((p) => p.program_id).filter(Boolean));
  const geocodedIds = new Set(geocodedPrograms.map((p) => p.program_id).filter(Boolean));
  const regionalIds = new Set(regionalPrograms.map((p) => p.program_id).filter(Boolean));

  const missingInGeocoded = [...canonicalIds].filter((id) => !geocodedIds.has(id));
  const extraInGeocoded = [...geocodedIds].filter((id) => !canonicalIds.has(id));
  const missingInRegional = [...canonicalIds].filter((id) => !regionalIds.has(id));
  const extraInRegional = [...regionalIds].filter((id) => !canonicalIds.has(id));

  console.log(`Canonical programs.json count: ${canonicalIds.size}`);
  console.log(`Geocoded programs.geocoded.json count: ${geocodedIds.size}`);
  console.log(`Regional dfw.details.json count: ${regionalIds.size}`);
  console.log(`Missing canonical IDs in geocoded: ${missingInGeocoded.length}`);
  console.log(`Extra IDs in geocoded: ${extraInGeocoded.length}`);
  console.log(`Missing canonical IDs in regional: ${missingInRegional.length}`);
  console.log(`Extra IDs in regional: ${extraInRegional.length}`);

  if (extraInGeocoded.length > 0) {
    error(
      `programs.geocoded.json contains IDs not present in canonical programs.json: ${extraInGeocoded.join(', ')}`,
    );
  }

  if (missingInGeocoded.length > 0) {
    console.warn(
      `⚠ [GLOBAL] programs.geocoded.json is missing canonical IDs (${missingInGeocoded.length}): ${missingInGeocoded.slice(0, 25).join(', ')}`,
    );
  }

  if (missingInRegional.length > 0) {
    error(
      `dfw.details.json is missing canonical program IDs (${missingInRegional.length}): ${missingInRegional.join(', ')}. Run: node scripts/sync-regional-data.js`,
    );
  }

  if (extraInRegional.length > 0) {
    error(
      `dfw.details.json contains IDs not in programs.json: ${extraInRegional.join(', ')}. Run: node scripts/sync-regional-data.js`,
    );
  }
}

// Main execution
console.log('='.repeat(60));
console.log('Data Validation');
console.log('='.repeat(60));
console.log();

validateProgramsJson();
validateCrossFileParity();

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

