// ========== Rendering Module ==========
// Centralized rendering functions for UI components
// This module handles card rendering, modals, toasts, and other UI updates

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
 * @returns {HTMLElement} Card element
 */
function createCard(program, idx, options) {
  const { els, state, isFavorite, comparisonSet, programDataMap } = options;
  
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
  const id = stableIdFor(program, idx);
  programDataMap.set(id, program);
  const isOpen = (state.getOpenId() === id);

  const phone = safeStr(program.phone);
  const tel = normalizePhoneForTel(phone);
  const maps = mapsLinkFor(program);

  const website = safeUrl(program.website_url || program.website || "");
  const websiteDomain = website ? (safeStr(program.website_domain) || domainFromUrl(website)) : "";

  const addresses = (Array.isArray(program.locations) ? program.locations : [])
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
        <span class="badge-icon">✓</span>
        <span>Currently Accepting Patients</span>
      </div>
    `;
  } else if(waitlist === 'long' || waitlist === 'moderate') {
    availabilityBadge = `
      <div class="availability-badge limited">
        <span class="badge-icon">⏱️</span>
        <span>Limited Availability - ${waitlist.charAt(0).toUpperCase() + waitlist.slice(1)} Waitlist</span>
      </div>
    `;
  }

  const div = document.createElement("article");
  div.className = "card";
  div.dataset.open = isOpen ? "true" : "false";
  div.setAttribute("data-id", id);

  // Check if verified within 60 days
  let isRecent = false;
  if(lastVerified) {
    const date = new Date(lastVerified);
    const now = new Date();
    const daysSince = (now - date) / (1000 * 60 * 60 * 24);
    if(daysSince < 60) {
      div.dataset.recent = "true";
      isRecent = true;
    }
  }

  const userLocation = state.getUserLocation();
  const currentSort = state.getCurrentSort();

  div.innerHTML = `
    <div class="card-meta-header">
      <div class="badgeRow">
        <span class="badge ${crisis ? "crisis" : ""}">${escapeHtml(care)}</span>
        <span class="badge ${crisis ? "crisis" : "loc"}">${escapeHtml(loc)}</span>
        ${hasVirtual(program) ? `<span class="badge ${crisis ? "crisis" : "loc2"}">Virtual option</span>` : ``}
        ${userLocation && currentSort === 'distance' && typeof window.calculateProgramDistance === 'function' ? (() => {
          const distance = window.calculateProgramDistance(program, userLocation.lat, userLocation.lng);
          if (distance !== null && distance !== Infinity) {
            return `<span class="badge distance-badge">${distance.toFixed(1)} mi</span>`;
          }
          return '';
        })() : ''}
        ${isRecent ? `<span class="badge recent">Recently Updated</span>` : ''}
      </div>
    </div>

    <div class="cardTop">
      <div style="min-width:0">
        <p class="pname">${escapeHtml(safeStr(program.program_name) || "Program")}</p>
        <p class="org">${escapeHtml(safeStr(program.organization) || "")}</p>
      </div>

      <button class="expandBtn" type="button"
        aria-expanded="${isOpen ? "true" : "false"}"
        aria-controls="panel_${escapeHtml(id)}"
        title="${isOpen ? "Collapse details" : "Expand details"}">
        <span class="chev" aria-hidden="true"></span>
      </button>
    </div>

    <div class="meta">
      <span>Age: ${escapeHtml(safeStr(program.ages_served) || "Unknown")}</span>
      <span>Setting: ${escapeHtml(safeStr(program.service_setting) || "Unknown")}</span>
    </div>

    ${availabilityBadge}

    <div class="card-actions">
      <button type="button" class="card-action-btn favorite ${isFavorite(id) ? 'active' : ''}" data-favorite="${escapeHtml(id)}" aria-label="${isFavorite(id) ? 'Remove from saved' : 'Save program'}">
        <span class="icon">${isFavorite(id) ? '⭐' : '☆'}</span>
        <span>${isFavorite(id) ? 'Saved' : 'Save'}</span>
      </button>
      <button type="button" class="card-action-btn" data-share="${escapeHtml(id)}" aria-label="Share program">
        <span class="icon">🔗</span>
        <span>Share</span>
      </button>
      <label class="card-action-btn compare-btn ${comparisonSet.has(id) ? 'active' : ''}" ${comparisonSet.size >= 3 && !comparisonSet.has(id) ? 'style="opacity: 0.5; cursor: not-allowed;"' : ''}>
        <input type="checkbox" data-compare="${escapeHtml(id)}" ${comparisonSet.has(id) ? 'checked' : ''} ${comparisonSet.size >= 3 && !comparisonSet.has(id) ? 'disabled' : ''} aria-label="Add to comparison" style="display: none;" />
        <span class="icon">⚖️</span>
        <span>${comparisonSet.has(id) ? 'Comparing' : 'Compare'}</span>
      </label>
    </div>

    <div class="accuracyStrip">${escapeHtml(accuracyLine)}</div>

    <div class="panel" id="panel_${escapeHtml(id)}">
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
            <a class="siteLink" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">
              Visit website <span aria-hidden="true">↗</span>
            </a>
            ${websiteDomain ? `<span class="siteDomain">${escapeHtml(websiteDomain)}</span>` : ``}
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
        <a class="linkBtn" href="program.html?id=${escapeHtml(safeStr(program.program_id))}" style="margin-right: 8px;">View Details</a>
        ${tel ? `<a class="linkBtn ${crisis ? "danger" : "primary"}" href="tel:${escapeHtml(tel)}" data-program-id="${escapeHtml(id)}">Call Now</a>` : ``}
        ${maps ? `<a class="linkBtn" href="${escapeHtml(maps)}" target="_blank" rel="noopener">Directions</a>` : ``}
        ${(!tel && !maps) ? `<span style="color:var(--muted);font-size:13px;font-weight:700;">No quick actions available for this listing.</span>` : ``}
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
  
  els.programCount.textContent = programs.length;
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
      const tel = normalizePhoneForTel(phone);
      return tel ? `<a href="tel:${escapeHtml(tel)}" class="comparison-link">${escapeHtml(phone)}</a>` : escapeHtml(phone);
    }, isHtml: true },
    { label: 'Website', getValue: (p) => {
      const url = safeUrl(p.website_url || p.website || '');
      if (!url) return '—';
      const domain = domainFromUrl(url) || url;
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="comparison-link">${escapeHtml(domain)} <span aria-hidden="true">↗</span></a>`;
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
  
  let html = '<div class="comparison-table-wrapper"><table class="comparison-table"><thead><tr><th class="comparison-label-header">Field</th>';
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
function showModal(modalEl) {
  // Set aria-hidden to false FIRST to avoid accessibility violation
  // This must happen before any focusable elements can receive focus
  modalEl.setAttribute('aria-hidden', 'false');
  
  // Lock body scroll - use both class and inline style for maximum compatibility
  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
  // Store scroll position for restoration
  const scrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
  
  // Focus management: Focus first focusable element after aria-hidden is set and CSS transition starts
  // Use double requestAnimationFrame to ensure CSS visibility transition has started
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const firstFocusable = modalEl.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (firstFocusable && typeof firstFocusable.focus === 'function') {
        firstFocusable.focus();
      }
    });
  });
}

/**
 * Hide modal
 * @param {HTMLElement} modalEl - Modal element
 */
function hideModal(modalEl) {
  // Blur any focused elements inside modal FIRST to avoid accessibility violation
  // This must happen before setting aria-hidden="true"
  const focusedElement = modalEl.querySelector(':focus');
  if (focusedElement && typeof focusedElement.blur === 'function') {
    focusedElement.blur();
  }
  
  // Set aria-hidden to true to hide from assistive technology
  modalEl.setAttribute('aria-hidden', 'true');
  
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
}

// For non-module environments
if (typeof window !== 'undefined') {
  window.createCard = createCard;
  window.renderSkeletons = renderSkeletons;
  window.updateStats = updateStats;
  window.renderComparison = renderComparison;
  window.showToast = showToast;
  window.showModal = showModal;
  window.hideModal = hideModal;
}

