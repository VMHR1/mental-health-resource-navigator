// ========== Rendering Module ==========
// Centralized rendering functions for UI components
// This module handles card rendering, modals, toasts, and other UI updates

/**
 * Substance-use / co-occurring directory track (cross-listed alongside MH at same site).
 */
function isSubstanceUseTrackListing(program, safeStr) {
  const id = safeStr(program.program_id).toLowerCase();
  if (id.startsWith('substance-use')) return true;
  const raw = program.service_domains || program.service_domain;
  const domains = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return domains.some((d) => {
    const token = safeStr(d).toLowerCase();
    return token === 'substance_use' || token === 'co_occurring' || token === 'co-occurring';
  });
}

/**
 * Cross-listed pair: same org, city, and level of care, but separate MH vs SUD/co-occurring entries.
 * Returns the matching sibling program or null.
 */
function findCrossListedSibling(program, allPrograms, safeStr) {
  const list = allPrograms || [];
  const org = safeStr(program.organization).toLowerCase();
  const city = safeStr((program.locations || [])[0]?.city).toLowerCase();
  const care = safeStr(program.level_of_care).toLowerCase();
  if (!org || !city || !care || city === 'virtual' || city === 'multiple') return null;

  const selfIsSud = isSubstanceUseTrackListing(program, safeStr);

  for (const other of list) {
    if (other.program_id === program.program_id) continue;
    if (safeStr(other.organization).toLowerCase() !== org) continue;
    if (safeStr((other.locations || [])[0]?.city).toLowerCase() !== city) continue;
    if (safeStr(other.level_of_care).toLowerCase() !== care) continue;

    const otherIsSud = isSubstanceUseTrackListing(other, safeStr);
    if (selfIsSud === otherIsSud) continue;

    return other;
  }
  return null;
}

/**
 * Note only for intentional cross-listings (e.g. MH PHP + co-occurring PHP at same provider).
 */
function getRelatedListingNote(program, allPrograms, escapeHtml, safeStr) {
  const sibling = findCrossListedSibling(program, allPrograms, safeStr);
  if (!sibling) return '';

  const siblingName = safeStr(sibling.program_name) || safeStr(sibling.level_of_care);
  if (!siblingName) return '';

  return `<p class="listing-related-note">This provider also has a separate listing: <strong>${escapeHtml(siblingName)}</strong>. Confirm which program fits your needs when you call.</p>`;
}

/**
 * Create a program card element
 * @param {Object} program - Program data object
 * @param {number} idx - Index in the list
 * @param {Object} options - Rendering options
 * @param {Object} options.els - DOM element references
 * @param {Object} options.state - State accessors (openId, userLocation, currentSort)
 * @param {Function} options.isFavorite - Function to check if program is favorited
 * @param {Set} options.comparisonSet - Set of program IDs in comparison
 * @param {Map} options.programDataMap - Map of program IDs to program data
 * @param {Array} options.allPrograms - Full program list (for related-listing notes)
 * @returns {HTMLElement} Card element
 */
