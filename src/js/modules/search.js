// ========== Search Module ==========
// Search functionality including fuzzy matching, autocomplete, and smart parsing

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
    const cityLower = city.toLowerCase();
    if (cityLower === q || cityLower.includes(q) || q.includes(cityLower)) {
      return city;
    }
  }
  
  let bestMatch = null;
  let bestScore = Infinity;
  
  for (const city of cities) {
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

/**
 * Map insurance phrases in search text to dropdown bucket values (bucket:*).
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
  return '';
}

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
      // Match city only if it's a complete word (word boundary) or at start/end
      const cityPattern = new RegExp(`(^|\\s)${city.replace(/\s+/g, '\\s+')}(\\s|$)`, 'i');
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
  const andUpMatch = q.match(/\b(\d{1,2})\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up|and\s*older)\b/i);
  if (andUpMatch) {
    filters.minAge = Number(andUpMatch[1]);
    // Set age to the minimum for filtering purposes
    filters.age = andUpMatch[1];
  } else {
    // Pattern 2: Exact age like "13 year old" or "13"
    const ageMatch = q.match(/\b(\d{1,2})\s*(?:year|yr|y\.o\.|yo)?\s*(?:old)?\b/);
    if(ageMatch) {
      filters.age = ageMatch[1];
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
]);

function stripParsedQueryTokens(query, cities) {
  const q = safeStr(query).toLowerCase().trim();
  if (!q) return '';

  const parsed = parseSmartSearch(query, cities || []);
  let terms = q;

  terms = terms
    .replace(
      /\b(php|partial\s+hospital(?:ization)?|day\s+(?:hospital|treatment|program)|iop|intensive\s+outpatient|outpatient|residential|inpatient|rtc|navigation|care\s+navigation)\b/gi,
      ''
    )
    .replace(/\b\d+\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up|and\s*older|year|yr|y\.o\.|yo|old)\b/gi, '')
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

  const cityList = cities || [];
  const sortedCities = [...cityList].sort((a, b) => b.length - a.length);
  for (const city of sortedCities) {
    const cityPattern = new RegExp(
      `(^|\\s)${city.replace(/\s+/g, '\\s+')}(\\s|$)`,
      'gi'
    );
    terms = terms.replace(cityPattern, ' ');
  }

  if (parsed.loc) {
    const re = new RegExp(`\\b${parsed.loc.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    terms = terms.replace(re, ' ');
  }

  if (parsed.locs && parsed.locs.length) {
    parsed.locs.forEach((loc) => {
      const re = new RegExp(`\\b${loc.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      terms = terms.replace(re, ' ');
    });
  }

  if (parsed.insurance) {
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

function safeStr(x) {
  return (x ?? '').toString().trim();
}

// For non-module environments
if (typeof window !== 'undefined') {
  window.levenshteinDistance = levenshteinDistance;
  window.fuzzyMatch = fuzzyMatch;
  window.findBestCityMatch = findBestCityMatch;
  // Store references before assigning to window (global name shadowing causes infinite recursion)
  const internalGetTextSearchTerms = getTextSearchTerms;
  const internalGetTextSearchTermList = getTextSearchTermList;
  const internalParseSmartSearch = parseSmartSearch;
  const internalDetectCareLevel = detectCareLevel;
  const internalDetectInsuranceFromQuery = detectInsuranceFromQuery;
  window.detectCareLevel = (query) => internalDetectCareLevel(query);
  window.detectInsuranceFromQuery = (query) => internalDetectInsuranceFromQuery(query);
  window.getTextSearchTerms = (query) => {
    const cities = window.getSearchCities ? window.getSearchCities() : window.CITIES || [];
    return internalGetTextSearchTerms(query, cities);
  };
  window.getTextSearchTermList = (query) => {
    const cities = window.getSearchCities ? window.getSearchCities() : window.CITIES || [];
    return internalGetTextSearchTermList(query, cities);
  };
  window.parseSmartSearch = (query) => {
    const cities = window.getSearchCities ? window.getSearchCities() : window.CITIES || [
      'dallas', 'plano', 'frisco', 'mckinney', 'richardson', 'denton', 
      'arlington', 'fort worth', 'mansfield', 'keller', 'desoto', 'de soto',
      'rockwall', 'sherman', 'forney', 'burleson', 'flower mound', 
      'the colony', 'bedford', 'lewisville', 'carrollton', 'garland', 
      'mesquite', 'irving', 'grand prairie', 'corsicana'
    ];
    // Call internal function directly to avoid recursion
    return internalParseSmartSearch(query, cities);
  };
}


