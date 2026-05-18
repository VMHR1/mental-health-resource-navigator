// ========== Event Handlers Module ==========
// Centralized event listener setup for the application
// This module handles all user interactions: search, filters, modals, keyboard shortcuts, etc.

/**
 * Setup all event handlers for the application
 * @param {Object} options - Configuration object
 * @param {Object} options.els - DOM element references
 * @param {Object} options.callbacks - Callback functions for various actions
 * @param {Object} options.state - State getters/setters
 */
function setupEventHandlers(options) {
  const { els, callbacks, state } = options;
  
  // Helper to safely add event listeners
  const on = (el, ev, fn) => {
    if (!el) return;
    el.addEventListener(ev, fn);
  };

  // Schedule render with requestAnimationFrame
  let raf = null;
  function scheduleRender() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      if (typeof window.refreshEls === 'function') window.refreshEls();
      state.setOpenId(null);
      callbacks.render();
      callbacks.updateURLState();
    });
  }
  
  // Make scheduleRender accessible globally (for external use)
  if (typeof window !== 'undefined') {
    window.scheduleRenderFn = scheduleRender;
  }

  // Debounced search with autocomplete
  let searchDebounce = null;
  let autocompleteDebounce = null;
  
  // Search input handler
  on(els.q, "input", (e) => {
    const query = els.q.value;
    
    // Clear dataset attributes if input is empty
    if (!query || !query.trim()) {
      delete els.q.dataset.exactMatch;
      delete els.q.dataset.matchType;
    }
    
    // Show autocomplete
    if (autocompleteDebounce) clearTimeout(autocompleteDebounce);
    autocompleteDebounce = setTimeout(() => {
      if (state.getReady()) {
        const suggestions = callbacks.generateAutocompleteSuggestions(query);
        callbacks.renderAutocomplete(suggestions);
      }
    }, 150);
    
    // Debounced search
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      if (typeof window.parseSmartSearch === 'function') {
        const parsed = window.parseSmartSearch(query);
        if (parsed.showCrisis && els.showCrisis && !els.showCrisis.checked) {
          els.showCrisis.checked = true;
          callbacks.syncTopToggles();
        }
      }
      callbacks.addRecentSearch(query);
      scheduleRender();
    }, 300);
  });
  
  on(els.q, "change", () => {
    callbacks.hideAutocomplete();
    callbacks.addRecentSearch(els.q.value);
    scheduleRender();
  });
  
  // Keyboard navigation for autocomplete
  on(els.q, "keydown", (e) => {
    // Get autocomplete state from callbacks
    const autocompleteVisible = callbacks.getAutocompleteVisible ? callbacks.getAutocompleteVisible() : false;
    const autocompleteSuggestions = callbacks.getAutocompleteSuggestions ? callbacks.getAutocompleteSuggestions() : [];
    const autocompleteSelectedIndex = callbacks.getAutocompleteSelectedIndex ? callbacks.getAutocompleteSelectedIndex() : -1;
    
    if (!autocompleteVisible || autocompleteSuggestions.length === 0) {
      // Allow '/' to focus search
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        els.q.focus();
      }
      return;
    }
    
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = autocompleteSelectedIndex < autocompleteSuggestions.length - 1 
        ? autocompleteSelectedIndex + 1 
        : 0;
      callbacks.setSelectedSuggestion(nextIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = autocompleteSelectedIndex > 0 
        ? autocompleteSelectedIndex - 1 
        : autocompleteSuggestions.length - 1;
      callbacks.setSelectedSuggestion(prevIndex);
    } else if (e.key === "Enter" && autocompleteSelectedIndex >= 0) {
      e.preventDefault();
      callbacks.selectSuggestion(autocompleteSelectedIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      callbacks.hideAutocomplete();
    }
  });
  
  // Hide autocomplete when clicking outside
  document.addEventListener("click", (e) => {
    const container = document.getElementById('search-suggestions');
    // Don't hide if clicking on suggestion items (they handle their own clicks)
    if (container && e.target.closest('.suggestion-item')) {
      return;
    }
    if (container && !container.contains(e.target) && e.target !== els.q) {
      callbacks.hideAutocomplete();
    }
  });
  
  // Filter change handlers
  on(els.loc, "change", scheduleRender);
  on(els.age, "change", scheduleRender);
  on(els.care, "change", scheduleRender);
  if (els.insurance) {
    on(els.insurance, "change", scheduleRender);
  }
  
  // Statewide filter handlers
  if (els.county) {
    on(els.county, "change", () => {
      state.setSelectedCounty(els.county.value || null);
      scheduleRender();
    });
  }
  
  if (els.serviceDomain) {
    on(els.serviceDomain, "change", () => {
      state.setSelectedServiceDomains(els.serviceDomain.value ? [els.serviceDomain.value] : []);
      
      // Show/hide Substance Use Services filter group based on service domain
      const sudServicesGroup = document.getElementById('sudServicesFilterGroup');
      const isSubstanceUse = els.serviceDomain.value === 'substance_use';
      
      if (sudServicesGroup) {
        if (isSubstanceUse) {
          // Show the group if feature flag allows
          const flags = window.FEATURE_FLAGS || {};
          if (flags.SHOW_SUD_FILTERS) {
            sudServicesGroup.style.display = 'block';
          }
        } else {
          // Hide the group and clear selections
          sudServicesGroup.style.display = 'none';
          
          // Clear all selected options
          if (els.sudServices) {
            Array.from(els.sudServices.options).forEach(opt => opt.selected = false);
            state.setSelectedSudServices([]);
            // Sync chips to reflect cleared state
            callbacks.syncChipsToSelect('sudServices');
            // Dispatch change event to trigger filter update
            els.sudServices.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
      
      scheduleRender();
    });
  }
  
  if (els.sudServices) {
    on(els.sudServices, "change", () => {
      // Get selected options from multi-select
      const selected = Array.from(els.sudServices.selectedOptions).map(opt => opt.value);
      state.setSelectedSudServices(selected);
      
      // Sync chip checkboxes to match select state
      callbacks.syncChipsToSelect('sudServices');
      
      // Auto-enable crisis toggle if OSAR referral is selected
      // (OSAR programs are crisis services and won't show without crisis toggle)
      if (selected.includes('osar_referral')) {
        els.showCrisis.checked = true;
        if (els.showCrisisTop) {
          els.showCrisisTop.checked = true;
        }
        callbacks.syncTopToggles();
      }
      
      scheduleRender();
    });
  }
  
  // Initialize chip-based multi-selects
  callbacks.initChipMultiSelects();
  
  if (els.verificationRecency) {
    on(els.verificationRecency, "change", () => {
      state.setVerificationRecencyDays(els.verificationRecency.value 
        ? parseInt(els.verificationRecency.value, 10) 
        : null);
      scheduleRender();
    });
  }
  
  // Sort functionality
  on(els.sortSelect, "change", (e) => {
    const newSort = e.target.value;
    // Distance sort requires location consent first — do not auto-revert via timeout
    if (newSort === 'distance') {
      state.setUserLocation(null);
      state.setCurrentSort('distance');
      callbacks.handleNearMeClick();
    } else {
      state.setCurrentSort(newSort);
    }
    scheduleRender();
    callbacks.updateURLState();
  });
  
  // Near Me button
  if (els.nearMeBtn) {
    on(els.nearMeBtn, "click", callbacks.handleNearMeClick);
  }
  
  // Stop sharing location button (TDPSA compliance: right to opt-out)
  if (els.stopLocationBtn) {
    on(els.stopLocationBtn, "click", callbacks.handleStopLocationSharing);
  }
  
  // Location consent modal handlers
  if (els.locationConsentAllow) {
    on(els.locationConsentAllow, "click", callbacks.handleLocationConsentAllow);
  }
  if (els.locationConsentCancel) {
    on(els.locationConsentCancel, "click", callbacks.handleLocationConsentCancel);
  }
  
  // Close location consent modal with close button
  if (els.locationConsentModal) {
    const closeBtn = els.locationConsentModal.querySelector('.modal-close');
    if (closeBtn) {
      on(closeBtn, "click", callbacks.handleLocationConsentCancel);
    }
  }
  
  // Handle browser back/forward buttons
  window.addEventListener('popstate', (e) => {
    if (state.getReady()) {
      callbacks.loadURLState();
      callbacks.render();
    }
  });

  on(els.showCrisisTop, "change", () => {
    els.showCrisis.checked = els.showCrisisTop.checked;
    scheduleRender();
    callbacks.syncTopToggles();
    const t = document.getElementById("treatmentSection");
    window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  });
  on(els.onlyVirtualTop, "change", () => { 
    els.onlyVirtual.checked = els.onlyVirtualTop.checked; 
    scheduleRender(); 
    callbacks.syncTopToggles(); 
  });

  function resetFilters() {
    if (typeof callbacks.clearAllFilters === 'function') {
      callbacks.clearAllFilters();
      return;
    }
    clearAllFiltersFallback();
  }

  function clearAllFiltersFallback() {
    els.q.value = '';
    delete els.q.dataset.exactMatch;
    delete els.q.dataset.matchType;
    els.loc.value = '';
    els.age.value = '';
    els.care.value = '';
    if (els.insurance) els.insurance.value = '';
    els.onlyVirtual.checked = false;
    els.showCrisis.checked = false;
    state.setSelectedCounty(null);
    state.setSelectedServiceDomains([]);
    state.setSelectedSudServices([]);
    state.setVerificationRecencyDays(null);
    if (els.county) els.county.value = '';
    if (els.serviceDomain) els.serviceDomain.value = '';
    if (els.sudServices) {
      Array.from(els.sudServices.options).forEach((opt) => {
        opt.selected = false;
      });
      callbacks.syncChipsToSelect('sudServices');
    }
    if (els.verificationRecency) els.verificationRecency.value = '';
    state.setOpenId(null);
    callbacks.syncTopToggles();
    callbacks.updateURLState();
    callbacks.render();
  }

  on(els.reset, 'click', resetFilters);
  if (els.resetTop) {
    on(els.resetTop, 'click', resetFilters);
  }

  on(els.viewAll, 'click', () => {
    resetFilters();
    const t = document.getElementById('treatmentSection');
    if (t) window.scrollTo({ top: t.offsetTop - 10, behavior: 'smooth' });
  });

  // Smart search
  on(els.smartSearchBtn, "click", () => {
    callbacks.hideAutocomplete(); // Close suggestions before search to prevent tap interception
    const query = els.q.value;
    // Use module function directly
    const parsed = typeof window.parseSmartSearch === 'function' 
      ? window.parseSmartSearch(query)
      : { loc: '', locs: [], age: '', minAge: null, care: '', showCrisis: false, organization: '' };
    
    // App-specific: Try to detect organization name from query
    if (state.getReady() && state.getPrograms().length > 0 && !parsed.loc && typeof window.parseSmartSearch === 'function') {
      const q = query.toLowerCase();
      const exactOrg = state.getPrograms().find(p => {
        const safeStr = window.safeStr || ((x) => (x ?? "").toString().trim());
        return safeStr(p.organization).toLowerCase() === q;
      });
      if (exactOrg) {
        parsed.organization = exactOrg.organization;
      }
    }
    
    if(parsed.loc) els.loc.value = parsed.loc;
    if(parsed.age) {
      els.age.value = parsed.age;
    }
    if(parsed.care) els.care.value = parsed.care;
    if (parsed.insurance && els.insurance) els.insurance.value = parsed.insurance;
    els.showCrisis.checked = parsed.showCrisis;
    
    // Apply service domain filter if detected
    if(parsed.serviceDomain && els.serviceDomain) {
      els.serviceDomain.value = parsed.serviceDomain;
    }
    
    callbacks.syncTopToggles();
    callbacks.render();
    
    const t = document.getElementById("treatmentSection");
    window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  });

  // Advanced filters toggle
  on(els.showAdvanced, "click", () => {
    const isHidden = els.advancedFilters.style.display === "none";
    els.advancedFilters.style.display = isHidden ? "block" : "none";
    els.showAdvanced.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    const label = els.showAdvanced.querySelector('.btn-advanced-label');
    if (label) {
      label.textContent = isHidden ? 'Hide filters' : 'More filters';
    }
  });

  // Recent searches: show when search is focused or empty
  let recentBlurTimer = null;
  const recentContainer = document.getElementById('recentSearchesContainer');
  on(els.q, 'focus', () => {
    clearTimeout(recentBlurTimer);
    if (typeof window.setRecentSearchesPanelOpen === 'function') {
      window.setRecentSearchesPanelOpen(true);
    }
  });
  on(els.q, 'blur', () => {
    recentBlurTimer = setTimeout(() => {
      if (typeof window.setRecentSearchesPanelOpen === 'function') {
        window.setRecentSearchesPanelOpen(false);
      }
    }, 160);
  });
  on(els.q, 'input', () => {
    if (typeof window.renderRecentSearches === 'function') {
      window.renderRecentSearches();
    }
  });
  if (recentContainer) {
    on(recentContainer, 'mousedown', (e) => {
      e.preventDefault();
    });
  }

  // Results toolbar overflow menu (mobile)
  const resultsMoreBtn = document.getElementById('resultsMoreBtn');
  const resultsMoreMenu = document.getElementById('resultsMoreMenu');

  function closeResultsOverflowMenu() {
    if (!resultsMoreMenu) return;
    resultsMoreMenu.hidden = true;
    if (resultsMoreBtn) resultsMoreBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleResultsOverflowMenu() {
    if (!resultsMoreMenu || !resultsMoreBtn) return;
    const willOpen = resultsMoreMenu.hidden;
    resultsMoreMenu.hidden = !willOpen;
    resultsMoreBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

  on(resultsMoreBtn, 'click', (e) => {
    e.stopPropagation();
    toggleResultsOverflowMenu();
  });

  if (resultsMoreMenu) {
    resultsMoreMenu.querySelectorAll('[data-results-action]').forEach((item) => {
      on(item, 'click', () => {
        const action = item.getAttribute('data-results-action');
        if (action === 'favorites' && els.viewFavorites) els.viewFavorites.click();
        else if (action === 'history' && els.viewHistory) els.viewHistory.click();
        else if (action === 'comparison' && els.viewComparison) els.viewComparison.click();
        else if (action === 'share' && els.shareFilters) els.shareFilters.click();
        closeResultsOverflowMenu();
      });
    });
  }

  document.addEventListener('click', (e) => {
    if (!resultsMoreMenu || resultsMoreMenu.hidden) return;
    if (e.target.closest('.results-actions-overflow')) return;
    closeResultsOverflowMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeResultsOverflowMenu();
  });

  // Triage buttons
  on(els.viewCrisisResources, "click", () => {
    els.showCrisis.checked = true;
    callbacks.syncTopToggles();
    callbacks.render();
    const t = document.getElementById("treatmentSection");
    window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  });

  on(els.viewTreatmentOptions, "click", () => {
    els.showCrisis.checked = false;
    callbacks.syncTopToggles();
    callbacks.render();
    const t = document.getElementById("treatmentSection");
    window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      // Allow Escape to work in inputs
      if (e.key === "Escape") {
        const autocompleteVisible = callbacks.getAutocompleteVisible ? callbacks.getAutocompleteVisible() : false;
        if (autocompleteVisible) {
          callbacks.hideAutocomplete();
          e.preventDefault();
        }
      }
      return;
    }
    
    // Keyboard shortcuts
    if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      els.q.focus();
      els.q.select();
    } else if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (els.helpModal) {
        callbacks.showModal(els.helpModal);
      }
    } else if (e.key === "Escape") {
      // Close expanded cards
      const openId = state.getOpenId();
      if (openId) {
        const cur = document.querySelector(`.card[data-id="${CSS.escape(openId)}"]`);
        if (cur) callbacks.setCardOpen(cur, false);
        state.setOpenId(null);
      }
      // Close modals
      if (els.favoritesModal && els.favoritesModal.getAttribute('aria-hidden') === 'false') {
        callbacks.hideModal(els.favoritesModal);
      }
      if (els.historyModal && els.historyModal.getAttribute('aria-hidden') === 'false') {
        callbacks.hideModal(els.historyModal);
      }
      if (els.comparisonModal && els.comparisonModal.getAttribute('aria-hidden') === 'false') {
        callbacks.hideModal(els.comparisonModal);
      }
      if (els.helpModal && els.helpModal.getAttribute('aria-hidden') === 'false') {
        callbacks.hideModal(els.helpModal);
      }
      if (els.locationConsentModal && els.locationConsentModal.getAttribute('aria-hidden') === 'false') {
        callbacks.handleLocationConsentCancel();
      }
    }
  });

  // Favorites modal
  on(els.viewFavorites, "click", () => {
    callbacks.renderFavorites();
    callbacks.showModal(els.favoritesModal);
  });
  
  // Export/print favorites
  const exportFavoritesBtn = document.getElementById('exportFavorites');
  if (exportFavoritesBtn) {
    on(exportFavoritesBtn, "click", callbacks.exportFavorites);
  }

  // Call history modal
  on(els.viewHistory, "click", () => {
    callbacks.renderCallHistory();
    callbacks.showModal(els.historyModal);
  });

  // Comparison modal
  on(els.viewComparison, "click", () => {
    callbacks.renderComparison();
    callbacks.showModal(els.comparisonModal);
  });
  
  // Share filters
  if (els.shareFilters) {
    on(els.shareFilters, "click", () => {
      callbacks.shareCurrentFilters();
    });
  }
  
  // Filter presets
  document.querySelectorAll('.filter-preset-btn').forEach(btn => {
    on(btn, "click", () => {
      const preset = btn.dataset.preset;
      callbacks.applyFilterPreset(preset);
    });
  });

  // Search example chips (fill query, apply parsed filters like Find Programs)
  document.querySelectorAll('[data-search-example]').forEach((btn) => {
    on(btn, 'click', () => {
      const example = btn.getAttribute('data-search-example') || '';
      if (els.q) {
        els.q.value = example;
        delete els.q.dataset.exactMatch;
        delete els.q.dataset.matchType;
      }
      callbacks.hideAutocomplete();

      const parsed =
        typeof window.parseSmartSearch === 'function'
          ? window.parseSmartSearch(example)
          : {};
      if (parsed.loc && els.loc) els.loc.value = parsed.loc;
      if (parsed.age && els.age) els.age.value = parsed.age;
      if (parsed.care && els.care) els.care.value = parsed.care;
      if (parsed.insurance && els.insurance) els.insurance.value = parsed.insurance;
      if (els.showCrisis) els.showCrisis.checked = !!parsed.showCrisis;
      if (parsed.serviceDomain && els.serviceDomain) {
        els.serviceDomain.value = parsed.serviceDomain;
      }
      callbacks.syncTopToggles();
      scheduleRender();

      const section = document.getElementById('treatmentSection');
      if (section) {
        window.scrollTo({ top: section.offsetTop - 10, behavior: 'smooth' });
      }
    });
  });

  // Modal close buttons
  els.favoritesModal.querySelectorAll('.modal-close').forEach(btn => {
    on(btn, "click", () => callbacks.hideModal(els.favoritesModal));
  });
  els.historyModal.querySelectorAll('.modal-close').forEach(btn => {
    on(btn, "click", () => callbacks.hideModal(els.historyModal));
  });
  els.comparisonModal.querySelectorAll('.modal-close').forEach(btn => {
    on(btn, "click", () => callbacks.hideModal(els.comparisonModal));
  });
  
  // Clear comparison
  const clearComparisonBtn = document.getElementById('clearComparison');
  if (clearComparisonBtn) {
    on(clearComparisonBtn, "click", () => {
      if (callbacks.clearComparison) {
        callbacks.clearComparison();
      }
      callbacks.renderComparison();
      callbacks.render();
    });
  }

  // Close modals when clicking outside
  on(els.favoritesModal, "click", (e) => {
    if (e.target === els.favoritesModal) callbacks.hideModal(els.favoritesModal);
  });
  on(els.historyModal, "click", (e) => {
    if (e.target === els.historyModal) callbacks.hideModal(els.historyModal);
  });
  on(els.comparisonModal, "click", (e) => {
    if (e.target === els.comparisonModal) callbacks.hideModal(els.comparisonModal);
  });
  
  // Help modal
  if (els.helpModal) {
    els.helpModal.querySelectorAll('.modal-close').forEach(btn => {
      on(btn, "click", () => callbacks.hideModal(els.helpModal));
    });
    on(els.helpModal, "click", (e) => {
      if (e.target === els.helpModal) callbacks.hideModal(els.helpModal);
    });
  }

  callbacks.syncTopToggles();
  
  // Privacy controls
  callbacks.setupPrivacyControls();
}

// For non-module environments
if (typeof window !== 'undefined') {
  window.setupEventHandlers = setupEventHandlers;
}