function createCard(program, idx, options) {
  const { els, state, isFavorite, comparisonSet, programDataMap, allPrograms } = options;
  
  // Helper functions are available via window.* from helpers.js
  const safeStr = window.safeStr || ((x) => (x ?? "").toString().trim());
  const escapeHtml = window.escapeHtml || ((s) => safeStr(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"));
  const isCrisis = window.isCrisis || ((p) => safeStr(p.entry_type).toLowerCase() === "crisis service");
  const locLabel = window.locLabel || ((p) => {
    const locs = Array.isArray(p.locations) ? p.locations : [];
    const first = locs[0] || {};
    const city = safeStr(first.city);
    const state = safeStr(first.state);
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    return "Location not listed";
  });
  const stableIdFor = window.stableIdFor || ((p, _i) => {
    const pid = safeStr(p.program_id);
    if (pid) return `p_${pid}`;
    const base = `${safeStr(p.program_name)}|${safeStr(p.organization)}|${locLabel(p)}|${safeStr(p.level_of_care)}|${safeStr(p.entry_type)}`.toLowerCase();
    let h = 2166136261;
    for (let k = 0; k < base.length; k++) {
      h ^= base.charCodeAt(k);
      h = Math.imul(h, 16777619);
    }
    return `p_${(h >>> 0).toString(16)}`;
  });
  const normalizePhoneForTel = window.normalizePhoneForTel || ((phone) => {
    const raw = safeStr(phone);
    if (!raw) return "";
    const plus = raw.trim().startsWith("+") ? "+" : "";
    const digits = raw.replace(/[^\d]/g, "");
    return (plus + digits);
  });
  const mapsLinkFor = window.mapsLinkFor || ((p) => {
    const locs = Array.isArray(p.locations) ? p.locations : [];
    const l = locs[0] || {};
    const parts = [safeStr(l.address), safeStr(l.city), safeStr(l.state), safeStr(l.zip)].filter(Boolean);
    const addr = parts.join(", ");
    if (!addr) return "";
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
  });
  const safeUrl = window.safeUrl || ((u) => {
    const s = safeStr(u);
    if (!s) return "";
    try {
      const parsed = new URL(s, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch (_) {}
    return "";
  });
  const domainFromUrl = window.domainFromUrl || ((url) => {
    try {
      const u = new URL(url);
      return (u.hostname || "").replace(/^www\./i, "");
    } catch (_) {
      return "";
    }
  });
  const hasVirtual = window.hasVirtual || ((p) => {
    const setting = safeStr(p.service_setting).toLowerCase();
    if (setting.includes("virtual") || setting.includes("tele")) return true;
    const locs = Array.isArray(p.locations) ? p.locations : [];
    return locs.some(l => safeStr(l.city).toLowerCase() === "virtual");
  });

  const crisis = isCrisis(program);
  const loc = locLabel(program);
  const care = safeStr(program.level_of_care) || "Not listed";
  const careFriendly = (() => {
    const c = care.toLowerCase();
    if (c.includes('intensive outpatient') || c === 'iop') return 'IOP — Intensive outpatient';
    if (c.includes('partial hospitalization') || c.includes('php')) return 'PHP — Day program';
    if (c.includes('residential')) return 'Residential — Live-in treatment';
    if (c.includes('outpatient')) return 'Outpatient — Regular appointments';
    if (c.includes('navigation')) return 'Care navigation';
    if (c.includes('inpatient')) return 'Inpatient — Hospital-based';
    return care;
  })();
  const settingLabel = hasVirtual(program) ? 'Virtual option available' : 'In-person';
  const ages = safeStr(program.ages_served) || 'Ask program';
  const id = stableIdFor(program, idx);
  programDataMap.set(id, program);
  const isOpen = (state.getOpenId() === id);

  const phone = safeStr(program.phone);
  const intakePhone = safeStr(program.intake_phone);
  const phoneLabels = program.phone_labels && typeof program.phone_labels === 'object' ? program.phone_labels : null;
  // Use intake_phone for the primary call action when listed; preserves existing behavior when absent
  const primaryPhone = intakePhone || phone;
  const primaryPhoneLabel = (() => {
    if (intakePhone) return 'Intake';
    if (phoneLabels && phoneLabels.main) return safeStr(phoneLabels.main);
    return '';
  })();
  const phoneDigits = primaryPhone ? normalizePhoneForTel(primaryPhone) : "";
  const looksLikeShortcode = phoneDigits && phoneDigits.length <= 6;
  const mentionsText = /text/i.test(phone);
  const isCrisisTextLine = safeStr(program.program_id) === "crisis-textline-741741";
  
  // Determine if this should be SMS or tel link
  let phoneHref = "";
  let phoneLabel = "Call Now";
  if (phoneDigits) {
    if (looksLikeShortcode || mentionsText || isCrisisTextLine) {
      phoneHref = `sms:${phoneDigits}`;
      phoneLabel = "Text Now";
    } else {
      phoneHref = `tel:${phoneDigits}`;
      phoneLabel = primaryPhoneLabel ? `Call ${primaryPhoneLabel.toLowerCase()}` : "Call Now";
    }
  }
  
  const maps = mapsLinkFor(program);

  const website = safeUrl(program.website_url || program.website || "");
  const websiteDomain = website ? (safeStr(program.website_domain) || domainFromUrl(website)) : "";
  const resolveVerificationUrl = window.resolveVerificationUrl || ((p) => {
    if (p.verification_source_url) {
      const url = safeUrl(p.verification_source_url);
      if (url) return url;
    }
    if (p.accepted_insurance && p.accepted_insurance.source_url) {
      const url = safeUrl(p.accepted_insurance.source_url);
      if (url) return url;
    }
    if (p.website_url || p.website) {
      const url = safeUrl(p.website_url || p.website);
      if (url) return url;
    }
    return "";
  });
  const verificationUrl = resolveVerificationUrl(program);

  // Only include locations with street addresses
  const addresses = (Array.isArray(program.locations) ? program.locations : [])
    .filter(l => safeStr(l.address)) // Skip locations without street address
    .map(l => [safeStr(l.address), safeStr(l.city), safeStr(l.state), safeStr(l.zip)].filter(Boolean).join(", "))
    .filter(Boolean);

  const verificationSource = safeStr(program.verification_source);
  const lastVerified = safeStr(program.last_verified);
  const accuracyLine = (verificationSource || lastVerified)
    ? `Source: ${verificationSource || "—"}${verificationSource && lastVerified ? " • " : ""}${lastVerified ? `Last verified: ${lastVerified}` : ""}`
    : `Verification info not provided for this listing. Please confirm details with the program directly.`;

  // Availability badge
  const waitlist = safeStr(program.waitlist_status).toLowerCase();
  const accepting = safeStr(program.accepting_new_patients).toLowerCase();
  
  let availabilityBadge = '';
  if(accepting === 'yes' && (waitlist === 'none' || waitlist === 'short')) {
    availabilityBadge = `
      <div class="availability-badge available">
        <span>May be accepting new patients — call to confirm</span>
      </div>
    `;
  } else if(waitlist === 'long' || waitlist === 'moderate') {
    availabilityBadge = `
      <div class="availability-badge limited">
        <span>Limited availability (${waitlist} waitlist) — call to confirm</span>
      </div>
    `;
  }

  const verifiedShort = lastVerified ? `Last verified: ${lastVerified}` : '';
  const callLabel = phoneLabel === 'Text Now' ? 'Text program' : 'Call program';

  const div = document.createElement("article");
  div.className = "card";
  div.dataset.open = isOpen ? "true" : "false";
  div.setAttribute("data-id", id);

  const verificationFreshness =
    typeof window.getVerificationFreshness === 'function'
      ? window.getVerificationFreshness(lastVerified)
      : 'missing';
  const isRecent = verificationFreshness === 'recent';
  const isStale = verificationFreshness === 'stale';
  if (verificationFreshness !== 'missing') {
    div.dataset.verificationFreshness = verificationFreshness;
  }
  if (isStale) {
    div.classList.add('card--verification-stale');
  }

  const userLocation = state.getUserLocation();
  const currentSort = state.getCurrentSort();

  const pidForUrl = safeStr(program.program_id);
  const detailPageHref =
    typeof window.programPublicPath === "function"
      ? window.programPublicPath(pidForUrl)
      : pidForUrl
        ? `/programs/${encodeURIComponent(pidForUrl)}.html`
        : "program.html";

  const programName = safeStr(program.program_name) || "Program";
  const expandLabel = isOpen
    ? `Collapse details for ${programName}`
    : `View details for ${programName}`;

  div.innerHTML = `
    <div class="cardTop">
      <div style="min-width:0">
        <h3 class="pname">${escapeHtml(safeStr(program.program_name) || "Program")}</h3>
        ${safeStr(program.organization) ? `<p class="org">${escapeHtml(safeStr(program.organization))}</p>` : ''}
      </div>
      <button class="expandBtn" type="button"
        aria-expanded="${isOpen ? "true" : "false"}"
        aria-controls="panel_${escapeHtml(id)}"
        aria-label="${escapeHtml(expandLabel)}"
        title="${isOpen ? "Collapse details" : "View details"}">
        <span class="chev" aria-hidden="true"></span>
      </button>
    </div>

    <div class="card-summary">
      <div class="badgeRow">
        <span class="badge ${crisis ? "crisis" : ""}">${escapeHtml(careFriendly)}</span>
        ${userLocation && currentSort === 'distance' && typeof window.calculateProgramDistance === 'function' ? (() => {
          const distance = window.calculateProgramDistance(program, userLocation.lat, userLocation.lng);
          if (distance !== null && distance !== Infinity) {
            return `<span class="badge distance-badge">${distance.toFixed(1)} mi</span>`;
          }
          return '';
        })() : ''}
        ${isRecent ? `<span class="badge recent">Recently verified</span>` : ''}
        ${isStale ? `<span class="badge stale-verification">Verification overdue</span>` : ''}
      </div>
      <p class="card-location-line">${escapeHtml(loc)} · ${escapeHtml(settingLabel)}</p>
      <p class="card-ages-line">Ages served: ${escapeHtml(ages)}</p>
      <p class="card-good-to-ask"><strong>Good to ask about:</strong> schedule, intake process, insurance, family involvement</p>
      ${verifiedShort ? `<p class="card-verified-line">${escapeHtml(verifiedShort)}.${isStale ? ' <strong>Over 90 days since verification—call to confirm details are current.</strong>' : ''} <a href="about.html#verification">What verified means</a>. Information may change—call to confirm.${isStale && pidForUrl ? ` <a class="stale-report-link" href="report-outdated.html?program_id=${encodeURIComponent(pidForUrl)}">Report outdated listing</a>` : ''}</p>` : `<p class="card-verified-line">Verification date not listed. <a href="about.html#verification">What verified means</a>. Call to confirm details.${pidForUrl ? ` <a class="stale-report-link" href="report-outdated.html?program_id=${encodeURIComponent(pidForUrl)}">Report outdated listing</a>` : ''}</p>`}
    </div>

    ${availabilityBadge}

    ${getRelatedListingNote(program, allPrograms, escapeHtml, safeStr)}

    <div class="card-primary-actions">
      ${phoneHref ? `<a class="linkBtn primary btn-call-program" href="${escapeHtml(phoneHref)}" data-program-id="${escapeHtml(id)}">${escapeHtml(callLabel)}</a>` : ''}
      <button class="linkBtn expand-details-btn" type="button" data-expand-id="${escapeHtml(id)}" aria-expanded="${isOpen ? "true" : "false"}">View details</button>
      <button type="button" class="card-action-btn favorite ${isFavorite(id) ? 'active' : ''}" data-favorite="${escapeHtml(id)}" aria-label="${isFavorite(id) ? 'Remove from saved' : 'Save program'}">
        <span>${isFavorite(id) ? 'Saved' : 'Save'}</span>
      </button>
    </div>

    <div class="card-actions">
      <button type="button" class="card-action-btn compare-btn ${comparisonSet.has(id) ? 'active' : ''}" data-compare="${escapeHtml(id)}" ${comparisonSet.size >= 3 && !comparisonSet.has(id) ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} aria-pressed="${comparisonSet.has(id) ? 'true' : 'false'}" aria-label="${comparisonSet.has(id) ? 'Remove from comparison' : 'Add to comparison'}">
        <span>${comparisonSet.has(id) ? 'Comparing' : 'Compare'}</span>
      </button>
      <button type="button" class="card-action-btn" data-share="${escapeHtml(id)}" aria-label="Share program">
        <span>Share</span>
      </button>
    </div>

    <div class="panel" id="panel_${escapeHtml(id)}" aria-hidden="${isOpen ? "false" : "true"}" ${!isOpen ? "inert" : ""}>
      <div class="panel__inner">
      ${addresses.length ? `
        <div class="kv">
          <div class="k">Address</div>
          <div class="v">${addresses.map(a=>`<div>${escapeHtml(a)}</div>`).join("")}</div>
        </div>
      ` : ``}

      <div class="kv">
        <div class="k">Type</div>
        <div class="v">${escapeHtml(safeStr(program.entry_type) || "Not listed")}</div>
      </div>
        <div class="kv">
        <div class="k">Insurance</div>
        <div class="v">${escapeHtml(safeStr(program.insurance_notes) || "Not listed — call to confirm")}</div>
      </div>

      ${website ? `
        <div class="kv">
          <div class="k">Website</div>
          <div class="v">
            <a class="siteLink" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(typeof window.newTabAccessibleLabel === 'function' ? window.newTabAccessibleLabel('Visit website') : 'Visit website (opens in new tab)')}">
              Visit website <span aria-hidden="true">↗</span>
            </a>
            ${websiteDomain ? `<span class="siteDomain">${escapeHtml(websiteDomain)}</span>` : ``}
          </div>
        </div>
      ` : ``}
      ${verificationUrl ? `
        <div class="kv">
          <div class="k"></div>
          <div class="v">
            <a class="verified-source" href="${escapeHtml(verificationUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(typeof window.newTabAccessibleLabel === 'function' ? window.newTabAccessibleLabel('Verified source') : 'Verified source (opens in new tab)')}">Verified source</a>
            ${lastVerified ? `<span class="last-verified"> • Last verified: ${escapeHtml(lastVerified)}</span>` : ``}
          </div>
        </div>
      ` : lastVerified ? `
        <div class="kv">
          <div class="k"></div>
          <div class="v">
            <span class="last-verified">Last verified: ${escapeHtml(lastVerified)}</span>
          </div>
        </div>
      ` : ``}
      <div class="kv">
        <div class="k">Transportation</div>
        <div class="v">${escapeHtml(safeStr(program.transportation_available) || "Not listed")}</div>
      </div>
      <div class="kv">
        <div class="k">Notes</div>
        <div class="v">${escapeHtml(safeStr(program.notes) || "—")}</div>
      </div>


      <div class="actions">
        <a class="linkBtn" href="${detailPageHref}" style="margin-right: 8px;">View Details</a>
        ${phoneHref ? `<a class="linkBtn ${crisis ? "danger" : "primary"}" href="${escapeHtml(phoneHref)}" data-program-id="${escapeHtml(id)}">${escapeHtml(phoneLabel)}</a>` : ``}
        ${maps ? `<a class="linkBtn" href="${escapeHtml(maps)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(typeof window.newTabAccessibleLabel === 'function' ? window.newTabAccessibleLabel('Directions') : 'Directions (opens in new tab)')}">Directions</a>` : ``}
        ${(!phoneHref && !maps) ? `<span style="color:var(--muted);font-size:13px;font-weight:700;">No quick actions available for this listing.</span>` : ``}
      </div>
      </div>
    </div>
  `;
  return div;
}

/**
 * Render loading skeletons
 * @param {Object} els - DOM element references
 */
function renderSkeletons(els) {
  if (!els || !els.treatmentGrid) return;
  const make = () => {
    const d = document.createElement("div");
    d.className = "skeleton";
    d.innerHTML = `<div class="shimmer"></div>`;
    return d;
  };
  els.treatmentGrid.innerHTML = "";
  for (let i=0; i<9; i++) els.treatmentGrid.appendChild(make());
  els.treatmentCount.textContent = "Loading…";
  els.treatmentEmpty.style.display = "none";
  els.totalCount.textContent = "…";
}

/**
 * Update statistics display
 * @param {Array} programs - Array of all programs
 * @param {Object} els - DOM element references
 * @param {Function} updateFavoritesCount - Function to update favorites count
 */
function updateStats(programs, els, updateFavoritesCount) {
  const safeStr = window.safeStr || ((x) => (x ?? "").toString().trim());
  
  const uniqueCities = new Set();
  programs.forEach(p => {
    (p.locations || []).forEach(l => {
      const city = safeStr(l.city);
      if(city && city.toLowerCase() !== 'virtual' && city.toLowerCase() !== 'multiple') uniqueCities.add(city);
    });
  });
  
  if (els.programCount) els.programCount.textContent = programs.length;
  updateFavoritesCount();
}

/**
 * Render comparison table
 * @param {Object} options - Rendering options
 * @param {Object} options.els - DOM element references
 * @param {Set} options.comparisonSet - Set of program IDs in comparison
 * @param {Map} options.programDataMap - Map of program IDs to program data
 */
function renderComparison(options) {
  const { els, comparisonSet, programDataMap } = options;
  
  // SECURITY AUDIT FIX: Add null check before DOM manipulation
  if (!els.comparisonList) {
    console.warn('Comparison list element not found');
    return;
  }

  if (comparisonSet.size === 0) {
    els.comparisonList.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">No programs selected for comparison. Check the "Compare" box on program cards to add them.</p>';
    return;
  }
  
  const comparisonPrograms = Array.from(comparisonSet).map(id => {
    return programDataMap.get(id);
  }).filter(p => p !== undefined);
  
  if (comparisonPrograms.length === 0) {
    els.comparisonList.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">Selected programs not found.</p>';
    return;
  }
  
  // Helper functions
  const safeStr = window.safeStr || ((x) => (x ?? "").toString().trim());
  const escapeHtml = window.escapeHtml || ((s) => safeStr(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"));
  const locLabel = window.locLabel || ((p) => {
    const locs = Array.isArray(p.locations) ? p.locations : [];
    const first = locs[0] || {};
    const city = safeStr(first.city);
    const state = safeStr(first.state);
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    return "Location not listed";
  });
  const normalizePhoneForTel = window.normalizePhoneForTel || ((phone) => {
    const raw = safeStr(phone);
    if (!raw) return "";
    const plus = raw.trim().startsWith("+") ? "+" : "";
    const digits = raw.replace(/[^\d]/g, "");
    return (plus + digits);
  });
  const safeUrl = window.safeUrl || ((u) => {
    const s = safeStr(u);
    if (!s) return "";
    try {
      const parsed = new URL(s, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch (_) {}
    return "";
  });
  const domainFromUrl = window.domainFromUrl || ((url) => {
    try {
      const u = new URL(url);
      return (u.hostname || "").replace(/^www\./i, "");
    } catch (_) {
      return "";
    }
  });
  
  // Create comparison table
  const fields = [
    { label: 'Program Name', getValue: (p) => safeStr(p.program_name), isHtml: false },
    { label: 'Organization', getValue: (p) => safeStr(p.organization), isHtml: false },
    { label: 'Level of Care', getValue: (p) => safeStr(p.level_of_care), isHtml: false },
    { label: 'Location', getValue: (p) => locLabel(p), isHtml: false },
    { label: 'Ages Served', getValue: (p) => safeStr(p.ages_served), isHtml: false },
    { label: 'Service Setting', getValue: (p) => safeStr(p.service_setting), isHtml: false },
    { label: 'Phone', getValue: (p) => {
      const phone = safeStr(p.phone);
      if (!phone) return '—';
      const phoneDigits = normalizePhoneForTel(phone);
      if (!phoneDigits) return escapeHtml(phone);
      const looksLikeShortcode = phoneDigits.length <= 6;
      const mentionsText = /text/i.test(phone);
      const isCrisisTextLine = safeStr(p.program_id) === "crisis-textline-741741";
      const href = (looksLikeShortcode || mentionsText || isCrisisTextLine) ? `sms:${phoneDigits}` : `tel:${phoneDigits}`;
      return `<a href="${escapeHtml(href)}" class="comparison-link">${escapeHtml(phone)}</a>`;
    }, isHtml: true },
    { label: 'Website', getValue: (p) => {
      const url = safeUrl(p.website_url || p.website || '');
      if (!url) return '—';
      const domain = domainFromUrl(url) || url;
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="comparison-link" aria-label="${escapeHtml(typeof window.newTabAccessibleLabel === 'function' ? window.newTabAccessibleLabel(domain) : domain + ' (opens in new tab)')}">${escapeHtml(domain)} <span aria-hidden="true">↗</span></a>`;
    }, isHtml: true },
    { label: 'Insurance', getValue: (p) => {
      const ins = p.accepted_insurance || {};
      const types = Array.isArray(ins.types) ? ins.types : [];
      const plans = Array.isArray(ins.plans) ? ins.plans : [];
      if (types.length > 0 || plans.length > 0) {
        const allItems = [...types, ...plans];
        if (allItems.length === 0) {
          return escapeHtml(safeStr(p.insurance_notes) || 'Unknown');
        }
        // Display all insurance items in a formatted list
        const itemsHtml = allItems.map(item => {
          const cleanItem = safeStr(item).trim();
          return cleanItem ? `<div class="comparison-insurance-item">${escapeHtml(cleanItem)}</div>` : '';
        }).filter(Boolean).join('');
        return `<div class="comparison-insurance-list">${itemsHtml}</div>`;
      }
      return escapeHtml(safeStr(p.insurance_notes) || 'Unknown');
    }, isHtml: true },
    { label: 'Accepting New Patients', getValue: (p) => safeStr(p.accepting_new_patients), isHtml: false },
    { label: 'Notes', getValue: (p) => safeStr(p.notes) || '—', isHtml: false }
  ];
  
  let html = '<div class="comparison-table-wrapper"><table class="comparison-table"><caption class="sr-only">Program comparison</caption><thead><tr><th class="comparison-label-header">Field</th>';
  comparisonPrograms.forEach((p) => {
    // Find the program ID from the comparisonSet
    const programId = Array.from(comparisonSet).find(id => programDataMap.get(id) === p);
    html += `<th class="comparison-program-header"><div class="comparison-header"><button type="button" class="remove-compare" data-remove="${escapeHtml(programId)}" aria-label="Remove from comparison">×</button><div class="comparison-header-content"><strong>${escapeHtml(safeStr(p.program_name))}</strong><br><span class="comparison-org">${escapeHtml(safeStr(p.organization))}</span></div></div></th>`;
  });
  html += '</tr></thead><tbody>';
  
  fields.forEach(field => {
    html += '<tr><td class="comparison-label">' + escapeHtml(field.label) + '</td>';
    comparisonPrograms.forEach(p => {
      const value = field.getValue(p);
      html += '<td class="comparison-value">' + (field.isHtml ? value : escapeHtml(value)) + '</td>';
    });
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  els.comparisonList.innerHTML = html;
  
  // SECURITY AUDIT FIX: Use event delegation instead of adding listeners per button
  // This prevents listener accumulation if renderComparison() is called multiple times
  // Event delegation is handled at document level in events.js
}

/**
 * Show toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type ('success', 'error', etc.)
 * @param {HTMLElement} toastEl - Toast element
 */
function showToast(message, type = 'success', toastEl) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.className = `toast ${type} show`;
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, type === 'error' ? 5000 : 3000);
}

/**
 * Show modal
 * @param {HTMLElement} modalEl - Modal element
 */
const modalA11yState = new WeakMap();

function getModalFocusables(modalEl) {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return [...modalEl.querySelectorAll(selector)].filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return !el.closest('[hidden]');
  });
}

function installModalFocusTrap(modalEl) {
  const state = modalA11yState.get(modalEl) || {};
  state.trigger = document.activeElement;

  state.onKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const focusables = getModalFocusables(modalEl);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  modalEl.addEventListener('keydown', state.onKeyDown);
  modalA11yState.set(modalEl, state);
}

function removeModalFocusTrap(modalEl) {
  const state = modalA11yState.get(modalEl);
  if (state?.onKeyDown) {
    modalEl.removeEventListener('keydown', state.onKeyDown);
  }
  const trigger = state?.trigger || null;
  modalA11yState.delete(modalEl);
  return trigger;
}

function showModal(modalEl) {
  // Set aria-hidden to false FIRST to avoid accessibility violation
  // This must happen before any focusable elements can receive focus
  modalEl.setAttribute('aria-hidden', 'false');
  modalEl.setAttribute('aria-modal', 'true');
  installModalFocusTrap(modalEl);
  
  // Lock body scroll - use both class and inline style for maximum compatibility
  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
  // Store scroll position for restoration
  const scrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
  
  // Focus management: Focus close button or first focusable after reveal
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const closeBtn = modalEl.querySelector('.modal-close');
      const focusTarget = closeBtn || getModalFocusables(modalEl)[0];
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus();
      }
    });
  });
}

/**
 * Hide modal
 * @param {HTMLElement} modalEl - Modal element
 */
function hideModal(modalEl) {
  const trigger = removeModalFocusTrap(modalEl);

  // Blur any focused elements inside modal FIRST to avoid accessibility violation
  // This must happen before setting aria-hidden="true"
  const focusedElement = modalEl.querySelector(':focus');
  if (focusedElement && typeof focusedElement.blur === 'function') {
    focusedElement.blur();
  }
  
  // Set aria-hidden to true to hide from assistive technology
  modalEl.setAttribute('aria-hidden', 'true');
  modalEl.setAttribute('aria-modal', 'false');
  
  // Restore body scroll
  const scrollY = document.body.style.top;
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  // Restore scroll position
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }

  if (trigger && typeof trigger.focus === 'function') {
    requestAnimationFrame(() => trigger.focus());
  }
}

export {
  createCard,
  renderSkeletons,
  updateStats,
  renderComparison,
  showToast,
  showModal,
  hideModal,
};

// For classic-script (non-module) consumers not yet converted
if (typeof window !== 'undefined') {
  // Create stable namespace that won't be overwritten
  window.__vmhr = window.__vmhr || {};
  window.__vmhr.renderSkeletons = renderSkeletons;
  
  // Keep window.renderSkeletons for backward compatibility
  window.createCard = createCard;
  window.renderSkeletons = renderSkeletons;
  window.updateStats = updateStats;
  window.renderComparison = renderComparison;
  window.showToast = showToast;
  window.showModal = showModal;
  window.hideModal = hideModal;
}

