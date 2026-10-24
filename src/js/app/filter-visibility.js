import { state } from './state.js?v=1';
import { els, refreshEls, readSearchQuery } from './dom.js?v=1';
import { render } from './render-hook.js?v=1';
import { syncTopToggles, syncChipsToSelect } from './filter-sync.js?v=1';
import { updateURLState } from './url-state.js?v=1';

// Apply feature flags to UI - enforces "no-clutter" by hiding filters when flags are disabled
function applyFeatureFlagsToUI() {
  const flags = window.FEATURE_FLAGS || {};
  
  // County filter group - only visible when STATEWIDE_MODE is enabled
  const countyGroup = document.getElementById('countyFilterGroup');
  if (countyGroup) {
    if (!flags.STATEWIDE_MODE) {
      countyGroup.style.display = 'none';
      // Reset county filter value to avoid accidental filtering
      const countySelect = document.getElementById('county');
      if (countySelect) countySelect.value = '';
    }
  }
  
  // Service domain and SUD services filters - only visible when SHOW_SUD_FILTERS is enabled
  if (!flags.SHOW_SUD_FILTERS) {
    const serviceDomainGroup = document.getElementById('serviceDomainFilterGroup');
    if (serviceDomainGroup) {
      serviceDomainGroup.style.display = 'none';
      const serviceDomainSelect = document.getElementById('serviceDomain');
      if (serviceDomainSelect) serviceDomainSelect.value = '';
    }
    
    const sudServicesGroup = document.getElementById('sudServicesFilterGroup');
    if (sudServicesGroup) {
      sudServicesGroup.style.display = 'none';
      const sudServicesSelect = document.getElementById('sudServices');
      if (sudServicesSelect) {
        // Clear all selected options
        Array.from(sudServicesSelect.options).forEach(opt => opt.selected = false);
        state.selectedSudServices = [];
        syncChipsToSelect('sudServices');
      }
    }
  }
  
  // Verification filter - only visible when SHOW_VERIFICATION_FILTERS is enabled
  const verificationGroup = document.getElementById('verificationFilterGroup');
  if (verificationGroup) {
    if (!flags.SHOW_VERIFICATION_FILTERS) {
      verificationGroup.style.display = 'none';
      const verificationSelect = document.getElementById('verificationRecency');
      if (verificationSelect) verificationSelect.value = '';
    }
  }
  
  // Update active filter chips after applying flags
  if (typeof updateActiveFilterChips === 'function') {
    updateActiveFilterChips();
  }
}

// Update filter UI visibility based on availableFilters AND feature flags
function updateFilterVisibility() {
  const extendedSection = document.getElementById('statewideFiltersSection');
  if (!extendedSection) return;
  
  const flags = window.FEATURE_FLAGS || {};
  
  // Check if any advanced filter is available AND enabled by feature flags
  const hasAnyAdvancedFilter = 
    (flags.STATEWIDE_MODE && state.availableFilters.hasCounty) ||
    (flags.SHOW_SUD_FILTERS && (state.availableFilters.hasServiceDomains || state.availableFilters.hasSUD)) ||
    (flags.SHOW_VERIFICATION_FILTERS && state.availableFilters.hasVerification) ||
    state.availableFilters.hasServiceArea; // Service area is always available if present
  
  extendedSection.style.display = hasAnyAdvancedFilter ? 'block' : 'none';
  
  // Show/hide individual filter groups (respect both data availability and feature flags)
  const countyGroup = document.getElementById('countyFilterGroup');
  if (countyGroup) {
    countyGroup.style.display = (flags.STATEWIDE_MODE && state.availableFilters.hasCounty) ? 'block' : 'none';
  }
  
  const serviceDomainGroup = document.getElementById('serviceDomainFilterGroup');
  if (serviceDomainGroup) {
    serviceDomainGroup.style.display = (flags.SHOW_SUD_FILTERS && (state.availableFilters.hasServiceDomains || state.availableFilters.hasSUD)) ? 'block' : 'none';
  }
  
  // Substance Use Services filter - only visible when:
  // 1. Feature flag allows it (SHOW_SUD_FILTERS)
  // 2. Data has SUD services (availableFilters.hasSUD)
  // 3. Service Type is set to "substance_use" (not co-occurring or mental_health)
  const sudServicesGroup = document.getElementById('sudServicesFilterGroup');
  if (sudServicesGroup) {
    const isSubstanceUseSelected = els.serviceDomain && els.serviceDomain.value === 'substance_use';
    const shouldShow = flags.SHOW_SUD_FILTERS && state.availableFilters.hasSUD && isSubstanceUseSelected;
    
    if (shouldShow) {
      sudServicesGroup.style.display = 'block';
    } else {
      sudServicesGroup.style.display = 'none';
      // Clear selections when hiding
      if (els.sudServices) {
        Array.from(els.sudServices.options).forEach(opt => opt.selected = false);
        state.selectedSudServices = [];
        syncChipsToSelect('sudServices');
      }
    }
  }
  
  const verificationGroup = document.getElementById('verificationFilterGroup');
  if (verificationGroup) {
    verificationGroup.style.display = (flags.SHOW_VERIFICATION_FILTERS && state.availableFilters.hasVerification) ? 'block' : 'none';
  }
  
  // Apply feature flags to ensure disabled filters are hidden and cleared
  applyFeatureFlagsToUI();
}

