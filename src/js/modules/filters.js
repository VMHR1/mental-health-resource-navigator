// ========== Filter Logic ==========
// Pure functions for program filtering

/** Canonical insurance buckets for family-friendly filtering. */
const INSURANCE_BUCKETS = {
  'bucket:medicaid': {
    label: 'Medicaid / CHIP',
    patterns: ['medicaid', 'chip', 'star ', 'star+', 'mco'],
  },
  'bucket:medicare': {
    label: 'Medicare',
    patterns: ['medicare'],
  },
  'bucket:tricare': {
    label: 'TRICARE / Military',
    patterns: ['tricare', 'military', 'triwest', 'champus'],
  },
  'bucket:commercial': {
    label: 'Commercial insurance',
    patterns: ['commercial', 'private insurance', 'employer', 'most major'],
  },
  'bucket:self_pay': {
    label: 'Self-pay / sliding scale',
    patterns: ['self-pay', 'self pay', 'sliding scale', 'private pay', 'cash pay'],
  },
  'bucket:contact': {
    label: 'Call to verify insurance',
    patterns: [],
  },
};

function insuranceHaystack(program, safeStr) {
  const insurance = program.accepted_insurance || {};
  const types = Array.isArray(insurance.types)
    ? insurance.types.map((t) => safeStr(t).toLowerCase())
    : [];
  const plans = Array.isArray(insurance.plans)
    ? insurance.plans.map((pl) => safeStr(pl).toLowerCase())
    : [];
  const plansRaw = Array.isArray(insurance.plans_raw)
    ? insurance.plans_raw.map((pl) => safeStr(pl).toLowerCase())
    : [];
  const notes = [
    safeStr(insurance.notes),
    safeStr(program.insurance_notes),
  ]
    .join(' ')
    .toLowerCase();
  return { types, plans, plansRaw, notes, status: safeStr(insurance.status).toLowerCase() };
}

function programMatchesInsuranceBucket(program, bucketKey, safeStr) {
  const bucket = INSURANCE_BUCKETS[bucketKey];
  if (!bucket) return false;

  const { types, plans, plansRaw, notes, status } = insuranceHaystack(program, safeStr);
  const combined = [...types, ...plans, ...plansRaw, notes].join(' | ');

  if (bucketKey === 'bucket:contact') {
    return (
      status === 'contact_for_info' ||
      status === 'not_listed' ||
      (!plans.length && !types.length && notes.includes('call'))
    );
  }

  return bucket.patterns.some((pat) => combined.includes(pat));
}

