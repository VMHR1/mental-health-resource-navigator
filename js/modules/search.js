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

function parseSmartSearch(query, cities) {
  const q = query.toLowerCase();
  const filters = {
    loc: '',
    locs: [],
    age: '',
    minAge: null,
    care: '',
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
  
  if (!foundMultiLocation) {
    const sortedCities = cities.sort((a, b) => b.length - a.length);
    for (const city of sortedCities) {
      if(q.includes(city)) {
        if (city === 'desoto' || city === 'de soto') {
          filters.loc = 'De Soto';
        } else {
          filters.loc = city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        break;
      }
    }
    
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
  
  // Age detection
  const andUpMatch = q.match(/\b(\d{1,2})\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up|and\s*older)\b/i);
  if (andUpMatch) {
    filters.minAge = Number(andUpMatch[1]);
    filters.age = andUpMatch[1];
  } else {
    const ageMatch = q.match(/\b(\d{1,2})\s*(?:year|yr|y\.o\.|yo)?\s*(?:old)?\b/);
    if(ageMatch) {
      filters.age = ageMatch[1];
    }
  }
  
  // Level of care detection
  if(q.includes('php') || q.includes('partial hospitalization')) {
    filters.care = 'Partial Hospitalization (PHP)';
  } else if(q.includes('iop') || q.includes('intensive outpatient')) {
    filters.care = 'Intensive Outpatient (IOP)';
  } else if(q.includes('outpatient') && !q.includes('intensive')) {
    filters.care = 'Outpatient';
  } else if(q.includes('navigation')) {
    filters.care = 'Navigation';
  }
  
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
  
  return filters;
}

// For non-module environments
if (typeof window !== 'undefined') {
  window.levenshteinDistance = levenshteinDistance;
  window.fuzzyMatch = fuzzyMatch;
  window.findBestCityMatch = findBestCityMatch;
  window.parseSmartSearch = (query) => {
    const cities = window.CITIES || [
      'dallas', 'plano', 'frisco', 'mckinney', 'richardson', 'denton', 
      'arlington', 'fort worth', 'mansfield', 'keller', 'desoto', 'de soto',
      'rockwall', 'sherman', 'forney', 'burleson', 'flower mound', 
      'the colony', 'bedford', 'lewisville', 'carrollton', 'garland', 
      'mesquite', 'irving', 'grand prairie', 'corsicana'
    ];
    return parseSmartSearch(query, cities);
  };
}


