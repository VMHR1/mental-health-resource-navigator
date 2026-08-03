// ========== Shared Validation Schema ==========
// Source of truth for program validation rules used by both browser and build validators

export const PROGRAM_SCHEMA = {
  required: ['program_id', 'organization', 'program_name', 'level_of_care', 'service_domains'],
  optional: [
    'entry_type', 'service_setting', 'ages_served', 'locations', 'phone',
    'website_url', 'website', 'website_domain', 'notes', 'transportation_available',
    'insurance_notes', 'verification_source', 'verification_source_url', 'last_verified', 'accepting_new_patients',
    'waitlist_status', 'accepted_insurance',
    // New statewide-ready fields (all optional for backward compatibility)
    'primary_county', 'service_area', 'geo', 'verification', 'sud_services',
    // Phase 9B: discharge-handoff fields (all optional, additive, never inferred)
    'intake_phone',            // labeled intake/admissions line — top backfill priority
    'phone_labels',            // object: { main, intake, admissions, crisis, billing, fax }
    'crisis_phone',            // separate crisis line when program publishes one
    'intake_hours',            // when intake is reachable (string or structured)
    'last_intake_confirm_method', // enum: website | phone | provider_attestation
    'last_intake_confirm_at',  // ISO date of last intake-details confirmation
    'referral_required',       // enum: yes | no | varies | unknown
    'self_referral_accepted',  // enum: yes | no | varies | unknown
    'assessment_required',     // enum: yes | no | unknown
    'waitlist_last_confirmed', // ISO date — provenance-gated like last_verified
    'medicaid_plans',          // array of TX Medicaid managed-care plan names
    'sliding_scale_available', // bool
    'self_pay_available',      // bool
    'insurance_verified_at',   // ISO date per-record insurance verification
    'transportation_notes',    // provider-supplied free text only
    'virtual_available',       // explicit bool (derived from setting/notes today)
    'virtual_availability_notes', // string e.g. "virtual statewide" or "follow-up only"
    'school_coordination',     // enum: yes | no | varies | unknown
    'family_involvement_model',// enum: expected | optional | varies | unknown
    'parent_program_offered',  // bool
    'step_down_friendly',      // bool — stated by program
    'step_up_friendly',        // bool — stated by program
    'discharge_friendly_notes',// provider-supplied string
    'verification_tier',       // enum: website_confirmed | phone_confirmed | provider_attestation | unconfirmed
    'last_successful_contact_method', // enum: phone | email | web_form | unknown
    'provider_attestation_at', // ISO date
    'provider_attestation_email_domain', // domain only — never a person's address
    // Operations metadata — not user-facing, never rendered.
    'verification_wave',       // rolling re-verification slot (see scripts/assign-verification-waves.js)
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
    verification_source_url: 'string',
    last_verified: 'string',
    accepting_new_patients: 'string',
    waitlist_status: 'string',
    accepted_insurance: 'object',
    // New statewide-ready field types (all optional, backward compatible)
    primary_county: 'string',
    service_area: 'object',
    geo: 'object',
    verification: 'object',
    service_domains: 'array',
    sud_services: 'array',
    // Phase 9B field types
    intake_phone: 'string',
    phone_labels: 'object',
    crisis_phone: 'string',
    intake_hours: 'string',
    last_intake_confirm_method: 'string',
    last_intake_confirm_at: 'string',
    referral_required: 'string',
    self_referral_accepted: 'string',
    assessment_required: 'string',
    waitlist_last_confirmed: 'string',
    medicaid_plans: 'array',
    sliding_scale_available: 'boolean',
    self_pay_available: 'boolean',
    insurance_verified_at: 'string',
    transportation_notes: 'string',
    virtual_available: 'boolean',
    virtual_availability_notes: 'string',
    school_coordination: 'string',
    family_involvement_model: 'string',
    parent_program_offered: 'boolean',
    step_down_friendly: 'boolean',
    step_up_friendly: 'boolean',
    discharge_friendly_notes: 'string',
    verification_tier: 'string',
    last_successful_contact_method: 'string',
    provider_attestation_at: 'string',
    provider_attestation_email_domain: 'string',
    verification_wave: 'number',
  }
};

export const VALID_SERVICE_DOMAINS = [
  'mental_health',
  'substance_use',
  'co_occurring',
  'eating_disorders',
];

export const VALID_LEVELS_OF_CARE = [
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

// verification.status values written by scripts/audit-program-data.js.
// Pro-gated surfaces only — families never see this field (see CLAUDE.md).
export const VALID_VERIFICATION_STATUSES = [
  'verified',
  'partially_verified',
  'unable_to_verify',
  'conflicting_information',
];

export const REVERIFICATION_THRESHOLD_DAYS = 90;

// ISO 8601 date validation regex (YYYY-MM-DD or full ISO format)
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;

export function validateISODate(dateString) {
  if (!dateString || typeof dateString !== 'string') return false;
  if (!ISO_DATE_REGEX.test(dateString)) return false;
  
  const date = new Date(dateString);
  return !isNaN(date.getTime())
    && (dateString === date.toISOString().split('T')[0] || dateString === date.toISOString());
}

// Export for both browser and Node.js
if (typeof window !== 'undefined') {
  window.PROGRAM_SCHEMA = PROGRAM_SCHEMA;
  window.VALID_SERVICE_DOMAINS = VALID_SERVICE_DOMAINS;
  window.VALID_LEVELS_OF_CARE = VALID_LEVELS_OF_CARE;
  window.VALID_VERIFICATION_STATUSES = VALID_VERIFICATION_STATUSES;
  window.REVERIFICATION_THRESHOLD_DAYS = REVERIFICATION_THRESHOLD_DAYS;
  window.validateISODate = validateISODate;
}

// No CommonJS block here on purpose. Node-side consumers (scripts/validate-data.js,
// scripts/apply-patches.js) load this file with `await import()`, and the browser
// loads it as a real ES module through data-validator.js. A `module.exports`
// fallback would only make esbuild warn (commonjs-variable-in-esm) on every build
// for a branch nothing reaches.

