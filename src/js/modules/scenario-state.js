// ========== Scenario State (Phase 9C) ==========
// Session-only storage for the discharge handoff scenario.
// No patient identifiers. No upload. Cleared when the tab closes.
// Also handles URL encode/decode for sharing a scenario category set (no PHI in the link).

(function () {
  if (typeof window === 'undefined') return;

  const SESSION_KEY = 'vmhr_handoff_scenario_v1';
  const URL_PARAM   = 'scenario';
  const SCHEMA_VER  = 1;

  // Allowed field names (allowlist — no free-text PHI fields ever accepted)
  const ALLOWED_FIELDS = new Set([
    'safety_urgency',
    'age_band',
    'care_level',
    'geography',
    'insurance_type',
    'virtual_preference',
    'transportation_concern',
    'school_coordination',
    'specialized_needs',      // array
  ]);

  // Allowed values per field (prevents injection into URL or storage)
  const ALLOWED_VALUES = {
    safety_urgency:     ['routine', 'heightened', 'crisis'],
    age_band:           ['5-9', '10-12', '13-14', '15-17', '18plus'],
    care_level:         ['php', 'iop', 'outpatient', 'residential', 'navigation', 'unsure'],
    geography:          ['dallas', 'fort_worth', 'plano', 'frisco', 'mckinney', 'arlington',
                         'garland', 'irving', 'denton', 'lewisville', 'richardson', 'carrollton',
                         'grand_prairie', 'dfw_metro', 'virtual_ok'],
    insurance_type:     ['medicaid_chip', 'commercial', 'tricare', 'self_pay', 'uninsured', 'unsure'],
    virtual_preference: ['in_person_only', 'virtual_ok', 'virtual_preferred', 'either'],
    transportation_concern: ['yes', 'no'],
    school_coordination:    ['yes', 'no'],
    specialized_needs:  ['eating_disorder', 'substance_use', 'co_occurring', 'autism_neurodiv',
                         'si_nssi', 'lgbtq_affirming', 'spanish_speaking'],
  };

  function sanitizeValue(field, value) {
    const allowed = ALLOWED_VALUES[field];
    if (!allowed) return null;
    if (Array.isArray(value)) {
      return value.filter((v) => typeof v === 'string' && allowed.includes(v));
    }
    return typeof value === 'string' && allowed.includes(value) ? value : null;
  }

  function sanitizeScenario(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const out = {};
    ALLOWED_FIELDS.forEach((field) => {
      if (raw[field] == null) return;
      const v = sanitizeValue(field, raw[field]);
      if (v == null) return;
      if (Array.isArray(v) && v.length === 0) return;
      out[field] = v;
    });
    return out;
  }

  function load() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || parsed._v !== SCHEMA_VER) return {};
      return sanitizeScenario(parsed);
    } catch (_) {
      return {};
    }
  }

  function save(scenario) {
    try {
      const sanitized = sanitizeScenario(scenario);
      sanitized._v = SCHEMA_VER;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sanitized));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clear() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Encode a scenario as a URL-safe base64 string for shareable links.
  // Only category values — never PHI.
  function encodeForUrl(scenario) {
    try {
      const sanitized = sanitizeScenario(scenario);
      delete sanitized._v;
      return btoa(JSON.stringify(sanitized)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    } catch (_) {
      return null;
    }
  }

  function decodeFromUrl(encoded) {
    try {
      const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const pad = padded.length % 4 === 0 ? '' : '===='.slice(padded.length % 4);
      return sanitizeScenario(JSON.parse(atob(padded + pad)));
    } catch (_) {
      return {};
    }
  }

  // Read scenario from URL param if present, save to session, then strip the param.
  function hydrateFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get(URL_PARAM);
      if (!encoded) return null;
      const scenario = decodeFromUrl(encoded);
      if (Object.keys(scenario).length === 0) return null;
      save(scenario);
      // Clean the URL (remove ?scenario=...) without a page reload.
      params.delete(URL_PARAM);
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
      history.replaceState(null, '', newUrl);
      return scenario;
    } catch (_) {
      return null;
    }
  }

  function buildShareUrl(scenario) {
    const encoded = encodeForUrl(scenario);
    if (!encoded) return null;
    const base = window.location.origin + window.location.pathname;
    return `${base}?${URL_PARAM}=${encoded}`;
  }

  window.VMHRScenarioState = { load, save, clear, encodeForUrl, decodeFromUrl, hydrateFromUrl, buildShareUrl, sanitizeScenario };
})();
