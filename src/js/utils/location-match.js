// ========== Location / service-area matching (DFW metro) ==========

const YOUTH_DIRECTORY_SCOPE = {
  broadLocationCities: new Set([
    'multiple',
    'north texas',
    'dallas county',
    'national',
  ]),
  dfwKeywords: [
    'dallas-fort worth',
    'dallas–fort worth',
    'dallas fort worth',
    'dfw',
    'north texas',
    'metroplex',
    'surrounding communities',
  ],
};

/** Normalize city names for comparison (handles De Soto / DeSoto, casing). */
function normalizeCityKey(city) {
  return (city ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\u2013\u2014\u2212\u2015\u2010\u2011]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\bdesoto\b/g, 'de soto');
}

/** Title-case a city for display chips. */
function formatCityLabel(city) {
  const s = (city ?? '').toString().trim();
  if (!s) return '';
  if (normalizeCityKey(s) === 'de soto') return 'De Soto';
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * DFW-area city → county mapping for programs without structured service_area.
 * Counties use the same labels as primary_county / service_area.counties in data.
 */
const CITY_TO_COUNTY = {
  'dallas': 'Dallas',
  'desoto': 'Dallas',
  'de soto': 'Dallas',
  'garland': 'Dallas',
  'mesquite': 'Dallas',
  'richardson': 'Dallas',
  'irving': 'Dallas',
  'grand prairie': 'Dallas',
  'coppell': 'Dallas',
  'carrollton': 'Dallas',
  'plano': 'Collin',
  'frisco': 'Collin',
  'mckinney': 'Collin',
  'allen': 'Collin',
  'the colony': 'Denton',
  'lewisville': 'Denton',
  'flower mound': 'Denton',
  'denton': 'Denton',
  'arlington': 'Tarrant',
  'fort worth': 'Tarrant',
  'mansfield': 'Tarrant',
  'keller': 'Tarrant',
  'bedford': 'Tarrant',
  'burleson': 'Johnson',
  'cleburne': 'Johnson',
  'rockwall': 'Rockwall',
  'forney': 'Kaufman',
  'sherman': 'Grayson',
  'corsicana': 'Navarro',
  'canton': 'Van Zandt',
  'longview': 'Gregg',
};

function countyForCity(city) {
  const key = normalizeCityKey(city);
  return CITY_TO_COUNTY[key] || null;
}

function citiesMatch(searchCity, programCity, fuzzyMatch) {
  const a = normalizeCityKey(searchCity);
  const b = normalizeCityKey(programCity);
  if (!a || !b) return false;
  if (a === b) return true;
  return typeof fuzzyMatch === 'function' && fuzzyMatch(a, b, 0.8);
}

function programHasBroadServiceLocation(program, safeStr) {
  const str = safeStr || ((x) => (x ?? '').toString().trim());
  const cities = (program.locations || []).map((l) => normalizeCityKey(str(l.city)));
  return cities.some((c) => YOUTH_DIRECTORY_SCOPE.broadLocationCities.has(c));
}

function programServesDfwRegion(program, safeStr) {
  const str = safeStr || ((x) => (x ?? '').toString().trim());
  const hay = [
    program.organization,
    program.program_name,
    program.notes,
    program.insurance_notes,
  ]
    .map((v) => str(v).toLowerCase())
    .join(' ');
  return YOUTH_DIRECTORY_SCOPE.dfwKeywords.some((kw) => hay.includes(kw));
}

function programIsVirtual(program, hasVirtual) {
  if (typeof hasVirtual === 'function') return hasVirtual(program);
  const setting = (program.service_setting || '').toString().toLowerCase();
  if (setting.includes('virtual') || setting.includes('tele')) return true;
  return (program.locations || []).some(
    (l) => normalizeCityKey(l.city) === 'virtual'
  );
}

/**
 * Whether a program serves a searched city (direct city, county, service_area, virtual/broad).
 * @param {Object} program
 * @param {string|string[]} searchCities - One city or list (multi-city smart search)
 * @param {Object} options - { safeStr, fuzzyMatch, hasVirtual }
 */
function programServesLocation(program, searchCities, options = {}) {
  const {
    safeStr = (x) => (x ?? '').toString().trim(),
    fuzzyMatch = null,
    hasVirtual = null,
  } = options;

  const targets = (Array.isArray(searchCities) ? searchCities : [searchCities])
    .map((c) => safeStr(c))
    .filter(Boolean);
  if (!targets.length) return true;

  const programCities = (program.locations || []).map((l) => safeStr(l.city));

  for (const searchCity of targets) {
    // 1) Direct city on any location
    if (
      programCities.some((pc) => citiesMatch(searchCity, pc, fuzzyMatch))
    ) {
      return true;
    }

    const searchCounty = countyForCity(searchCity);

    // 2) County via service_area / primary_county / location.county
    const serviceCounties = Array.isArray(program.service_area?.counties)
      ? program.service_area.counties.map((c) => safeStr(c))
      : [];
    const locationCounties = (program.locations || [])
      .map((l) => safeStr(l.county))
      .filter(Boolean);
    const primaryCounty = safeStr(program.primary_county);
    const allCounties = [...serviceCounties, ...locationCounties];
    if (primaryCounty) allCounties.push(primaryCounty);

    if (
      searchCounty &&
      allCounties.some(
        (c) => normalizeCityKey(c) === normalizeCityKey(searchCounty)
      )
    ) {
      return true;
    }

    // 3) Program located in same county as search city (in-person site nearby)
    if (
      searchCounty &&
      programCities.some((pc) => {
        const pcCounty = countyForCity(pc);
        return pcCounty && normalizeCityKey(pcCounty) === normalizeCityKey(searchCounty);
      })
    ) {
      return true;
    }

    // 4) Broad regional / crisis coverage (Multiple, North Texas, Dallas County, National)
    if (programHasBroadServiceLocation(program, safeStr)) {
      return true;
    }

    // 5) Virtual / telehealth in this directory scope (DFW youth navigator)
    if (programIsVirtual(program, hasVirtual)) {
      return true;
    }

    // 6) Notes/org mention DFW while filtering a metro city
    if (programServesDfwRegion(program, safeStr)) {
      return true;
    }
  }

  return false;
}

export {
  normalizeCityKey,
  formatCityLabel,
  countyForCity,
  programServesLocation,
};

// For classic-script (non-module) consumers not yet converted
if (typeof window !== 'undefined') {
  window.normalizeCityKey = normalizeCityKey;
  window.formatCityLabel = formatCityLabel;
  window.countyForCity = countyForCity;
  window.programServesLocation = programServesLocation;
}
