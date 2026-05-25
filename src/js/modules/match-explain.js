// ========== Match Explain (Phase 8 — Navigator mode only) ==========
// Transparent, rule-based "why this result appears" for each card.
// No score, no ML, no opaque ranking — purely echoes the filter logic.

(function () {
  if (typeof window === 'undefined') return;

  function safe(x) {
    return (x == null ? '' : String(x)).trim();
  }

  function lowerSafe(x) {
    return safe(x).toLowerCase();
  }

  /**
   * Read the active filter snapshot from current DOM state.
   * Returns the same shape that filters.js / app.js use, so the explainer
   * can describe exactly the rule that admitted this program.
   */
  function readFilterSnapshot() {
    const get = (id) => document.getElementById(id);
    const q = get('q');
    const loc = get('loc');
    const age = get('age');
    const care = get('care');
    const insurance = get('insurance');
    const onlyVirtual = get('onlyVirtual');
    const showCrisis = get('showCrisis');
    const serviceDomain = get('serviceDomain');
    const verificationRecency = get('verificationRecency');

    return {
      query: q ? safe(q.value) : '',
      location: loc ? safe(loc.value) : '',
      age: age ? safe(age.value) : '',
      care: care ? safe(care.value) : '',
      insurance: insurance ? safe(insurance.value) : '',
      onlyVirtual: !!(onlyVirtual && onlyVirtual.checked),
      showCrisis: !!(showCrisis && showCrisis.checked),
      serviceDomain: serviceDomain ? safe(serviceDomain.value) : '',
      verificationRecency: verificationRecency ? safe(verificationRecency.value) : '',
    };
  }

  function describeCareMatch(program, filters) {
    const careFilter = filters.care;
    if (!careFilter) return null;
    const programCare = safe(program.level_of_care);
    if (!programCare) return null;
    if (lowerSafe(programCare) === lowerSafe(careFilter)) {
      return { key: 'care', label: 'Care level matched', detail: programCare };
    }
    return null;
  }

  function describeAgeMatch(program, filters) {
    if (!filters.age) return null;
    const ageNum = Number(filters.age);
    if (!Number.isFinite(ageNum)) return null;
    const served = safe(program.ages_served);
    if (!served) return null;
    const fn = window.programServesAge;
    if (typeof fn !== 'function') {
      return { key: 'age', label: 'Age filter applied', detail: `Filter: ${ageNum}, program serves: ${served}` };
    }
    const serves = fn(program, ageNum);
    if (serves === false) return null;
    return { key: 'age', label: 'Age range matched', detail: `Filter: ${ageNum}, program: ${served}` };
  }

  function describeLocationMatch(program, filters) {
    const locFilter = safe(filters.location);
    if (!locFilter) return null;
    const programLocations = Array.isArray(program.locations) ? program.locations : [];
    const cities = programLocations
      .map((l) => safe(l && l.city))
      .filter(Boolean);
    if (cities.length === 0) return null;
    const target = lowerSafe(locFilter);
    const matchCity = cities.find((c) => lowerSafe(c) === target || lowerSafe(c).includes(target));
    if (matchCity) {
      return { key: 'location', label: 'Location matched', detail: matchCity };
    }
    const virtualMatch = cities.find((c) => lowerSafe(c) === 'virtual');
    if (virtualMatch) {
      return { key: 'location', label: 'Virtual program serves your area', detail: 'Virtual / telehealth' };
    }
    return { key: 'location', label: 'Location filter applied', detail: locFilter };
  }

  function describeInsuranceMatch(program, filters) {
    const ins = safe(filters.insurance);
    if (!ins) return null;
    if (ins.startsWith('bucket:')) {
      const label = window.INSURANCE_BUCKETS && window.INSURANCE_BUCKETS[ins]
        ? window.INSURANCE_BUCKETS[ins].label
        : ins.replace('bucket:', '');
      return { key: 'insurance', label: 'Insurance filter matched', detail: label };
    }
    if (ins.startsWith('type:')) {
      return { key: 'insurance', label: 'Insurance filter matched', detail: ins.replace('type:', '') };
    }
    if (ins.startsWith('plan:')) {
      return { key: 'insurance', label: 'Insurance plan matched', detail: ins.replace('plan:', '') };
    }
    return { key: 'insurance', label: 'Insurance filter applied', detail: ins };
  }

  function describeDomainMatch(program, filters) {
    const domain = safe(filters.serviceDomain);
    if (!domain) return null;
    const domainsRaw = program.service_domains || program.service_domain;
    const domains = Array.isArray(domainsRaw) ? domainsRaw : domainsRaw ? [domainsRaw] : [];
    if (!domains.length) return null;
    const matches = domains.find((d) => lowerSafe(d) === lowerSafe(domain));
    if (matches) {
      const labels = {
        mental_health: 'Mental health',
        substance_use: 'Substance use',
        eating_disorders: 'Eating disorders',
      };
      return { key: 'domain', label: 'Service focus matched', detail: labels[domain] || domain };
    }
    return null;
  }

  function describeVirtualMatch(program, filters) {
    if (!filters.onlyVirtual) return null;
    const fn = window.hasVirtual;
    if (typeof fn === 'function' && fn(program)) {
      return { key: 'virtual', label: 'Virtual option available', detail: 'Telehealth or virtual service listed' };
    }
    return null;
  }

  function describeVerificationStatus(program) {
    const lastVerified = safe(program.last_verified || (program.verification && program.verification.last_verified_at));
    if (!lastVerified) {
      return { key: 'verification', label: 'Verification status', detail: 'No verification date listed', tone: 'warn' };
    }
    const fn = window.getVerificationFreshness;
    const freshness = typeof fn === 'function' ? fn(lastVerified) : null;
    if (freshness === 'recent') {
      return { key: 'verification', label: 'Verification status', detail: `Recently verified (${lastVerified})`, tone: 'ok' };
    }
    if (freshness === 'fresh') {
      return { key: 'verification', label: 'Verification status', detail: `Verified within 90 days (${lastVerified})`, tone: 'ok' };
    }
    if (freshness === 'stale') {
      return { key: 'verification', label: 'Verification status', detail: `Over 90 days since verification (${lastVerified})`, tone: 'warn' };
    }
    return { key: 'verification', label: 'Verification status', detail: lastVerified, tone: 'neutral' };
  }

  /**
   * Build the explainer rows for a single program given the current filters.
   * Returns an ordered list of { key, label, detail, tone? }.
   */
  function explainMatch(program, filtersOverride) {
    const filters = filtersOverride || readFilterSnapshot();
    const rows = [];
    const tryPush = (row) => {
      if (row) rows.push(row);
    };
    tryPush(describeCareMatch(program, filters));
    tryPush(describeAgeMatch(program, filters));
    tryPush(describeLocationMatch(program, filters));
    tryPush(describeDomainMatch(program, filters));
    tryPush(describeInsuranceMatch(program, filters));
    tryPush(describeVirtualMatch(program, filters));
    // Verification always shown — it is operational, not a match score
    tryPush(describeVerificationStatus(program));
    return rows;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Build the HTML block for a card. Caller decides where to insert.
   * Returns '' if there is nothing meaningful to show.
   */
  function renderMatchExplainHtml(program, filtersOverride) {
    const rows = explainMatch(program, filtersOverride);
    if (!rows.length) return '';
    const hasFilterRow = rows.some((r) => r.key !== 'verification');
    if (!hasFilterRow) {
      // Only verification — show a compact single-line explainer
      const v = rows.find((r) => r.key === 'verification');
      const tone = v && v.tone ? ` match-why__row--${v.tone}` : '';
      return `<div class="match-why" role="note" aria-label="Why this result appears">
        <p class="match-why__title">Why this result appears</p>
        <p class="match-why__plain">No filters applied. Showing all programs.</p>
        <ul class="match-why__list">
          <li class="match-why__row${tone}"><span class="match-why__label">${escapeHtml(v.label)}:</span> <span class="match-why__detail">${escapeHtml(v.detail)}</span></li>
        </ul>
      </div>`;
    }
    return `<div class="match-why" role="note" aria-label="Why this result appears">
      <p class="match-why__title">Why this result appears</p>
      <ul class="match-why__list">
        ${rows.map((r) => {
          const tone = r.tone ? ` match-why__row--${r.tone}` : '';
          return `<li class="match-why__row${tone}"><span class="match-why__label">${escapeHtml(r.label)}:</span> <span class="match-why__detail">${escapeHtml(r.detail)}</span></li>`;
        }).join('')}
      </ul>
    </div>`;
  }

  window.VMHRMatchExplain = {
    explainMatch,
    renderMatchExplainHtml,
    readFilterSnapshot,
  };
})();
