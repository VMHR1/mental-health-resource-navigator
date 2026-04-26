// ========== Filter Logic ==========
// Pure functions for program filtering

/**
 * Check if a program matches the given filters
 * @param {Object} program - The program to check
 * @param {Object} filters - Filter values
 * @param {Object} options - Helper functions and dependencies
 * @returns {boolean} - True if program matches all filters
 */
function matchesFilters(program, filters, options = {}) {
  const {
    // Helper functions
    safeStr = (val) => (val != null ? String(val) : ''),
    parseSmartSearch = () => ({ loc: '', locs: [], age: '', minAge: null, care: '', showCrisis: false, organization: '' }),
    fuzzyMatch = null,
    programServesAge = null,
    hasVirtual = null,
    locLabel = null,
    // Feature flags
    featureFlags = {},
    // Programs list for organization detection
    programs = [],
    ready = false
  } = options;

  const {
    // Text search
    query = '',
    // Location
    location = '',
    // Age
    age = '',
    // Care level
    care = '',
    // Insurance
    insurance = '',
    // Virtual toggle
    onlyVirtual = false,
    // Crisis toggle (not used in filtering, but parsed from search)
    showCrisis = false,
    // Statewide filters
    selectedCounty = null,
    selectedServiceDomains = [],
    selectedSudServices = [],
    verificationRecencyDays = null,
    serviceDomain = ''
  } = filters;

  const q = safeStr(query).toLowerCase();
  const loc = safeStr(location).toLowerCase();
  const ageVal = safeStr(age);
  const careVal = safeStr(care).toLowerCase();

  // Parse smart search to get additional filters
  const parsed = typeof parseSmartSearch === 'function' 
    ? parseSmartSearch(query)
    : { loc: '', locs: [], age: '', minAge: null, care: '', showCrisis: false, organization: '' };
  
  // App-specific: Try to detect organization name from query
  if (ready && programs.length > 0 && !parsed.loc && typeof parseSmartSearch === 'function') {
    const qLower = query.toLowerCase();
    const exactOrg = programs.find(p => safeStr(p.organization).toLowerCase() === qLower);
    if (exactOrg) {
      parsed.organization = exactOrg.organization;
    }
  }
  const searchMinAge = parsed.minAge;

  // Text search - check if query terms appear in program fields
  if (q && q.trim()) {
    const orgLower = safeStr(program.organization).toLowerCase();
    const progLower = safeStr(program.program_name).toLowerCase();
    const qLower = q.toLowerCase().trim();
    
    // Check for exact matches first (highest priority)
    // Only check dataset attributes if there's actually a query
    const isExactMatch = filters.exactMatch === true;
    const matchType = filters.matchType;
    
    // If this was selected from autocomplete as an organization, match all programs from that org
    if (matchType === 'organization' && qLower) {
      // For organization matches, check if this program belongs to the selected organization
      // Use case-insensitive comparison
      if (orgLower !== qLower) {
        // Organization name doesn't match exactly - this program should be filtered out
        return false;
      }
    } else if (matchType === 'program' && isExactMatch && qLower) {
      // Exact program match required
      if (progLower !== qLower) {
        return false;
      }
    } else {
      // No specific match type or not exact - check normal matching
      // Check exact organization or program name match before other checks
      if (orgLower !== qLower && progLower !== qLower) {
        // Remove location, age, and care level terms from search query for text matching
        // BUT preserve organization-like terms (don't remove words that might be part of org names)
        const searchTerms = q
          .replace(/\b(php|partial hospitalization|iop|intensive outpatient|outpatient|navigation)\b/gi, '')
          .replace(/\b\d+\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up|and\s*older|year|yr|y\.o\.|yo|old)\b/gi, '')
          // Only remove city names if they're standalone (not part of organization names)
          // Use word boundaries to avoid removing city names embedded in org names
          .replace(/\b(dallas|plano|frisco|mckinney|richardson|denton|arlington|fort worth|mansfield|keller|desoto|de soto|rockwall|sherman|forney|burleson|flower mound|the colony|bedford|lewisville|carrollton|garland|mesquite|irving|grand prairie|corsicana)\b(?=\s|$)/gi, '')
          .trim();
        
        if (searchTerms) {
          const hay = [
            program.program_name, program.organization, program.level_of_care,
            program.entry_type, program.service_setting, program.ages_served,
            locLabel ? locLabel(program) : '',
            (program.notes || ""),
          ].map(safeStr).join(" ").toLowerCase();
          
          // Check if all remaining search terms appear (with fuzzy matching for typos)
          const terms = searchTerms.split(/\s+/).filter(t => t.length > 0);
          if (terms.length > 0) {
            // Prioritize organization and program name matches
            const orgMatch = terms.every(term => {
              if (orgLower.includes(term)) return true;
              if (term.length > 3) return fuzzyMatch && fuzzyMatch(term, orgLower, 0.85);
              return false;
            });
            
            const progMatch = terms.every(term => {
              if (progLower.includes(term)) return true;
              if (term.length > 3) return fuzzyMatch && fuzzyMatch(term, progLower, 0.85);
              return false;
            });
            
            // If matches organization or program name, allow it
            if (!orgMatch && !progMatch) {
              // Check other fields with fuzzy matching
              const allMatch = terms.every(term => {
                if (hay.includes(term)) return true;
                // Fuzzy match for terms longer than 3 characters
                if (term.length > 3) {
                  return fuzzyMatch && fuzzyMatch(term, hay, 0.7);
                }
                return false;
              });
              if (!allMatch) return false;
            }
          }
        }
      }
    }
  }

  // Location filter - use parsed location or dropdown value, support multi-location
  if (parsed.locs && parsed.locs.length > 0) {
    // Multi-location search: program must serve at least one of the specified locations
    const programCities = (program.locations || []).map(l => safeStr(l.city).toLowerCase());
    const searchCities = parsed.locs.map(loc => loc.toLowerCase());
    const matches = searchCities.some(searchCity => {
      if (searchCity === 'de soto') {
        return programCities.some(c => c === 'de soto' || c === 'desoto');
      }
      return programCities.some(c => c === searchCity || (fuzzyMatch && fuzzyMatch(searchCity, c, 0.8)));
    });
    if (!matches) return false;
  } else {
    const locationToCheck = parsed.loc ? parsed.loc.toLowerCase() : loc;
    if (locationToCheck) {
      const cities = (program.locations || []).map(l => safeStr(l.city).toLowerCase());
      // Handle "De Soto" matching both "De Soto" and "Desoto"
      const normalizedLocation = locationToCheck.replace(/\s+/g, ' ').trim();
      if (normalizedLocation === 'de soto') {
        if (!cities.some(c => c === 'de soto' || c === 'desoto')) return false;
      } else {
        // Use fuzzy matching for location
        const matches = cities.some(c => c === normalizedLocation || (fuzzyMatch && fuzzyMatch(normalizedLocation, c, 0.8)));
        if (!matches) return false;
      }
    }
  }

  // Level of care filter - use parsed care or dropdown value
  const careToCheck = parsed.care ? parsed.care.toLowerCase() : careVal;
  if (careToCheck) {
    if (safeStr(program.level_of_care).toLowerCase() !== careToCheck) return false;
  }

  // Age filter - handle both exact age and "and up" patterns
  const ageToCheck = ageVal || (parsed.age || '');
  if (ageToCheck) {
    const age = Number(ageToCheck);
    if (Number.isFinite(age)) {
      if (searchMinAge !== null) {
        // "13 and up" - check if program serves this age or higher
        // Program must serve at least age 13
        if (!programServesAge || !programServesAge(program, age)) return false;
      } else {
        // Exact age match
        if (!programServesAge || !programServesAge(program, age)) return false;
      }
    }
  }

  // Insurance filter
  const insuranceVal = safeStr(insurance);
  if (insuranceVal) {
    const insurance = program.accepted_insurance || {};
    const insuranceTypes = Array.isArray(insurance.types) ? insurance.types.map(t => safeStr(t).toLowerCase()) : [];
    const insurancePlans = Array.isArray(insurance.plans) ? insurance.plans.map(pl => safeStr(pl).toLowerCase()) : [];
    
    // Check if it's a type or plan filter
    if (insuranceVal.startsWith('type:')) {
      const filterType = insuranceVal.replace('type:', '').toLowerCase();
      // Normalize for matching (remove qualifiers like "(many)", "(some)", etc.)
      const normalizedTypes = insuranceTypes.map(t => 
        t.replace(/\(many\)/g, '').replace(/\(some\)/g, '').replace(/\(varies\)/g, '').replace(/\(listed\)/g, '').replace(/\(most major\)/g, '').trim()
      );
      if (!normalizedTypes.some(t => t.includes(filterType) || filterType.includes(t))) {
        return false;
      }
    } else if (insuranceVal.startsWith('plan:')) {
      const filterPlan = insuranceVal.replace('plan:', '').toLowerCase();
      if (!insurancePlans.some(pl => pl === filterPlan || pl.includes(filterPlan) || filterPlan.includes(pl))) {
        return false;
      }
    }
  }

  if (onlyVirtual && (!hasVirtual || !hasVirtual(program))) {
    return false;
  }

  // ========== Statewide Filters (Feature Flag Protected) ==========
  // These filters only apply when the corresponding feature flags are enabled
  
  // County filter - only applies when STATEWIDE_MODE is enabled
  if (featureFlags.STATEWIDE_MODE) {
    const countyVal = safeStr(filters.county || '');
    if (countyVal) {
      const programCounty = safeStr(program.primary_county || '').toLowerCase();
      const serviceAreaCounties = Array.isArray(program.service_area?.counties) 
        ? program.service_area.counties.map(c => safeStr(c).toLowerCase())
        : [];
      // Also check locations for county data
      const locationCounties = (program.locations || [])
        .map(loc => safeStr(loc.county || '').toLowerCase())
        .filter(c => c);
      const countyMatch = programCounty === countyVal.toLowerCase() ||
                          serviceAreaCounties.includes(countyVal.toLowerCase()) ||
                          locationCounties.includes(countyVal.toLowerCase());
      if (!countyMatch) return false;
    }
  }

  const programDomains = Array.isArray(program.service_domains)
    ? program.service_domains.map(d => safeStr(d).toLowerCase())
    : [];
  const effectiveServiceDomains = new Set();
  if (serviceDomain) effectiveServiceDomains.add(safeStr(serviceDomain).toLowerCase());
  if (parsed.serviceDomain) effectiveServiceDomains.add(safeStr(parsed.serviceDomain).toLowerCase());
  if (Array.isArray(selectedServiceDomains)) {
    selectedServiceDomains.forEach((domain) => {
      if (domain) effectiveServiceDomains.add(safeStr(domain).toLowerCase());
    });
  }
  if (effectiveServiceDomains.size > 0) {
    const hasDomainMatch = [...effectiveServiceDomains].some((domain) => programDomains.includes(domain));
    if (!hasDomainMatch) return false;
  }
  
  // SUD services filter - only applies when SHOW_SUD_FILTERS is enabled
  if (featureFlags.SHOW_SUD_FILTERS) {
    const selectedDomain = safeStr(serviceDomain || parsed.serviceDomain || '').toLowerCase();
    if (selectedSudServices.length > 0 && selectedDomain === 'substance_use') {
      const programSudServices = Array.isArray(program.sud_services)
        ? program.sud_services.map(s => safeStr(s).toLowerCase())
        : [];
      // Check if there's any intersection between selected and program SUD services
      const hasMatch = selectedSudServices.some(selected =>
        programSudServices.includes(selected.toLowerCase())
      );
      if (!hasMatch) return false;
    }
  }

  // Verification recency filter - only applies when SHOW_VERIFICATION_FILTERS is enabled
  if (featureFlags.SHOW_VERIFICATION_FILTERS) {
    const verificationRecencyVal = safeStr(filters.verificationRecency || '');
    if (verificationRecencyVal) {
      const recencyDays = parseInt(verificationRecencyVal, 10);
      if (!isNaN(recencyDays) && recencyDays > 0) {
        const verifiedAt = program.verification?.last_verified_at || program.last_verified; // Support legacy field
        if (!verifiedAt) return false; // Program must have verification date
        
        try {
          const verifiedDate = new Date(verifiedAt);
          if (isNaN(verifiedDate.getTime())) return false; // Invalid date
          
          const now = new Date();
          const daysDiff = Math.floor((now - verifiedDate) / (1000 * 60 * 60 * 24));
          if (daysDiff > recencyDays) return false;
        } catch (e) {
          // Invalid date format - exclude programs with malformed dates
          return false;
        }
      }
    } else if (verificationRecencyDays !== null) {
      // Use verificationRecencyDays from state if available
      const recencyDays = verificationRecencyDays;
      if (recencyDays > 0) {
        const verifiedAt = program.verification?.last_verified_at || program.last_verified;
        if (!verifiedAt) return false;
        
        try {
          const verifiedDate = new Date(verifiedAt);
          if (isNaN(verifiedDate.getTime())) return false;
          
          const now = new Date();
          const daysDiff = Math.floor((now - verifiedDate) / (1000 * 60 * 60 * 24));
          if (daysDiff > recencyDays) return false;
        } catch (e) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Calculate relevance score for a program based on a query
 * @param {Object} program - The program to score
 * @param {string} query - The search query
 * @param {Object} options - Helper functions
 * @returns {number} - Relevance score (higher is better)
 */
function calculateRelevanceScore(program, query, options = {}) {
  if (!query || !query.trim()) return 0;
  
  const {
    safeStr = (val) => (val != null ? String(val) : ''),
    locLabel = null,
    fuzzyMatch = null
  } = options;
  
  let score = 0;
  const qLower = query.toLowerCase().trim();
  const orgLower = safeStr(program.organization).toLowerCase();
  const progLower = safeStr(program.program_name).toLowerCase();
  const levelOfCare = safeStr(program.level_of_care).toLowerCase();
  const entryType = safeStr(program.entry_type).toLowerCase();
  const serviceSetting = safeStr(program.service_setting).toLowerCase();
  const agesServed = safeStr(program.ages_served).toLowerCase();
  const notes = safeStr(program.notes || '').toLowerCase();
  const loc = locLabel ? locLabel(program).toLowerCase() : '';
  
  // Exact matches get highest priority
  if (orgLower === qLower) {
    score += 100;
  } else if (progLower === qLower) {
    score += 90;
  } else {
    // Organization name matching (high priority)
    if (orgLower.includes(qLower)) {
      score += 80;
    } else if (qLower.includes(orgLower)) {
      score += 75;
    } else if (fuzzyMatch && fuzzyMatch(qLower, orgLower, 0.85)) {
      score += 60;
    }
    
    // Program name matching
    if (progLower.includes(qLower)) {
      score += 70;
    } else if (qLower.includes(progLower)) {
      score += 65;
    } else if (fuzzyMatch && fuzzyMatch(qLower, progLower, 0.85)) {
      score += 50;
    }
  }
  
  // Word-boundary aware matching for multi-word queries
  const queryWords = qLower.split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length > 1) {
    const orgWords = orgLower.split(/\s+/);
    const progWords = progLower.split(/\s+/);
    
    // Check if all query words appear in organization
    const allWordsInOrg = queryWords.every(qw => 
      orgWords.some(ow => ow.includes(qw) || qw.includes(ow))
    );
    if (allWordsInOrg && score < 70) {
      score += 55;
    }
    
    // Check if all query words appear in program name
    const allWordsInProg = queryWords.every(qw => 
      progWords.some(pw => pw.includes(qw) || qw.includes(pw))
    );
    if (allWordsInProg && score < 60) {
      score += 45;
    }
  }
  
  // Other field matches (lower priority)
  if (levelOfCare.includes(qLower)) score += 30;
  if (entryType.includes(qLower)) score += 25;
  if (serviceSetting.includes(qLower)) score += 20;
  if (agesServed.includes(qLower)) score += 15;
  if (loc.includes(qLower)) score += 20;
  if (notes.includes(qLower)) score += 10;
  
  return score;
}

// For non-module environments
if (typeof window !== 'undefined') {
  window.matchesFilters = matchesFilters;
  window.calculateRelevanceScore = calculateRelevanceScore;
}

