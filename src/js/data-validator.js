// ========== Data Validator ==========
// Comprehensive data validation for programs.json
//
// The schema lives in js/config/validation-schema.js and is imported directly.
// This file used to read window.PROGRAM_SCHEMA with an inline fallback, but
// validation-schema.js is loaded by no HTML page (grep "validation-schema"
// across src/html/), so the window value was always undefined and the "fallback"
// was the only schema that ever ran. It had drifted: it predated every Phase 9B
// intake field and validated verification.sources, a key the data does not have
// (records carry verification.source_urls — see public/data/programs.json).
import {
  PROGRAM_SCHEMA,
  VALID_SERVICE_DOMAINS,
  VALID_VERIFICATION_STATUSES,
  REVERIFICATION_THRESHOLD_DAYS,
  validateISODate,
} from './config/validation-schema.js?v=1';

function validateProgramSchema(program, index) {
  const errors = [];
  const warnings = [];
  
  // Check required fields
  PROGRAM_SCHEMA.required.forEach(field => {
    if (!program[field] || (typeof program[field] === 'string' && program[field].trim() === '')) {
      errors.push(`Missing required field: ${field}`);
    }
  });
  
  // Validate field types
  Object.keys(PROGRAM_SCHEMA.types).forEach(field => {
    if (program[field] !== undefined && program[field] !== null) {
      const expectedType = PROGRAM_SCHEMA.types[field];
      const actualType = Array.isArray(program[field]) ? 'array' : typeof program[field];
      
      if (expectedType === 'array' && !Array.isArray(program[field])) {
        errors.push(`Field ${field} should be an array, got ${actualType}`);
      } else if (expectedType !== 'array' && actualType !== expectedType) {
        errors.push(`Field ${field} should be ${expectedType}, got ${actualType}`);
      }
    }
  });
  
  // Validate program_id format
  if (program.program_id && !/^[a-z0-9_-]+$/.test(program.program_id)) {
    errors.push(`Invalid program_id format: ${program.program_id} (should be lowercase alphanumeric with hyphens/underscores)`);
  }
  
  // Validate locations array structure
  // Allow blank/empty address for Virtual programs and Crisis/MCOT programs
  if (program.locations && Array.isArray(program.locations)) {
    program.locations.forEach((loc, locIdx) => {
      if (typeof loc !== 'object' || loc === null) {
        errors.push(`Location ${locIdx} is not an object`);
      } else {
        if (loc.city && typeof loc.city !== 'string') {
          errors.push(`Location ${locIdx} city should be a string`);
        }
        if (loc.state && typeof loc.state !== 'string') {
          errors.push(`Location ${locIdx} state should be a string`);
        }
        // Address can be blank for Virtual programs or Crisis services
        const isVirtual = safeStr(program.service_setting).toLowerCase().includes('virtual') || 
                         safeStr(loc.city).toLowerCase() === 'virtual';
        const isCrisis = safeStr(program.entry_type).toLowerCase().includes('crisis') ||
                        safeStr(program.level_of_care).toLowerCase().includes('crisis');
        if (!isVirtual && !isCrisis && loc.address !== undefined && loc.address !== null && safeStr(loc.address) === '') {
          warnings.push(`Location ${locIdx} has empty address (may be valid for Virtual/Crisis programs)`);
        }
      }
    });
  }
  
  // Validate accepted_insurance structure
  if (program.accepted_insurance && typeof program.accepted_insurance === 'object') {
    const ins = program.accepted_insurance;
    if (ins.types && !Array.isArray(ins.types)) {
      errors.push('accepted_insurance.types should be an array');
    }
    if (ins.plans && !Array.isArray(ins.plans)) {
      errors.push('accepted_insurance.plans should be an array');
    }
  }
  
  // Validate new statewide-ready fields (all optional, so only validate if present)
  if (program.service_area && typeof program.service_area === 'object') {
    const sa = program.service_area;
    const validTypes = ['point', 'counties', 'statewide', 'multi_region'];
    if (sa.type && !validTypes.includes(sa.type)) {
      errors.push(`service_area.type should be one of: ${validTypes.join(', ')}`);
    }
    if (sa.counties && !Array.isArray(sa.counties)) {
      errors.push('service_area.counties should be an array');
    }
    if (sa.regions && !Array.isArray(sa.regions)) {
      errors.push('service_area.regions should be an array');
    }
  }
  
  if (program.geo && typeof program.geo === 'object') {
    const geo = program.geo;
    if (geo.lat !== undefined && (typeof geo.lat !== 'number' || isNaN(geo.lat))) {
      errors.push('geo.lat should be a number');
    }
    if (geo.lng !== undefined && (typeof geo.lng !== 'number' || isNaN(geo.lng))) {
      errors.push('geo.lng should be a number');
    }
    if (geo.precision && !['rooftop', 'street', 'zip', 'city'].includes(geo.precision)) {
      errors.push('geo.precision should be one of: rooftop, street, zip, city');
    }
  }
  
  if (program.verification && typeof program.verification === 'object') {
    const ver = program.verification;
    if (ver.last_verified_at) {
      if (typeof ver.last_verified_at !== 'string') {
        errors.push('verification.last_verified_at should be a string (ISO date)');
      } else if (!validateISODate(ver.last_verified_at)) {
        errors.push(`verification.last_verified_at should be a valid ISO 8601 date, got: ${ver.last_verified_at}`);
      }
    }
    // Records write verification.source_urls: an array of URL strings
    // (scripts/audit-program-data.js). The old check looked for a
    // verification.sources array of {name, type} objects, which no record has
    // ever carried, so it could never fire.
    if (ver.source_urls !== undefined && !Array.isArray(ver.source_urls)) {
      errors.push('verification.source_urls should be an array');
    } else if (Array.isArray(ver.source_urls)) {
      ver.source_urls.forEach((src, idx) => {
        if (typeof src !== 'string' || src.trim() === '') {
          errors.push(`verification.source_urls[${idx}] should be a non-empty URL string`);
        }
      });
    }
    if (ver.status !== undefined && !VALID_VERIFICATION_STATUSES.includes(ver.status)) {
      errors.push(
        `verification.status="${ver.status}" is not in allowlist. Valid values: ${VALID_VERIFICATION_STATUSES.join(', ')}`,
      );
    }
  }
  
  // Validate service_domains (required field)
  if (!program.service_domains) {
    errors.push('Missing required field: service_domains');
  } else if (!Array.isArray(program.service_domains)) {
    errors.push('service_domains must be an array');
  } else {
    if (program.service_domains.length === 0) {
      errors.push('service_domains is empty array (must contain at least one domain)');
    }
    program.service_domains.forEach((domain, idx) => {
      if (!VALID_SERVICE_DOMAINS.includes(domain)) {
        errors.push(`service_domains[${idx}]="${domain}" is not in allowlist. Valid values: ${VALID_SERVICE_DOMAINS.join(', ')}`);
      }
    });
  }
  
  if (program.sud_services && !Array.isArray(program.sud_services)) {
    errors.push('sud_services should be an array');
  }
  
  // Validate URLs
  if (program.website_url && typeof window !== 'undefined' && typeof window.validateUrl === 'function') {
    if (!window.validateUrl(program.website_url)) {
      errors.push(`Invalid website_url: ${program.website_url}`);
    }
  }
  
  // Check data freshness (warnings) - validate ISO date format
  if (program.last_verified) {
    if (!validateISODate(program.last_verified)) {
      warnings.push(`last_verified date format may be invalid (expected ISO 8601): ${program.last_verified}`);
    } else {
      const verifiedDate = new Date(program.last_verified);
      const now = new Date();
      const daysSince = (now - verifiedDate) / (1000 * 60 * 60 * 24);
      
      if (daysSince > REVERIFICATION_THRESHOLD_DAYS) {
        warnings.push(`Program verified ${Math.floor(daysSince)} days ago (over ${REVERIFICATION_THRESHOLD_DAYS} days)`);
      }
    }
  } else {
    warnings.push('Missing last_verified date');
  }
  
  // Also check verification.last_verified_at if present
  if (program.verification && program.verification.last_verified_at) {
    if (!validateISODate(program.verification.last_verified_at)) {
      warnings.push(`verification.last_verified_at date format may be invalid (expected ISO 8601): ${program.verification.last_verified_at}`);
    } else {
      const verifiedDate = new Date(program.verification.last_verified_at);
      const now = new Date();
      const daysSince = (now - verifiedDate) / (1000 * 60 * 60 * 24);
      
      if (daysSince > REVERIFICATION_THRESHOLD_DAYS) {
        warnings.push(`Program verified ${Math.floor(daysSince)} days ago (over ${REVERIFICATION_THRESHOLD_DAYS} days) in verification.last_verified_at`);
      }
    }
  }
  
  // Check for common data quality issues
  // Allow shortcodes (3-6 digits) for crisis resources
  if (program.phone) {
    const phoneStr = safeStr(program.phone);
    const isCrisis = safeStr(program.entry_type).toLowerCase().includes('crisis') ||
                    safeStr(program.level_of_care).toLowerCase().includes('crisis');
    const digits = phoneStr.replace(/[^\d]/g, '');
    const isShortcode = digits.length >= 3 && digits.length <= 6;
    
    if (!/[\d()-\s+text]/i.test(phoneStr)) {
      warnings.push('Phone number format may be invalid');
    } else if (!isCrisis && !isShortcode && digits.length < 10) {
      warnings.push('Phone number appears to be too short (may be valid for crisis shortcodes)');
    }
  }
  
  // Validate verification_source_url if present
  if (program.verification_source_url) {
    const url = safeStr(program.verification_source_url);
    if (url && typeof window !== 'undefined' && typeof window.validateUrl === 'function') {
      if (!window.validateUrl(url)) {
        errors.push(`Invalid verification_source_url: ${url}`);
      }
    } else if (url) {
      try {
        const parsed = new URL(url, window?.location?.href || 'https://example.com');
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          errors.push(`verification_source_url must be http or https, got: ${parsed.protocol}`);
        }
      } catch (e) {
        errors.push(`Invalid verification_source_url format: ${url}`);
      }
    }
  }
  
  if (program.ages_served && program.ages_served.toLowerCase().includes('unknown')) {
    warnings.push('Ages served is marked as unknown');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    programId: program.program_id,
    index
  };
}

