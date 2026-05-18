// ========== Empty state & broaden-search helpers ==========

function careLevelToSearchToken(care) {
  const c = (care || '').toString();
  if (/intensive outpatient/i.test(c)) return 'IOP';
  if (/partial hospital/i.test(c)) return 'PHP';
  if (/outpatient/i.test(c) && !/intensive/i.test(c)) return 'outpatient';
  if (/residential/i.test(c)) return 'residential';
  if (/navigation/i.test(c)) return 'navigation';
  return c;
}

/**
 * Rebuild a minimal search query from smart-parse fields (excludes insurance).
 */
function rebuildQueryFromParsed(parsed, omit = {}) {
  if (!parsed || typeof parsed !== 'object') return '';
  const parts = [];
  if (!omit.care && parsed.care) parts.push(careLevelToSearchToken(parsed.care));
  if (!omit.loc && parsed.loc) parts.push(parsed.loc);
  if (!omit.locs && parsed.locs && parsed.locs.length) {
    parsed.locs.forEach((loc) => parts.push(loc));
  }
  if (!omit.age && parsed.age) {
    parts.push(parsed.minAge != null ? `${parsed.age} and up` : String(parsed.age));
  }
  return parts.join(' ').trim();
}

/**
 * Human-readable summary of active filters for empty-state copy.
 */
function summarizeActiveFilters(chips, extras = {}) {
  const labels = (chips || []).map((c) => c.label).filter(Boolean);
  if (extras.county) labels.push(extras.county);
  if (extras.serviceDomain) labels.push(extras.serviceDomain);
  if (extras.sudServices) labels.push(extras.sudServices);
  if (extras.verificationRecency) labels.push(extras.verificationRecency);
  return labels;
}

/**
 * Context-aware empty state copy.
 */
function getEmptyStateCopy(chips, extras = {}) {
  const labels = summarizeActiveFilters(chips, extras);
  const hasFilters = labels.length > 0;

  if (!hasFilters) {
    return {
      title: 'No programs match these filters',
      body: 'Try clearing filters or broadening your search.',
      tip: 'Tip: Start with a city or care level (for example, IOP in Plano).',
      broadenLabel: 'Remove one filter',
    };
  }

  const shortList =
    labels.length <= 3
      ? labels.join(', ')
      : `${labels.slice(0, 2).join(', ')}, and ${labels.length - 2} more`;

  const hasInsurance = labels.some((l) => /insurance|plan:|medicaid|medicare|tricare/i.test(l));
  const hasLocation = labels.some((l) => /location/i.test(l));
  const hasCare = labels.some((l) => /^care:|care:/i.test(l) || /\bCare:/i.test(l));
  const hasAge = labels.some((l) => /^age:|Age /i.test(l));

  let tip = 'Tip: Use “Broaden search” to drop the tightest filter first';
  if (hasInsurance) tip = 'Tip: Insurance filters are strict — try removing insurance first.';
  else if (hasCare && hasLocation) tip = 'Tip: Try removing care level or location next.';
  else if (hasLocation) tip = 'Tip: Try a nearby city or remove the location filter.';
  else if (hasAge) tip = 'Tip: Many programs list flexible ages — try removing the age filter.';

  return {
    title: 'No programs match these filters',
    body: `Nothing matched with: ${shortList}.`,
    tip,
    broadenLabel: hasInsurance
      ? 'Remove insurance filter'
      : hasCare
        ? 'Remove care level'
        : hasLocation
          ? 'Remove location'
          : 'Broaden search',
  };
}

/**
 * Priority order for broaden-search (tightest filters first).
 * Returns the filter key removed, or null if nothing to remove.
 */
function getBroadenSearchRemovalPlan(ctx) {
  const {
    insuranceDropdown,
    parsedInsurance,
    careDropdown,
    parsedCare,
    locDropdown,
    parsedLoc,
    ageDropdown,
    parsedAge,
    onlyVirtual,
    verificationRecency,
    sudSelected,
    serviceDomain,
    county,
    query,
  } = ctx;

  if (insuranceDropdown || parsedInsurance) return { key: 'insurance', label: 'insurance' };
  if (careDropdown || parsedCare) return { key: 'care', label: 'care level' };
  if (locDropdown || parsedLoc) return { key: 'location', label: 'location' };
  if (ageDropdown || parsedAge) return { key: 'age', label: 'age' };
  if (onlyVirtual) return { key: 'virtual', label: 'virtual only' };
  if (verificationRecency) return { key: 'verificationRecency', label: 'verification window' };
  if (sudSelected) return { key: 'sudServices', label: 'substance use services' };
  if (serviceDomain) return { key: 'serviceDomain', label: 'service type' };
  if (county) return { key: 'county', label: 'county' };
  if (query) return { key: 'query', label: 'search text' };
  return null;
}

if (typeof window !== 'undefined') {
  window.careLevelToSearchToken = careLevelToSearchToken;
  window.rebuildQueryFromParsed = rebuildQueryFromParsed;
  window.getEmptyStateCopy = getEmptyStateCopy;
  window.getBroadenSearchRemovalPlan = getBroadenSearchRemovalPlan;
  window.summarizeActiveFilters = summarizeActiveFilters;
}