// Update active filter chips display (respects feature flags)
function updateActiveFilterChips() {
  const container = document.getElementById('activeFiltersContainer');
  const chipsContainer = document.getElementById('activeFiltersChips');
  if (!container || !chipsContainer) return;
  
  const flags = window.FEATURE_FLAGS || {};
  const activeFilters = [];

  if (typeof window.getEffectiveSearchFilters === 'function') {
    const { chips } = window.getEffectiveSearchFilters(readSearchQuery(), {
      location: els.loc?.value || '',
      age: els.age?.value || '',
      care: els.care?.value || '',
      insurance: els.insurance?.value || '',
      onlyVirtual: els.onlyVirtual?.checked || false,
      showCrisis: els.showCrisis?.checked || false,
    }, {
      parseSmartSearch: window.parseSmartSearch,
      getTextSearchTerms: window.getTextSearchTerms,
      safeStr,
    });

    chips.forEach((chip, idx) => {
      activeFilters.push({
        type: chip.type || `search-${idx}`,
        label: chip.label,
      });
    });
  }
  
  // County filter - only show if STATEWIDE_MODE is enabled
  if (flags.STATEWIDE_MODE && els.county && els.county.value) {
    activeFilters.push({
      type: 'county',
      label: `County: ${els.county.options[els.county.selectedIndex]?.text || els.county.value}`,
      removeFn: () => {
        els.county.value = '';
        state.selectedCounty = null;
        if (typeof window.scheduleRenderFn === 'function') window.scheduleRenderFn();
        else render();
      }
    });
  }
  
  // Service domain filter - only show if SHOW_SUD_FILTERS is enabled
  if (flags.SHOW_SUD_FILTERS && els.serviceDomain && els.serviceDomain.value) {
    const domainLabels = {
      'mental_health': 'Mental Health',
      'substance_use': 'Substance Use',
      'co_occurring': 'Co-occurring',
      'eating_disorders': 'Eating Disorders'
    };
    activeFilters.push({
      type: 'serviceDomain',
      label: `Service Type: ${domainLabels[els.serviceDomain.value] || els.serviceDomain.value}`,
      removeFn: () => {
        els.serviceDomain.value = '';
        state.selectedServiceDomains = [];
        if (typeof window.scheduleRenderFn === 'function') window.scheduleRenderFn();
        else render();
      }
    });
  }
  
  // SUD services filter (multi-select) - only show if SHOW_SUD_FILTERS is enabled
  if (flags.SHOW_SUD_FILTERS && els.sudServices) {
    const selectedOptions = Array.from(els.sudServices.selectedOptions);
    if (selectedOptions.length > 0) {
      const sudLabels = {
        'detox': 'Detox',
        'otp': 'OTP',
        'moud': 'MOUD',
        'residential_sud': 'Residential',
        'outpatient_sud': 'Outpatient',
        'iop_sud': 'IOP',
        'php_sud': 'PHP',
        'osar_referral': 'OSAR Referral'
      };
      const labels = selectedOptions.map(opt => sudLabels[opt.value] || opt.value).join(', ');
      activeFilters.push({
        type: 'sudServices',
        label: `Substance Use Services: ${labels}`,
        removeFn: () => {
          Array.from(els.sudServices.options).forEach(opt => opt.selected = false);
          state.selectedSudServices = [];
          syncChipsToSelect('sudServices');
          if (typeof window.scheduleRenderFn === 'function') window.scheduleRenderFn();
          else render();
        }
      });
    }
  }
  
  // Verification recency filter - only show if SHOW_VERIFICATION_FILTERS is enabled
  if (flags.SHOW_VERIFICATION_FILTERS && els.verificationRecency && els.verificationRecency.value) {
    const recencyLabels = {
      '30': 'Last 30 days',
      '90': 'Last 90 days',
      '180': 'Last 180 days'
    };
    activeFilters.push({
      type: 'verificationRecency',
      label: `Verified: ${recencyLabels[els.verificationRecency.value] || els.verificationRecency.value}`,
      removeFn: () => {
        els.verificationRecency.value = '';
        state.verificationRecencyDays = null;
        if (typeof window.scheduleRenderFn === 'function') window.scheduleRenderFn();
        else render();
      }
    });
  }
  
  // Show/hide container and render chips (with optional exit animation)
  const renderChipDom = () => {
    if (activeFilters.length > 0) {
      container.style.display = 'flex';

      chipsContainer.innerHTML = activeFilters.map((filter, idx) => {
        const chipId = `filter-chip-${filter.type}-${idx}`;
        return `
        <div class="active-filter-chip" role="listitem" id="${chipId}" style="--chip-i: ${idx}">
          <span class="active-filter-chip-label">${escapeHtml(filter.label)}</span>
          <button 
            type="button" 
            class="active-filter-chip-remove" 
            aria-label="Remove ${escapeHtml(filter.label)} filter"
            data-filter-type="${escapeHtml(filter.type)}"
            data-filter-index="${idx}"
            data-testid="remove-filter-${escapeHtml(filter.type)}"
            tabindex="0">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      `;
      }).join('');

      activeFilters.forEach((filter, idx) => {
        const btn = chipsContainer.querySelector(
          `.active-filter-chip-remove[data-filter-index="${idx}"]`
        );
        if (!btn) return;
        const chipType = filter.type;
        btn.addEventListener('click', () => clearActiveFilterChip(chipType));
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            clearActiveFilterChip(chipType);
          }
        });
      });
    } else {
      container.style.display = 'none';
      chipsContainer.innerHTML = '';
    }
  };

  if (window.flowMotion?.updateActiveFilterChipsWithMotion) {
    window.flowMotion.updateActiveFilterChipsWithMotion(chipsContainer, activeFilters, renderChipDom);
  } else {
    renderChipDom();
  }

  window.flowScroll?.updateFlowContextBar?.();
}