function programMatchesInsuranceFilter(program, insuranceVal, safeStr) {
  const insurance = program.accepted_insurance || {};
  const insuranceTypes = Array.isArray(insurance.types)
    ? insurance.types.map((t) => safeStr(t).toLowerCase())
    : [];
  const insurancePlans = Array.isArray(insurance.plans)
    ? insurance.plans.map((pl) => safeStr(pl).toLowerCase())
    : [];

  if (insuranceVal.startsWith('bucket:')) {
    return programMatchesInsuranceBucket(program, insuranceVal, safeStr);
  }

  if (insuranceVal.startsWith('type:')) {
    const filterType = insuranceVal.replace('type:', '').toLowerCase();
    const normalizedTypes = insuranceTypes.map((t) =>
      t
        .replace(/\(many\)/g, '')
        .replace(/\(some\)/g, '')
        .replace(/\(varies\)/g, '')
        .replace(/\(listed\)/g, '')
        .replace(/\(most major\)/g, '')
        .trim()
    );
    if (
      normalizedTypes.some(
        (t) => t.includes(filterType) || filterType.includes(t)
      )
    ) {
      return true;
    }
    // Bucket alias: type filter "Medicaid/CHIP" matches bucket patterns
    if (filterType.includes('medicaid') || filterType.includes('chip')) {
      return programMatchesInsuranceBucket(program, 'bucket:medicaid', safeStr);
    }
    return false;
  }

  if (insuranceVal.startsWith('plan:')) {
    const filterPlan = insuranceVal.replace('plan:', '').toLowerCase();
    return insurancePlans.some(
      (pl) => pl === filterPlan || pl.includes(filterPlan) || filterPlan.includes(pl)
    );
  }

  return true;
}

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
    programServesLocation = null,
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
        const getTermList =
          typeof options.getTextSearchTermList === 'function'
            ? options.getTextSearchTermList
            : typeof window !== 'undefined' && typeof window.getTextSearchTermList === 'function'
              ? (text) => window.getTextSearchTermList(text)
              : null;
        const terms = getTermList ? getTermList(q) : [];

        if (terms.length > 0) {
          const hay = [
            program.program_name, program.organization, program.level_of_care,
            program.entry_type, program.service_setting, program.ages_served,
            locLabel ? locLabel(program) : '',
            (program.notes || ""),
          ].map(safeStr).join(" ").toLowerCase();

          const termMatchesHay = (term) => {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordRe = new RegExp(`\\b${escaped}\\b`, 'i');
            if (wordRe.test(hay) || wordRe.test(orgLower) || wordRe.test(progLower)) {
              return true;
            }
            if (term.length > 3) {
              return (
                (fuzzyMatch && fuzzyMatch(term, hay, 0.7)) ||
                (fuzzyMatch && fuzzyMatch(term, orgLower, 0.85)) ||
                (fuzzyMatch && fuzzyMatch(term, progLower, 0.85))
              );
            }
            return false;
          };

          if (terms.length > 0) {
            const allMatch = terms.every(termMatchesHay);
            if (!allMatch) return false;
          }
        }
      }
    }
  }

  // Location filter — city, county, service_area, virtual, and broad regional coverage
  const locationFn =
    programServesLocation ||
    (typeof window !== 'undefined' ? window.programServesLocation : null);
  const locationOpts = { safeStr, fuzzyMatch, hasVirtual };

  if (parsed.locs && parsed.locs.length > 0) {
    if (!locationFn || !locationFn(program, parsed.locs, locationOpts)) return false;
  } else {
    const dropdownLoc = safeStr(location);
    const parsedLoc = parsed.loc ? safeStr(parsed.loc) : '';
    const locationToCheck = parsedLoc || dropdownLoc;
    if (locationToCheck) {
      if (!locationFn || !locationFn(program, locationToCheck, locationOpts)) {
        return false;
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
      const serves = programServesAge ? programServesAge(program, age) : null;
      // null = ages_served unparseable — do not exclude
      if (serves === false) return false;
    }
  }

  // Insurance filter (dropdown or smart-search bucket)
  const insuranceToCheck = safeStr(insurance) || safeStr(parsed.insurance || '');
  if (insuranceToCheck) {
    if (!programMatchesInsuranceFilter(program, insuranceToCheck, safeStr)) {
      return false;
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

/**
 * Effective filters from smart search + dropdowns (for chips / UI).
 */
function getEffectiveSearchFilters(query, dropdowns = {}, options = {}) {
  const { parseSmartSearch: parseFn = () => ({}) } = options;
  const parsed = typeof parseFn === 'function' ? parseFn(query) : {};
  const safeStr = options.safeStr || ((x) => (x ?? '').toString().trim());

  const chips = [];
  const locDropdown = safeStr(dropdowns.location);
  const parsedLoc =
    parsed.locs && parsed.locs.length
      ? parsed.locs.map((c) => (window.formatCityLabel ? window.formatCityLabel(c) : c)).join(' or ')
      : parsed.loc
        ? window.formatCityLabel
          ? window.formatCityLabel(parsed.loc)
          : parsed.loc
        : '';

  if (parsedLoc && (!locDropdown || locDropdown.toLowerCase() !== parsedLoc.toLowerCase())) {
    chips.push({ type: 'parsedLocation', label: `Location (search): ${parsedLoc}` });
  } else if (locDropdown) {
    chips.push({ type: 'location', label: `Location: ${locDropdown}` });
  }

  const ageDropdown = safeStr(dropdowns.age);
  if (parsed.age && parsed.age !== ageDropdown) {
    const ageLabel =
      parsed.minAge != null ? `Age ${parsed.age}+` : `Age ${parsed.age}`;
    chips.push({ type: 'parsedAge', label: ageLabel });
  } else if (ageDropdown) {
    chips.push({
      type: 'age',
      label: parsed.minAge != null ? `Age ${ageDropdown}+` : `Age ${ageDropdown}`,
    });
  }

  const careDropdown = safeStr(dropdowns.care);
  if (parsed.care && parsed.care !== careDropdown) {
    chips.push({ type: 'parsedCare', label: `Care: ${parsed.care}` });
  } else if (careDropdown) {
    chips.push({ type: 'care', label: `Care: ${careDropdown}` });
  }

  if (parsed.serviceDomain) {
    const domainLabels = {
      eating_disorders: 'Eating disorders',
      substance_use: 'Substance use',
    };
    chips.push({
      type: 'parsedDomain',
      label: `Focus: ${domainLabels[parsed.serviceDomain] || parsed.serviceDomain}`,
    });
  }

  if (parsed.showCrisis) {
    chips.push({ type: 'parsedCrisis', label: 'Crisis resources included' });
  }

  const insuranceDropdown = safeStr(dropdowns.insurance);
  const parsedInsurance = safeStr(parsed.insurance || '');
  const insuranceVal = insuranceDropdown || parsedInsurance;

  if (parsedInsurance && parsedInsurance !== insuranceDropdown) {
    const bucket = INSURANCE_BUCKETS[parsedInsurance];
    const parsedLabel = parsedInsurance.startsWith('plan:')
      ? `Plan (search): ${parsedInsurance.replace('plan:', '')}`
      : `Insurance (search): ${bucket?.label || parsedInsurance.replace('bucket:', '')}`;
    chips.push({
      type: 'parsedInsurance',
      label: parsedLabel,
    });
  } else if (insuranceVal.startsWith('bucket:')) {
    const bucket = INSURANCE_BUCKETS[insuranceVal];
    chips.push({
      type: 'insurance',
      label: `Insurance: ${bucket?.label || insuranceVal}`,
    });
  } else if (insuranceVal.startsWith('type:')) {
    chips.push({
      type: 'insurance',
      label: `Insurance: ${insuranceVal.replace('type:', '')}`,
    });
  } else if (insuranceVal.startsWith('plan:')) {
    chips.push({
      type: 'insurance',
      label: `Plan: ${insuranceVal.replace('plan:', '')}`,
    });
  }

  if (dropdowns.onlyVirtual) {
    chips.push({ type: 'virtual', label: 'Virtual only' });
  }

  if (dropdowns.showCrisis && !parsed.showCrisis) {
    chips.push({ type: 'crisis', label: 'Crisis resources' });
  }

  const qTrim = safeStr(query);
  if (qTrim) {
    chips.push({ type: 'query', label: `Search: “${qTrim.length > 40 ? `${qTrim.slice(0, 40)}…` : qTrim}”` });
  }

  return { parsed, chips };
}

// For non-module environments
if (typeof window !== 'undefined') {
  window.matchesFilters = matchesFilters;
  window.calculateRelevanceScore = calculateRelevanceScore;
  window.getEffectiveSearchFilters = getEffectiveSearchFilters;
  window.INSURANCE_BUCKETS = INSURANCE_BUCKETS;
}