function validateProgramsData(data) {
  const results = {
    valid: true,
    totalPrograms: 0,
    validPrograms: 0,
    invalidPrograms: [],
    warnings: [],
    duplicates: [],
    missingFields: {},
    stalePrograms: []
  };
  
  if (!data || !data.programs || !Array.isArray(data.programs)) {
    return {
      valid: false,
      error: 'Invalid data structure: missing programs array'
    };
  }
  
  results.totalPrograms = data.programs.length;
  const programKeys = new Map(); // Track duplicates: key -> [indices]
  
  data.programs.forEach((program, index) => {
    // Validate schema
    const validation = validateProgramSchema(program, index);
    
    if (!validation.valid) {
      results.valid = false;
      results.invalidPrograms.push(validation);
    } else {
      results.validPrograms++;
    }
    
    if (validation.warnings.length > 0) {
      results.warnings.push({
        programId: validation.programId,
        index,
        warnings: validation.warnings
      });
    }
    
    // Check for stale data
    if (validation.warnings.some(w => w.includes('days ago'))) {
      results.stalePrograms.push({
        programId: validation.programId,
        index,
        lastVerified: program.last_verified
      });
    }
    
    // Track duplicates (same org + location + care level)
    if (program.organization && program.level_of_care) {
      const location = program.locations && program.locations[0] 
        ? `${program.locations[0].city || ''}, ${program.locations[0].state || ''}`
        : 'unknown';
      const key = `${program.organization.toLowerCase()}|${location.toLowerCase()}|${program.level_of_care.toLowerCase()}`;
      
      if (!programKeys.has(key)) {
        programKeys.set(key, []);
      }
      programKeys.get(key).push({ index, programId: program.program_id });
    }
    
    // Track missing required fields
    PROGRAM_SCHEMA.required.forEach(field => {
      if (!program[field] || (typeof program[field] === 'string' && program[field].trim() === '')) {
        if (!results.missingFields[field]) {
          results.missingFields[field] = [];
        }
        results.missingFields[field].push({
          index,
          programId: program.program_id
        });
      }
    });
  });
  
  // Find duplicates
  programKeys.forEach((indices, key) => {
    if (indices.length > 1) {
      results.duplicates.push({
        key,
        programs: indices
      });
    }
  });
  
  return results;
}

