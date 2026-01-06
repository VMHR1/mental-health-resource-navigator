// ========== Shared Validation Schema ==========
// Source of truth for program validation rules used by both browser and build validators

const PROGRAM_SCHEMA = {
  required: ['program_id', 'organization', 'program_name', 'level_of_care', 'service_domains'],
  optional: [
    'entry_type', 'service_setting', 'ages_served', 'locations', 'phone',
    'website_url', 'website', 'website_domain', 'notes', 'transportation_available',
    'insurance_notes', 'verification_source', 'last_verified', 'accepting_new_patients',
    'waitlist_status', 'accepted_insurance',
    // New statewide-ready fields (all optional for backward compatibility)
    'primary_county', 'service_area', 'geo', 'verification', 'sud_services'
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

const VALID_SERVICE_DOMAINS = [
  'mental_health',
  'substance_use',
  'co_occurring',
  'eating_disorders',
];

const VALID_LEVELS_OF_CARE = [
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

const REVERIFICATION_THRESHOLD_DAYS = 90;

// ISO 8601 date validation regex (YYYY-MM-DD or full ISO format)
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;

function validateISODate(dateString) {
  if (!dateString || typeof dateString !== 'string') return false;
  if (!ISO_DATE_REGEX.test(dateString)) return false;
  
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && dateString === date.toISOString().split('T')[0] || dateString === date.toISOString();
}

// Export for both browser and Node.js
if (typeof window !== 'undefined') {
  window.PROGRAM_SCHEMA = PROGRAM_SCHEMA;
  window.VALID_SERVICE_DOMAINS = VALID_SERVICE_DOMAINS;
  window.VALID_LEVELS_OF_CARE = VALID_LEVELS_OF_CARE;
  window.REVERIFICATION_THRESHOLD_DAYS = REVERIFICATION_THRESHOLD_DAYS;
  window.validateISODate = validateISODate;
  window.ISO_DATE_REGEX = ISO_DATE_REGEX;
}

export {
  PROGRAM_SCHEMA,
  VALID_SERVICE_DOMAINS,
  VALID_LEVELS_OF_CARE,
  REVERIFICATION_THRESHOLD_DAYS,
  validateISODate,
  ISO_DATE_REGEX
};
