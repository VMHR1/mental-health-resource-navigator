import { state } from './state.js?v=1';
import { els, readSearchQuery } from './dom.js?v=1';
import { render } from './render-hook.js?v=1';
import { setCardOpen } from './card-management.js?v=1';
import { syncTopToggles, syncChipsToSelect } from './filter-sync.js?v=1';

// ========== URL State Management ==========
function updateURLState() {
  const params = new URLSearchParams();
  
  // Add search query
  const searchQ = readSearchQuery();
  if (searchQ) {
    params.set('q', searchQ);
  }
  
  // Add location
  if (els.loc && els.loc.value) {
    params.set('loc', els.loc.value);
  }
  
  // Add age
  if (els.age && els.age.value) {
    params.set('age', els.age.value);
  }
  
  // Add level of care
  if (els.care && els.care.value) {
    params.set('care', els.care.value);
  }
  
  // Add insurance
  if (els.insurance && els.insurance.value) {
    params.set('insurance', els.insurance.value);
  }
  
  // Add toggles
  if (els.showCrisis && els.showCrisis.checked) {
    params.set('crisis', '1');
  }
  if (els.onlyVirtual && els.onlyVirtual.checked) {
    params.set('virtual', '1');
  }
  
  // Add sort
  const SORT_OPTIONS = window.SORT_OPTIONS || { RELEVANCE: 'relevance' };
  if (state.currentSort && state.currentSort !== SORT_OPTIONS.RELEVANCE) {
    params.set('sort', state.currentSort);
  }
  
  // Update URL without reload
  const newURL = params.toString() 
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
  window.history.replaceState({ filters: params.toString() }, '', newURL);
}

function loadURLState() {
  const params = new URLSearchParams(window.location.search);

  // Preset shortcut: when present, apply the preset config and skip granular URL params
  // (preset applies an opinionated set; explicit params should be set via UI, not URL).
  if (params.has('preset')) {
    const presetId = params.get('preset');
    const presets = window.FILTER_PRESETS || {};
    const navigatorPresets = window.NAVIGATOR_PRESETS || {};
    if (presets[presetId]) {
      // TODO(ESM Session 6A): import from ./filter-presets.js once extracted; window bridge is the same function object.
      window.applyFilterPreset(presetId);
      return;
    }
    if (navigatorPresets[presetId] && window.VMHRNavigatorMode && typeof window.VMHRNavigatorMode.applyPreset === 'function') {
      window.VMHRNavigatorMode.applyPreset(presetId);
      return;
    }
    // Unknown preset — fall through to normal URL state
  }
  
  // Load search query
  if (params.has('q') && els.q) {
    const qValue = params.get('q');
    els.q.value = qValue;
    // Clear dataset attributes if q is empty or whitespace
    if (!qValue || !qValue.trim()) {
      delete els.q.dataset.exactMatch;
      delete els.q.dataset.matchType;
    }
  } else if (els.q) {
    // No 'q' parameter - ensure value is empty and clear dataset attributes
    els.q.value = '';
    delete els.q.dataset.exactMatch;
    delete els.q.dataset.matchType;
  }
  
  // Load location
  if (params.has('loc') && els.loc) {
    els.loc.value = params.get('loc');
  }
  
  // Load age
  if (params.has('age') && els.age) {
    els.age.value = params.get('age');
  }
  
  // Load level of care
  if (params.has('care') && els.care) {
    els.care.value = params.get('care');
  }
  
  // Load insurance
  if (params.has('insurance') && els.insurance) {
    els.insurance.value = params.get('insurance');
  }
  
  // Load toggles
  if (els.showCrisis) {
    els.showCrisis.checked = params.has('crisis');
  }
  if (els.onlyVirtual) {
    els.onlyVirtual.checked = params.has('virtual');
  }
  syncTopToggles();
  
  // Load sort
  if (params.has('sort') && els.sortSelect) {
    state.currentSort = params.get('sort');
    els.sortSelect.value = state.currentSort;
  }
  
  // Sync chips after loading URL state
  if (els.sudServices) {
    syncChipsToSelect('sudServices');
  }
  
  // Update Substance Use Services filter visibility based on service domain
  const sudServicesGroup = document.getElementById('sudServicesFilterGroup');
  if (sudServicesGroup && els.serviceDomain) {
    const isSubstanceUse = els.serviceDomain.value === 'substance_use';
    const flags = window.FEATURE_FLAGS || {};
    
    if (isSubstanceUse && flags.SHOW_SUD_FILTERS) {
      sudServicesGroup.style.display = 'block';
    } else {
      sudServicesGroup.style.display = 'none';
      // Clear selections if not substance_use
      if (els.sudServices && !isSubstanceUse) {
        Array.from(els.sudServices.options).forEach(opt => opt.selected = false);
        state.selectedSudServices = [];
        syncChipsToSelect('sudServices');
      }
    }
  }
}

// Handle URL parameters for shared programs
function handleURLParams() {
  const params = new URLSearchParams(window.location.search);
  let programId = params.get('program');
  
  // Load filter state from URL
  if (state.ready) {
    loadURLState();
  }
  
  // Validate and sanitize program ID from URL
  if (programId) {
    // Extract only valid program ID format (p_hex_numbers)
    const programIdMatch = programId.match(/p_[0-9a-f]+_\d+/);
    if (programIdMatch) {
      programId = programIdMatch[0];
    } else if (typeof window.sanitizeId === 'function') {
      // Fallback: sanitize the ID
      programId = window.sanitizeId(programId);
      if (programId !== params.get('program')) {
        if (typeof window.logSecurityEvent === 'function') {
          window.logSecurityEvent('suspicious_url_param', { original: params.get('program'), sanitized: programId });
        }
      }
    } else {
      // Basic sanitization
      programId = programId.replace(/[^a-zA-Z0-9_-]/g, '');
    }
  }
  
  if (programId && state.ready) {
    // Find and open the program
    state.programs.forEach((p, idx) => {
      const id = stableIdFor(p, idx);
      if (id === programId) {
        state.openId = id;
        render();
        setTimeout(() => {
          const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
          if (card) {
            setCardOpen(card, true);
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 500);
      }
    });
  }
}

export { updateURLState, loadURLState, handleURLParams };