function checkDataFreshness(programs, thresholdDays = 90) {
  const now = new Date();
  const stale = [];
  const missing = [];
  
  programs.forEach((program, index) => {
    if (!program.last_verified) {
      missing.push({ index, programId: program.program_id });
    } else {
      const verifiedDate = new Date(program.last_verified);
      const daysSince = (now - verifiedDate) / (1000 * 60 * 60 * 24);
      
      if (daysSince > thresholdDays) {
        stale.push({
          index,
          programId: program.program_id,
          daysSince: Math.floor(daysSince),
          lastVerified: program.last_verified
        });
      }
    }
  });
  
  return { stale, missing, thresholdDays };
}

function normalizeCityName(city) {
  if (!city || typeof city !== 'string') return city;
  
  // Common normalizations
  const normalizations = {
    'desoto': 'De Soto',
    'de soto': 'De Soto',
    'fort worth': 'Fort Worth',
    'flower mound': 'Flower Mound',
    'the colony': 'The Colony',
    'grand prairie': 'Grand Prairie'
  };
  
  const lower = city.toLowerCase().trim();
  if (normalizations[lower]) {
    return normalizations[lower];
  }
  
  // Capitalize words
  return city.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  
  // Remove all non-digits except + at start
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Format US numbers: (XXX) XXX-XXXX
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7)}`;
  }
  
  return phone; // Return original if can't normalize
}

export {
  validateProgramSchema,
  validateProgramsData,
  checkDataFreshness,
  normalizeCityName,
  normalizePhoneNumber,
};

// For classic-script (non-module) consumers not yet converted
if (typeof window !== 'undefined') {
  window.validateProgramSchema = validateProgramSchema;
  window.validateProgramsData = validateProgramsData;
  window.checkDataFreshness = checkDataFreshness;
  window.normalizeCityName = normalizeCityName;
  window.normalizePhoneNumber = normalizePhoneNumber;
}



