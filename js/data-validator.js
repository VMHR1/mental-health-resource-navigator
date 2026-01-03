// ========== Data Validator ==========
// Comprehensive data validation for programs.json

const PROGRAM_SCHEMA = {
  required: ['program_id', 'organization', 'program_name', 'level_of_care'],
  optional: [
    'entry_type', 'service_setting', 'ages_served', 'locations', 'phone',
    'website_url', 'website', 'website_domain', 'notes', 'transportation_available',
    'insurance_notes', 'verification_source', 'last_verified', 'accepting_new_patients',
    'waitlist_status', 'accepted_insurance',
    // New statewide-ready fields (all optional for backward compatibility)
    'primary_county', 'service_area', 'geo', 'verification', 'service_domains', 'sud_services'
  ],
  types: {
    program_id: 'string',
    organization: 'string',
    program_name: 'string',
    level_of_care: 'string',
    entry_type: 'string',
    service_setting: 'string',
    ages_served: 'string',
    locations: 'array',
    phone: 'string',
    website_url: 'string',
    website: 'string',
    website_domain: 'string',
    notes: 'string',
    transportation_available: 'string',
    insurance_notes: 'string',
    verification_source: 'string',
    last_verified: 'string',
    accepting_new_patients: 'string',
    waitlist_status: 'string',
    accepted_insurance: 'object',
    // New field types (all optional, backward compatible)
    primary_county: 'string',
    service_area: 'object',
    geo: 'object',
    verification: 'object',
    service_domains: 'array',
    sud_services: 'array'
  }
};

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
    if (ver.last_verified_at && typeof ver.last_verified_at !== 'string') {
      errors.push('verification.last_verified_at should be a string (ISO date)');
    }
    if (ver.sources && !Array.isArray(ver.sources)) {
      errors.push('verification.sources should be an array');
    } else if (ver.sources) {
      ver.sources.forEach((src, idx) => {
        if (typeof src !== 'object' || !src.name || !src.type) {
          errors.push(`verification.sources[${idx}] should have name and type fields`);
        }
      });
    }
  }
  
  if (program.service_domains && Array.isArray(program.service_domains)) {
    const validDomains = ['mental_health', 'substance_use', 'co_occurring', 'eating_disorders'];
    program.service_domains.forEach((domain, idx) => {
      if (!validDomains.includes(domain)) {
        errors.push(`service_domains[${idx}] should be one of: ${validDomains.join(', ')}`);
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
  
  // Check data freshness (warnings)
  if (program.last_verified) {
    const verifiedDate = new Date(program.last_verified);
    const now = new Date();
    const daysSince = (now - verifiedDate) / (1000 * 60 * 60 * 24);
    
    if (daysSince > 90) {
      warnings.push(`Program verified ${Math.floor(daysSince)} days ago (over 90 days)`);
    }
  } else {
    warnings.push('Missing last_verified date');
  }
  
  // Check for common data quality issues
  if (program.phone && !/[\d()-\s+]/.test(program.phone)) {
    warnings.push('Phone number format may be invalid');
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

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.validateProgramSchema = validateProgramSchema;
  window.validateProgramsData = validateProgramsData;
  window.checkDataFreshness = checkDataFreshness;
  window.normalizeCityName = normalizeCityName;
  window.normalizePhoneNumber = normalizePhoneNumber;
}

// Note: Exports are available via window object for browser usage
// CommonJS exports removed to avoid ESM compatibility warnings