function clearActiveFilterChip(chipType) {
  refreshEls();

  if (els.q) {
    let next = els.q.value;
    if (typeof window.stripFilterFromQuery === 'function') {
      next = window.stripFilterFromQuery(next, chipType);
    } else if (chipType === 'query') {
      next = '';
    }
    els.q.value = next;
    delete els.q.dataset.exactMatch;
    delete els.q.dataset.matchType;
    window.flowMotion?.renderSearchQueryChips();
  }

  switch (chipType) {
    case 'location':
    case 'parsedLocation':
      if (els.loc) els.loc.value = '';
      break;
    case 'age':
    case 'parsedAge':
      if (els.age) els.age.value = '';
      break;
    case 'care':
    case 'parsedCare':
      if (els.care) els.care.value = '';
      break;
    case 'insurance':
    case 'parsedInsurance':
      if (els.insurance) els.insurance.value = '';
      break;
    case 'virtual':
      if (els.onlyVirtual) els.onlyVirtual.checked = false;
      break;
    case 'crisis':
    case 'parsedCrisis':
      if (els.showCrisis) els.showCrisis.checked = false;
      break;
    case 'parsedDomain':
      if (els.serviceDomain) {
        els.serviceDomain.value = '';
        state.selectedServiceDomains = [];
      }
      break;
    default:
      break;
  }
  if (typeof syncTopToggles === 'function') syncTopToggles();
  if (typeof updateURLState === 'function') updateURLState();
  if (typeof window.scheduleRenderFn === 'function') window.scheduleRenderFn();
  else render();
}

export { applyFeatureFlagsToUI, updateFilterVisibility, updateActiveFilterChips, clearActiveFilterChip };
