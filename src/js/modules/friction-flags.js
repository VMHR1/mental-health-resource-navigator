// ========== Friction Flags (Phase 8 — Navigator mode only) ==========
// Operational caveats surfaced on the card; never change search order.
// Do NOT introduce quality scores or sorting based on these flags.

const VMHRFrictionFlags = (function () {
  if (typeof window === 'undefined') return undefined;

  function safe(x) {
    return (x == null ? '' : String(x)).trim();
  }

  function lowerSafe(x) {
    return safe(x).toLowerCase();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const FLAG_DEFINITIONS = {
    insurance_unclear: {
      label: 'Insurance unclear',
      whatToAsk: 'Ask which plans the program currently accepts and whether prior authorization is required.',
    },
    verification_stale: {
      label: 'Verification overdue',
      whatToAsk: 'Phone or website details may have changed since our last review—confirm directly.',
    },
    intake_not_labeled: {
      label: 'Intake phone not labeled',
      whatToAsk: 'Ask whether the listed line is intake, crisis, or main reception.',
    },
    website_missing: {
      label: 'No website listed',
      whatToAsk: 'Ask for a current public information page or program description.',
    },
    age_narrow: {
      label: 'Narrow age range',
      whatToAsk: 'Confirm exact ages served and whether exceptions are possible.',
    },
    location_far: {
      label: 'May be far from your selected city',
      whatToAsk: 'Confirm whether the program serves the family\'s area or offers telehealth.',
    },
    care_level_incomplete: {
      label: 'Care level information incomplete',
      whatToAsk: 'Ask which level of care this program currently offers (PHP, IOP, outpatient, etc.).',
    },
  };

  function ageRangeIsNarrow(agesServed) {
    const text = safe(agesServed);
    if (!text) return false;
    // Single integer like "14"
    if (/^\d{1,2}$/.test(text)) return true;
    // Tight band of <= 2 years, e.g. "13-14"
    const band = text.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
    if (band) {
      const lo = Number(band[1]);
      const hi = Number(band[2]);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        return hi - lo <= 2;
      }
    }
    return false;
  }

  function locationIsFarFromFilter(program, locationFilter) {
    const loc = lowerSafe(locationFilter);
    if (!loc) return false;
    const programLocations = Array.isArray(program.locations) ? program.locations : [];
    if (programLocations.length === 0) return false;
    const cities = programLocations.map((l) => lowerSafe(l && l.city)).filter(Boolean);
    if (cities.length === 0) return false;
    // If virtual is listed, do not flag as far
    if (cities.includes('virtual')) return false;
    // If any city contains or equals the filter token, not far
    const exactOrPartial = cities.some((c) => c === loc || c.includes(loc) || loc.includes(c));
    if (exactOrPartial) return false;
    // Otherwise we flag (the filter was a textual match through location-match.js, but the
    // primary listed city is different — give staff a heads-up).
    return true;
  }

  function computeFlags(program, filtersOverride) {
    if (!program) return [];
    const filters = filtersOverride
      || (window.VMHRMatchExplain && window.VMHRMatchExplain.readFilterSnapshot
        ? window.VMHRMatchExplain.readFilterSnapshot()
        : {});

    const flags = [];

    // insurance_unclear: no plans, no types, or status flagged unclear
    const insurance = program.accepted_insurance || {};
    const types = Array.isArray(insurance.types) ? insurance.types.filter(Boolean) : [];
    const plans = Array.isArray(insurance.plans) ? insurance.plans.filter(Boolean) : [];
    const insuranceStatus = lowerSafe(insurance.status);
    const insuranceNotes = safe(insurance.notes) || safe(program.insurance_notes);
    if (
      insuranceStatus === 'not_listed'
      || insuranceStatus === 'contact_for_info'
      || insuranceStatus === 'unclear'
      || (!types.length && !plans.length && !insuranceNotes)
    ) {
      flags.push('insurance_unclear');
    }

    // verification_stale: existing freshness rule
    const lastVerified = safe(program.last_verified || (program.verification && program.verification.last_verified_at));
    const fn = window.getVerificationFreshness;
    const freshness = lastVerified && typeof fn === 'function' ? fn(lastVerified) : 'missing';
    if (freshness === 'stale' || freshness === 'missing') {
      flags.push('verification_stale');
    }

    // intake_not_labeled: no intake_phone or phone_labels and no explicit "intake" mention
    const intakePhone = safe(program.intake_phone);
    const phoneLabels = program.phone_labels && typeof program.phone_labels === 'object' ? program.phone_labels : null;
    const phoneNotes = lowerSafe(program.notes);
    const phoneFieldHasIntakeWord = /\bintake\b/.test(phoneNotes);
    if (!intakePhone && !phoneLabels && !phoneFieldHasIntakeWord) {
      flags.push('intake_not_labeled');
    }

    // website_missing
    const website = safe(program.website_url) || safe(program.website);
    if (!website) {
      flags.push('website_missing');
    }

    // age_narrow
    if (ageRangeIsNarrow(program.ages_served)) {
      flags.push('age_narrow');
    }

    // location_far (only when a location filter is active)
    if (filters && filters.location && locationIsFarFromFilter(program, filters.location)) {
      flags.push('location_far');
    }

    // care_level_incomplete
    const care = safe(program.level_of_care);
    if (!care || /not\s*listed|unknown|tbd/i.test(care)) {
      flags.push('care_level_incomplete');
    }

    return flags;
  }

  function renderFlagBadgesHtml(program, filtersOverride) {
    const ids = computeFlags(program, filtersOverride);
    if (!ids.length) return '';
    const badges = ids.map((id) => {
      const def = FLAG_DEFINITIONS[id] || { label: id, whatToAsk: '' };
      const title = def.whatToAsk
        ? `${def.label}. What to ask: ${def.whatToAsk}`
        : def.label;
      return `<span class="friction-flag" data-flag-id="${escapeHtml(id)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(def.label)}</span>`;
    }).join('');
    return `<div class="friction-flag-row" role="note" aria-label="Operational caveats — do not affect search order">
      <span class="friction-flag-row__label">Operational caveats:</span>
      ${badges}
    </div>`;
  }

  return {
    FLAG_DEFINITIONS,
    computeFlags,
    renderFlagBadgesHtml,
  };
})();

export { VMHRFrictionFlags };

// For classic-script (non-module) consumers not yet converted
if (typeof window !== 'undefined') {
  window.VMHRFrictionFlags = VMHRFrictionFlags;
}
