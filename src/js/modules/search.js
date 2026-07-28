// ========== Search Module ==========
// Search functionality including fuzzy matching, autocomplete, and smart parsing

import { safeStr } from '../utils/helpers.js';

// Fuzzy search utilities
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }
  return dp[m][n];
}

function fuzzyMatch(query, text, threshold = 0.7) {
  if (!query || !text) return false;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  
  if (t.includes(q)) return true;
  
  // Word-boundary aware matching for multi-word queries
  const qWords = q.split(/\s+/).filter(w => w.length > 0);
  if (qWords.length > 1) {
    // Check if all query words appear in text (with word boundaries)
    const allWordsMatch = qWords.every(qw => {
      // Try exact word match first
      const wordBoundaryRegex = new RegExp(`\\b${qw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (wordBoundaryRegex.test(t)) return true;
      // Then try substring match
      if (t.includes(qw)) return true;
      // Finally try fuzzy match for longer words
      if (qw.length > 3) {
        return fuzzyMatchSingleWord(qw, t, threshold);
      }
      return false;
    });
    if (allWordsMatch) return true;
  }
  
  if (q.length <= 3) {
    const distance = levenshteinDistance(q, t.substring(0, q.length + 2));
    return distance <= 1;
  }
  
  const maxDistance = Math.floor(q.length * (1 - threshold));
  for (let i = 0; i <= t.length - q.length; i++) {
    const substring = t.substring(i, i + q.length + maxDistance);
    const distance = levenshteinDistance(q, substring.substring(0, q.length));
    if (distance <= maxDistance) return true;
  }
  
  return false;
}

// Helper function for single word fuzzy matching
function fuzzyMatchSingleWord(query, text, threshold = 0.7) {
  if (!query || !text) return false;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  
  if (t.includes(q)) return true;
  
  if (q.length <= 3) {
    const distance = levenshteinDistance(q, t.substring(0, q.length + 2));
    return distance <= 1;
  }
  
  const maxDistance = Math.floor(q.length * (1 - threshold));
  for (let i = 0; i <= t.length - q.length; i++) {
    const substring = t.substring(i, i + q.length + maxDistance);
    const distance = levenshteinDistance(q, substring.substring(0, q.length));
    if (distance <= maxDistance) return true;
  }
  
  return false;
}

function findBestCityMatch(query, cities) {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  
  for (const city of cities) {
    if (!isPlausibleCityName(city)) continue;
    const cityLower = city.toLowerCase();
    if (cityLower === q) return city;
    const cityPattern = new RegExp(`(^|\\s)${escapeRegex(cityLower).replace(/\s+/g, '\\s*')}(\\s|$)`, 'i');
    if (cityPattern.test(q)) return city;
  }
  
  let bestMatch = null;
  let bestScore = Infinity;
  
  for (const city of cities) {
    if (!isPlausibleCityName(city)) continue;
    const cityLower = city.toLowerCase();
    const distance = levenshteinDistance(q, cityLower);
    const maxLen = Math.max(q.length, cityLower.length);
    const similarity = 1 - (distance / maxLen);
    
    if (similarity >= 0.6 && distance < bestScore) {
      bestScore = distance;
      bestMatch = city;
    }
  }
  
  return bestMatch;
}

/**
 * Map natural-language care terms to canonical level_of_care values.
 * Order matters: check PHP/IOP before generic "outpatient".
 */
function detectCareLevel(q) {
  const s = safeStr(q).toLowerCase();
  if (!s) return '';

  if (
    /\b(partial\s+hospital(?:ization)?|php\b|day\s+(?:hospital|treatment|program))\b/i.test(s)
  ) {
    return 'Partial Hospitalization (PHP)';
  }
  if (/\b(intensive\s+outpatient|\biop\b)/i.test(s)) {
    return 'Intensive Outpatient (IOP)';
  }
  if (/\b(residential|inpatient|\brtc\b)\b/i.test(s)) {
    return 'Residential';
  }
  if (/\b(outpatient)\b/i.test(s) && !/\bintensive\s+outpatient\b/i.test(s)) {
    return 'Outpatient';
  }
  if (/\b(navigation|care\s+navigation|resource\s+navigation)\b/i.test(s)) {
    return 'Navigation';
  }
  return '';
}

/** Extra search phrases per canonical plan name (beyond auto-generated aliases). */
const INSURANCE_PLAN_ALIAS_EXTRAS = {
  Aetna: ['aetna better health'],
  Ambetter: ['ambetter superior', 'ambetter from superior'],
  Anthem: ['anthem blue cross'],
  'Baylor Scott & White': ['bsw', 'baylor scott white', 'baylor scott and white'],
  'Baylor Scott & White Health Plan': [
    'bsw health plan',
    'baylor scott white health plan',
    'baylor scott and white health plan',
  ],
  Beacon: ['beacon health'],
  'Behavioral Health Systems': ['bhs', 'behavioral health system'],
  'Blue Cross Blue Shield': ['bcbs', 'blue cross', 'blue cross blue shield'],
  'Bright Healthcare': ['bright health'],
  CHIP: ['chip plan', 'childrens chip', "children's chip"],
  'Carelon Behavioral Health': ['carelon', 'carelon behavioral'],
  Champva: ['champ va', 'champ-va', 'va champ'],
  Cigna: ['evernorth', 'cigna evernorth'],
  Compsych: ['com psych'],
  'Cook Childrens Health Plan': [
    "cook children's health plan",
    'cook childrens',
    "cook children's",
  ],
  HealthNet: ['health net'],
  Humana: ['humana insurance'],
  Magellan: ['magellan health'],
  Medicaid: ['traditional medicaid plan'],
  Medicare: ['traditional medicare plan'],
  'Meritain Health': ['meritain'],
  'Molina Healthcare': ['molina', 'molina medicaid'],
  Optum: ['optum health', 'optum behavioral'],
  'Parkland Community Health Plan': [
    'parkland community',
    'parkland health plan',
    'pchp',
  ],
  Superior: ['superior mco'],
  SuperiorHealthPlan: [], // typo guard — real key below
  'Superior HealthPlan': ['superior healthplan', 'superior health plan', 'superior star'],
  TRICARE: ['tri care', 'tricare east', 'tricare west'],
  UMR: ['umr insurance'],
  UnitedHealthcare: ['uhc', 'united healthcare', 'united health care', 'united health'],
  Wellpoint: ['well point'],
};

// Remove typo guard key if added
delete INSURANCE_PLAN_ALIAS_EXTRAS.SuperiorHealthPlan;

/** Flat alias index sorted longest-first; built from program data via registerInsurancePlansFromData. */
let insurancePlanAliasFlat = [];
/** @type {Map<string, { plan: string, aliases: string[] }>} */
let insurancePlanAliasByPlan = new Map();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAliasesForPlanName(plan) {
  const aliases = new Set();
  const planLower = safeStr(plan).toLowerCase();
  if (!planLower) return [];

  aliases.add(planLower);
  aliases.add(planLower.replace(/&/g, 'and'));
  aliases.add(planLower.replace(/['']/g, ''));

  const suffixes = [
    ' health plan',
    ' healthcare',
    ' behavioral health',
    ' insurance',
    ' health',
  ];
  for (const suf of suffixes) {
    if (planLower.endsWith(suf) && planLower.length > suf.length + 2) {
      aliases.add(planLower.slice(0, -suf.length).trim());
    }
  }

  const words = plan.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const acronym = words.map((w) => w[0]).join('').toLowerCase();
    if (acronym.length >= 3 && acronym.length <= 8) {
      aliases.add(acronym);
    }
  }

  return [...aliases].filter((a) => a.length >= 2);
}

/**
 * Build search aliases from loaded programs (call after programs.json loads).
 * @param {Array} programs
 */
function registerInsurancePlansFromData(programs) {
  const planNames = new Set();
  (programs || []).forEach((p) => {
    const plans = p.accepted_insurance?.plans;
    if (Array.isArray(plans)) {
      plans.forEach((pl) => {
        const name = safeStr(pl);
        if (name) planNames.add(name);
      });
    }
  });

  const entries = [];
  const flat = [];

  for (const plan of planNames) {
    const aliasSet = new Set(buildAliasesForPlanName(plan));
    const extras = INSURANCE_PLAN_ALIAS_EXTRAS[plan] || [];
    extras.forEach((a) => aliasSet.add(safeStr(a).toLowerCase()));

    const aliases = [...aliasSet].filter((a) => a.length >= 2);
    entries.push({ plan, aliases });

    aliases.forEach((alias) => {
      flat.push({ alias, plan, len: alias.length });
    });
  }

  flat.sort((a, b) => b.len - a.len);
  insurancePlanAliasFlat = flat;
  insurancePlanAliasByPlan = new Map(entries.map((e) => [e.plan, e]));
}

function getInsurancePlanAliasEntry(planName) {
  return insurancePlanAliasByPlan.get(planName) || null;
}

function detectInsurancePlanFromQuery(q) {
  const s = safeStr(q).toLowerCase();
  if (!s || !insurancePlanAliasFlat.length) return '';

  for (const { alias, plan } of insurancePlanAliasFlat) {
    const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
    if (re.test(s)) return `plan:${plan}`;
  }
  return '';
}

function stripDetectedPlanTokens(terms, insuranceVal) {
  if (!insuranceVal.startsWith('plan:')) return terms;
  const planName = insuranceVal.replace('plan:', '');
  const entry = insurancePlanAliasByPlan.get(planName);
  let out = terms;
  const toStrip = entry
    ? [...entry.aliases, planName.toLowerCase()]
    : [planName.toLowerCase()];
  for (const token of toStrip) {
    const re = new RegExp(`\\b${escapeRegex(token)}\\b`, 'gi');
    out = out.replace(re, ' ');
  }
  return out.replace(/\b(accepts?|takes?|with)\b/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Map insurance phrases in search text to bucket:* or plan:* filter values.
 */
function detectInsuranceFromQuery(q) {
  const s = safeStr(q).toLowerCase();
  if (!s) return '';

  if (
    /\b(medicaid|chip\b|star\s*\+|star\s+health|mco\b)\b/i.test(s) ||
    /\b(accepts?|takes?|with)\s+medicaid/i.test(s) ||
    /\bmedicaid\s+(accepted|friendly)\b/i.test(s)
  ) {
    return 'bucket:medicaid';
  }
  if (/\bmedicare\b/i.test(s) || /\b(accepts?|takes?|with)\s+medicare/i.test(s)) {
    return 'bucket:medicare';
  }
  if (
    /\b(tricare|triwest|champus|military\s+insurance)\b/i.test(s) ||
    /\b(accepts?|takes?|with)\s+tricare/i.test(s)
  ) {
    return 'bucket:tricare';
  }
  if (
    /\b(self[- ]?pay|sliding\s+scale|cash\s+pay|private\s+pay)\b/i.test(s) ||
    /\bpay\s+out\s+of\s+pocket\b/i.test(s)
  ) {
    return 'bucket:self_pay';
  }
  if (
    /\b(commercial\s+insurance|private\s+insurance|most\s+major\s+insurance|accepts?\s+insurance)\b/i.test(s) ||
    /\b(employer\s+insurance|insurance\s+accepted)\b/i.test(s)
  ) {
    return 'bucket:commercial';
  }

  return detectInsurancePlanFromQuery(q);
}

/** Words that, immediately before a bare 1-2 digit number, mean it's not a child's age (e.g. "Suite 14"). */
const NON_AGE_PRECEDING_WORDS = new Set([
  'suite', 'ste', 'unit', 'apt', 'apartment', 'room', 'rm', 'floor', 'fl',
  'building', 'bldg', 'ext', 'extension', 'phone', 'tel', '#', 'no', 'number',
]);

function parseSmartSearch(query, cities) {
  const q = query.toLowerCase();
  const filters = {
    loc: '',
    locs: [],
    age: '',
    minAge: null,
    care: '',
    insurance: '',
    showCrisis: false,
    organization: '' // Store detected organization name
  };
  
  // Multi-location patterns
  const multiLocationPatterns = [
    /\b([a-z\s]+)\s+(?:or|,|and|\/)\s+([a-z\s]+)\b/i,
    /\b([a-z\s]+)\s*,\s*([a-z\s]+)\b/i
  ];
  
  let foundMultiLocation = false;
  for (const pattern of multiLocationPatterns) {
    const match = q.match(pattern);
    if (match) {
      const city1 = findBestCityMatch(match[1].trim(), cities);
      const city2 = findBestCityMatch(match[2].trim(), cities);
      if (city1 && city2) {
        filters.locs = [city1, city2];
        foundMultiLocation = true;
        break;
      }
    }
  }
  
  // Single location detection if no multi-location found
  // Use word boundaries to avoid matching city names embedded in organization names
  if (!foundMultiLocation) {
    // Check for city matches (prioritize longer matches first)
    // Only match if city appears as a standalone word or at the end
    const sortedCities = [...cities].sort((a, b) => b.length - a.length);
    for (const city of sortedCities) {
      if (!isPlausibleCityName(city)) continue;
      // Match city only if it's a complete word (word boundary) or at start/end
      const cityPattern = new RegExp(`(^|\\s)${escapeRegex(city).replace(/\s+/g, '\\s*')}(\\s|$)`, 'i');
      if (cityPattern.test(q)) {
        // Normalize city name - handle "de soto" -> "De Soto", "desoto" -> "De Soto"
        if (city === 'desoto' || city === 'de soto') {
          filters.loc = 'De Soto';
        } else {
          filters.loc = city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        break; // Use first (longest) match
      }
    }
    
    // Try fuzzy matching if no exact match
    if (!filters.loc) {
      const fuzzyMatch = findBestCityMatch(q, cities);
      if (fuzzyMatch) {
        if (fuzzyMatch === 'desoto' || fuzzyMatch === 'de soto') {
          filters.loc = 'De Soto';
        } else {
          filters.loc = fuzzyMatch.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
      }
    }
  }
  
  // Age detection - handle multiple patterns
  // Pattern 1: "13 and up" or "13+" or "13 years and up"
  // Trailing lookahead (not \b) after the alternation: \b never matches between
  // a symbol like "+" and a following space/end-of-string, which silently broke
  // the very common "13+" shorthand.
  const andUpMatch = q.match(/\b(\d{1,2})\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up|and\s*older)(?=\s|$)/i);
  if (andUpMatch) {
    filters.minAge = Number(andUpMatch[1]);
    // Set age to the minimum for filtering purposes
    filters.age = andUpMatch[1];
  } else {
    // Pattern 2: Exact age like "13 year old" or a bare number "13".
    // A bare number (no "year(s) old"/"yo" qualifier) is only treated as an age
    // if it isn't immediately preceded by an obviously non-age context word —
    // otherwise things like "Suite 14" or "Unit 12" get misread as an age filter.
    const ageMatch = q.match(/\b(\d{1,2})\s*(?:year|yr|y\.o\.|yo)?\s*(?:old)?\b/);
    if (ageMatch) {
      const hasQualifier = /year|yr|y\.o\.|yo|old/i.test(ageMatch[0]);
      const precedingWord = q.slice(0, ageMatch.index).trim().split(/\s+/).pop() || '';
      const isNonAgeContext = NON_AGE_PRECEDING_WORDS.has(precedingWord.replace(/[.:#]/g, ''));
      if (hasQualifier || !isNonAgeContext) {
        filters.age = ageMatch[1];
      }
    }
  }
  
  // Level of care detection (specific patterns before generic outpatient)
  const care = detectCareLevel(q);
  if (care) filters.care = care;
  
  // Service domain detection - eating disorders
  if(q.includes('eating disorder') || q.includes('anorexia') || q.includes('bulimia') || q.includes('binge eating')) {
    filters.serviceDomain = 'eating_disorders';
  }
  
  // Service domain detection - substance use
  if(q.includes('substance use') || q.includes('substance abuse') || q.includes('drug treatment') || q.includes('alcohol treatment') || q.includes('addiction')) {
    filters.serviceDomain = 'substance_use';
  }
  
  // Crisis detection
  if(q.includes('crisis') || q.includes('emergency') || q.includes('urgent')) {
    filters.showCrisis = true;
  }

  const insurance = detectInsuranceFromQuery(q);
  if (insurance) filters.insurance = insurance;
  
  return filters;
}

/** Words stripped after smart-parse so "IOP in Plano" does not match every program on "in". */
const SEARCH_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'at', 'for', 'to', 'of', 'on', 'near',
  'around', 'my', 'me', 'with', 'from', 'by', 'up', 'is', 'are', 'be',
  'old', 'year', 'years', 'yr', 'yo',
]);

/** Age phrases stripped from residual text search (after numeric age is parsed). */
const AGE_QUERY_STRIP_RE =
  /\b\d{1,2}\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up|and\s*older|(?:years?|yrs?|y\.o\.|yo)\s*old|years?|yrs?|y\.o\.|yo)\b/gi;

/** Never treat these as city names when parsing or stripping queries. */
const CITY_QUERY_STOPWORDS = new Set([
  'in', 'at', 'for', 'on', 'near', 'around', 'to', 'the', 'and', 'or', 'up',
  'a', 'an', 'of', 'by', 'with', 'from',
]);

/** Fallback city list when program data / getSearchCities is not ready yet. */
const DEFAULT_SEARCH_CITIES = [
  'dallas', 'plano', 'frisco', 'mckinney', 'richardson', 'denton',
  'arlington', 'fort worth', 'mansfield', 'keller', 'desoto', 'de soto',
  'rockwall', 'sherman', 'forney', 'burleson', 'flower mound',
  'the colony', 'bedford', 'lewisville', 'carrollton', 'garland',
  'mesquite', 'irving', 'grand prairie', 'corsicana',
];

function resolveSearchCities(cities) {
  if (Array.isArray(cities) && cities.length > 0) return cities;
  if (typeof window !== 'undefined') {
    if (typeof window.getSearchCities === 'function') {
      const fromData = window.getSearchCities();
      if (Array.isArray(fromData) && fromData.length > 0) return fromData;
    }
    if (Array.isArray(window.CITIES) && window.CITIES.length > 0) return window.CITIES;
  }
  return DEFAULT_SEARCH_CITIES;
}

function isPlausibleCityName(city) {
  const c = safeStr(city).toLowerCase();
  return c.length >= 3 && !CITY_QUERY_STOPWORDS.has(c);
}

function cleanOrphanLocationWords(text) {
  return safeStr(text)
    .replace(/\b(in|for|at|on|near|around|to|the)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripParsedQueryTokens(query, cities) {
  const q = safeStr(query).toLowerCase().trim();
  if (!q) return '';

  const cityList = resolveSearchCities(cities);
  const parsed = parseSmartSearch(query, cityList);
  let terms = q;

  terms = terms
    .replace(
      /\b(php|partial\s+hospital(?:ization)?|day\s+(?:hospital|treatment|program)|iop|intensive\s+outpatient|outpatient|residential|inpatient|rtc|navigation|care\s+navigation)\b/gi,
      ''
    )
    .replace(AGE_QUERY_STRIP_RE, '')
    .replace(
      /\b(crisis|emergency|urgent|eating disorder|anorexia|bulimia|binge eating|substance use|substance abuse|drug treatment|alcohol treatment|addiction)\b/gi,
      ''
    )
    .replace(
      /\b(accepts?|takes?|with)\s+(medicaid|medicare|tricare|triwest|chip\b|mco\b|insurance)\b/gi,
      ''
    )
    .replace(
      /\b(medicaid|medicare|tricare|triwest|chip\b|mco\b|self[- ]?pay|sliding\s+scale|cash\s+pay|commercial\s+insurance|private\s+insurance|insurance\s+accepted|accepts?\s+insurance|medicaid\s+(accepted|friendly))\b/gi,
      ''
    )
    .replace(/\b(virtual|telehealth|tele)\b/gi, '');

  // Strip parsed age before city names (e.g. "Frisco 14" → remove 14 first)
  if (parsed.age) {
    terms = terms.replace(new RegExp(`\\b${parsed.age}\\b`, 'g'), ' ');
  }
  if (parsed.minAge != null) {
    terms = terms.replace(
      new RegExp(
        `\\b${parsed.minAge}\\s*(?:\\+|and\\s*up|years?\\s*and\\s*up|yrs?\\s*and\\s*up|and\\s*older)\\b`,
        'gi'
      ),
      ' '
    );
  }

  const sortedCities = [...cityList].sort((a, b) => b.length - a.length);
  for (const city of sortedCities) {
    const cityPattern = new RegExp(
      `(^|\\s)${escapeRegex(city).replace(/\s+/g, '\\s*')}(\\s|$)`,
      'gi'
    );
    terms = terms.replace(cityPattern, ' ');
  }

  if (parsed.loc) {
    const loc = parsed.loc.toLowerCase();
    const re = new RegExp(`\\b${escapeRegex(loc).replace(/\s+/g, '\\s*')}\\b`, 'gi');
    terms = terms.replace(re, ' ');
  }

  if (parsed.locs && parsed.locs.length) {
    parsed.locs.forEach((loc) => {
      const re = new RegExp(
        `\\b${escapeRegex(loc.toLowerCase()).replace(/\s+/g, '\\s*')}\\b`,
        'gi'
      );
      terms = terms.replace(re, ' ');
    });
  }

  if (parsed.insurance?.startsWith('plan:')) {
    terms = stripDetectedPlanTokens(terms, parsed.insurance);
  } else if (parsed.insurance) {
    terms = terms.replace(/\b(accepts?|takes?|with)\b/gi, ' ');
  }

  return terms.replace(/\s+/g, ' ').trim();
}

/**
 * Remaining meaningful text terms after smart-parse (for relevance cutoff + text filter).
 */
function getTextSearchTerms(query, cities) {
  const residual = stripParsedQueryTokens(query, cities);
  if (!residual) return '';

  return residual
    .split(/\s+/)
    .filter((t) => t.length > 0 && !SEARCH_STOPWORDS.has(t.toLowerCase()))
    .join(' ')
    .trim();
}

/** Token list for matchesFilters text matching (word-boundary safe). */
function getTextSearchTermList(query, cities) {
  const residual = getTextSearchTerms(query, cities);
  if (!residual) return [];
  return residual.split(/\s+/).filter((t) => t.length > 0);
}

function removeCityFromQuery(text, city) {
  if (!city) return text;
  const re = new RegExp(`(^|\\s)${escapeRegex(city).replace(/\s+/g, '\\s*')}(\\s|$)`, 'gi');
  return text.replace(re, ' ');
}

/**
 * Remove one active-filter chip's contribution from the search box (keeps other filters).
 */
function stripFilterFromQuery(query, chipType, cities = []) {
  let q = safeStr(query);
  if (!q) return '';
  if (chipType === 'query') return '';

  const cityList = resolveSearchCities(cities);
  const parsed = parseSmartSearch(q, cityList);

  switch (chipType) {
    case 'parsedLocation':
    case 'location':
      if (parsed.locs?.length) {
        parsed.locs.forEach((loc) => {
          q = removeCityFromQuery(q, loc);
        });
      } else if (parsed.loc) {
        q = removeCityFromQuery(q, parsed.loc);
      }
      break;
    case 'parsedAge':
    case 'age':
      q = q.replace(AGE_QUERY_STRIP_RE, ' ');
      if (parsed.age) {
        q = q.replace(new RegExp(`\\b${parsed.age}\\b`, 'g'), ' ');
      }
      break;
    case 'parsedCare':
    case 'care':
      q = q.replace(
        /\b(partial\s+hospital(?:ization)?|php\b|day\s+(?:hospital|treatment|program)|iop|intensive\s+outpatient|outpatient|residential|inpatient|rtc|navigation|care\s+navigation)\b/gi,
        ' '
      );
      break;
    case 'parsedInsurance':
    case 'insurance':
      q = q.replace(
        /\b(accepts?|takes?|with)\s+(medicaid|medicare|tricare|triwest|chip\b|mco\b|insurance)\b/gi,
        ' '
      );
      q = q.replace(
        /\b(medicaid|medicare|tricare|triwest|chip\b|mco\b|self[- ]?pay|sliding\s+scale|cash\s+pay|commercial\s+insurance|private\s+insurance|insurance\s+accepted|accepts?\s+insurance|medicaid\s+(accepted|friendly))\b/gi,
        ' '
      );
      if (parsed.insurance?.startsWith('plan:')) {
        q = stripDetectedPlanTokens(q, parsed.insurance);
      }
      break;
    case 'virtual':
      q = q.replace(/\b(virtual|telehealth|tele)\b/gi, ' ');
      break;
    case 'parsedCrisis':
    case 'crisis':
      q = q.replace(/\b(crisis|emergency|urgent)\b/gi, ' ');
      break;
    case 'parsedDomain':
      q = q.replace(
        /\b(eating disorder|anorexia|bulimia|binge eating|substance use|substance abuse|drug treatment|alcohol treatment|addiction)\b/gi,
        ' '
      );
      break;
    default:
      break;
  }

  return cleanOrphanLocationWords(q);
}

export {
  levenshteinDistance,
  fuzzyMatch,
  findBestCityMatch,
  detectCareLevel,
  detectInsuranceFromQuery,
  getTextSearchTerms,
  getTextSearchTermList,
  stripFilterFromQuery,
  parseSmartSearch,
  registerInsurancePlansFromData,
  getInsurancePlanAliasEntry,
};

// For classic-script (non-module) consumers not yet converted. Window
// versions of getTextSearchTerms/getTextSearchTermList/stripFilterFromQuery/
// parseSmartSearch auto-inject resolveSearchCities() as a convenience for
// callers with no cities list handy - real importers get the full-signature
// functions above and can pass cities explicitly.
if (typeof window !== 'undefined') {
  window.levenshteinDistance = levenshteinDistance;
  window.fuzzyMatch = fuzzyMatch;
  window.findBestCityMatch = findBestCityMatch;
  // Store references before assigning to window (global name shadowing causes infinite recursion)
  const internalGetTextSearchTerms = getTextSearchTerms;
  const internalGetTextSearchTermList = getTextSearchTermList;
  const internalParseSmartSearch = parseSmartSearch;
  const internalStripFilterFromQuery = stripFilterFromQuery;
  const internalDetectCareLevel = detectCareLevel;
  const internalDetectInsuranceFromQuery = detectInsuranceFromQuery;
  window.detectCareLevel = (query) => internalDetectCareLevel(query);
  window.detectInsuranceFromQuery = (query) => internalDetectInsuranceFromQuery(query);
  window.getTextSearchTerms = (query) => {
    return internalGetTextSearchTerms(query, resolveSearchCities());
  };
  window.getTextSearchTermList = (query) => {
    return internalGetTextSearchTermList(query, resolveSearchCities());
  };
  window.stripFilterFromQuery = (query, chipType) => {
    return internalStripFilterFromQuery(query, chipType, resolveSearchCities());
  };
  window.parseSmartSearch = (query) => {
    return internalParseSmartSearch(query, resolveSearchCities());
  };
  window.registerInsurancePlansFromData = registerInsurancePlansFromData;
  window.getInsurancePlanAliasEntry = getInsurancePlanAliasEntry;
}


