import {
  state, stateManager, syncStateFromManager, syncStateToManager,
  loadEncryptedDataFn, saveEncryptedDataFn, URL_FILTER_PARAM_KEYS, STORAGE_KEYS_COMPARISON,
} from './js/app/state.js?v=1';
import { setRenderImpl } from './js/app/render-hook.js?v=1';
import { els, refreshEls, readSearchQuery } from './js/app/dom.js?v=1';
import { getCardProgramName, setExpandBtnA11y, setCardOpen, toggleModalCardDetails, toggleOpen } from './js/app/card-management.js?v=1';
import { buildLocationOptions, buildSearchCities, buildInsuranceOptions } from './js/app/select-options.js?v=1';
import { callShowToast, callShowModal, callHideModal } from './js/app/ui-feedback.js?v=1';
import { requestUserLocation, showLocationConsent, hideLocationConsent, handleNearMeClick, handleLocationConsentAllow, revertDistanceSortWithoutLocation, handleLocationConsentCancel, handleStopLocationSharing, updateLocationButtonVisibility } from './js/app/geolocation.js?v=1';
import { syncTopToggles, syncChipsToSelect, syncSelectToChips, initChipMultiSelects } from './js/app/filter-sync.js?v=1';
import { updateURLState, loadURLState, handleURLParams } from './js/app/url-state.js?v=1';

// render() is a hoisted function declaration below; register it with the
// late-binding seam here so it is bound before any DOM event can fire.
setRenderImpl(render);

// ========== Security ==========
// Load security module (encryption, validation, etc.)
// Security functions are available globally after security.js loads

// ========== MOBILE PERFORMANCE DEBUGGING (REMOVED) ==========
// All debug code has been removed

// ========== State Management ==========
// Legacy state variables now live in js/app/state.js as `state.<name>`;
// they are still mutated in place so behavior is unchanged.

function hasURLFilterParams() {
  const params = new URLSearchParams(window.location.search);
  return URL_FILTER_PARAM_KEYS.some((key) => params.has(key));
}

function isResultsUnlocked() {
  return state.resultsUnlocked;
}

function unlockResults() {
  if (state.resultsUnlocked) return;
  state.resultsUnlocked = true;
  updateResultsVisibility();
}

function lockResults() {
  if (!state.resultsUnlocked) return;
  state.resultsUnlocked = false;
  updateResultsVisibility();
}

function updateResultsVisibility() {
  document.body.classList.toggle('is-results-unlocked', state.resultsUnlocked);
  const awaiting = document.getElementById('resultsAwaiting');
  if (awaiting) awaiting.hidden = state.resultsUnlocked;
}

function getDirectoryProgramCount() {
  if (!state.ready || !state.programs.length) return null;
  return state.programs.filter((p) => !isCrisis(p)).length;
}

function updateResultsAwaitingCopy() {
  const title = document.getElementById('awaitingTitle');
  const lead = document.getElementById('awaitingLead');
  if (!title || !lead) return;

  const intent = document.body.dataset.intent || '';
  const copyByIntent = {
    treatment: {
      title: 'Search to see programs that fit',
      lead: 'Enter a city, care level, or age in the search box, then click Find Programs. Or use Browse all to see every listing.',
    },
    guidance: {
      title: 'Answer a few questions, then search',
      lead: 'Use the guided fields in search, then click Find Programs. Browse all shows the full directory without filters.',
    },
    crisis: {
      title: 'Search crisis resources when you are ready',
      lead: 'For immediate help, use 911 or 988 above. To browse crisis programs here, search and click Find Programs, or browse all.',
    },
  };

  const copy = copyByIntent[intent] || {
    title: 'Programs appear after you search',
    lead: 'Click Find Programs after you set filters, use Browse all for the full list, or pick a specialized program type below to see matches right away.',
  };

  title.textContent = copy.title;
  lead.textContent = copy.lead;
}

function updateResultsAwaitingPanel() {
  updateResultsAwaitingCopy();
  const countEl = document.getElementById('awaitingProgramCount');
  if (!countEl) return;

  if (!state.ready) {
    countEl.textContent = '…';
    return;
  }

  const count = getDirectoryProgramCount();
  countEl.textContent = count != null ? String(count) : '—';
}

function renderResultsLocked() {
  refreshEls();
  updateResultsAwaitingPanel();
  updateActiveFilterChips();

  if (els.treatmentGrid) {
    els.treatmentGrid.innerHTML = '';
    els.treatmentGrid.dataset.state = state.ready ? 'idle' : 'loading';
    els.treatmentGrid.style.display = '';
  }

  if (els.treatmentEmpty) {
    els.treatmentEmpty.style.display = 'none';
  }

  if (els.treatmentCount) {
    els.treatmentCount.textContent = '—';
  }

  const resultsIntro = document.getElementById('resultsIntro');
  if (resultsIntro) {
    resultsIntro.textContent = state.ready
      ? 'Search or browse all to see program matches.'
      : 'Loading programs…';
  }

  if (window.flowMotion) {
    window.flowMotion.setTreatmentGridState(0);
  }
}

function browseAllPrograms() {
  clearAllFilters({ updateUrl: true, closeCards: true });
  unlockResults();
  render();
  const grid = document.getElementById('treatmentGrid');
  if (grid) {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    grid.scrollIntoView({ behavior: motion, block: 'start' });
  }
}

// Initial sync from StateManager (load persisted state)
syncStateFromManager();

async function initializeEncryptedStorage() {
  const STORAGE_KEYS = window.STORAGE_KEYS || {
    FAVORITES: 'favorites',
    RECENT_SEARCHES: 'recentSearches',
    CALL_HISTORY: 'callHistory',
    CUSTOM_LISTS: 'customLists',
    PROGRAM_NOTES: 'programNotes',
    PROGRAM_TAGS: 'programTags'
  };
  
  state.favorites = new Set(await loadEncryptedDataFn(STORAGE_KEYS.FAVORITES, []));
  state.recentSearches = await loadEncryptedDataFn(STORAGE_KEYS.RECENT_SEARCHES, []);
  state.callHistory = await loadEncryptedDataFn(STORAGE_KEYS.CALL_HISTORY, []);
  state.customLists = await loadEncryptedDataFn(STORAGE_KEYS.CUSTOM_LISTS, {});
  state.programNotes = await loadEncryptedDataFn(STORAGE_KEYS.PROGRAM_NOTES, {});
  state.programTags = await loadEncryptedDataFn(STORAGE_KEYS.PROGRAM_TAGS, {});
  const prefs = await loadEncryptedDataFn('userPreferences', {});
  state.userPreferences = { ...state.userPreferences, ...prefs };
  
  // Apply preferences (els might not be initialized yet, so check)
  if (state.userPreferences.defaultSort && typeof els !== 'undefined' && els.sortSelect) {
    state.currentSort = state.userPreferences.defaultSort;
    els.sortSelect.value = state.currentSort;
  }
}

// Initialize on load
initializeEncryptedStorage();

// ========== Performance Optimizations ==========
// All performance code is now in js/modules/performance.js
// Initialize performance optimizations (text scale detection, banner offset, etc.)
if (typeof window.initPerformanceOptimizations === 'function') {
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  state.performanceModule = window.initPerformanceOptimizations({ isCoarsePointer });
  state.updateCrisisBannerOffset = state.performanceModule.updateCrisisBannerOffset;
            } else {
  console.error('initPerformanceOptimizations not available. Make sure js/modules/performance.js is loaded.');
  // Fallback: minimal updateCrisisBannerOffset function
  state.updateCrisisBannerOffset = function() {
  const banner = document.querySelector('.crisis-banner');
    if (banner) {
    const h = banner.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--crisis-banner-h', `${h}px`);
    }
  };
}

window.programDataMap = state.programDataMap;
window.comparisonSet = state.comparisonSet;

// ========== Autocomplete Indexes ==========
function buildAutocompleteIndexes(list){
  state.orgProgramsIndex = new Map();
  for (const p of list || []) {
    const org = safeStr(p.organization).trim();
    if (!org) continue;
    const key = org.toLowerCase();
    const arr = state.orgProgramsIndex.get(key);
    if (arr) arr.push(p);
    else state.orgProgramsIndex.set(key, [p]);
  }
}

if (typeof window !== 'undefined') {
  window.refreshEls = refreshEls;
  window.getAppReady = () => state.ready;
  window.isResultsUnlocked = isResultsUnlocked;
  window.unlockResults = unlockResults;
  window.lockResults = lockResults;
  window.browseAllPrograms = browseAllPrograms;
  window.updateResultsAwaitingCopy = updateResultsAwaitingCopy;
}

// ========== Document-Level Event Delegation ==========
// Set up early to handle dynamically added cards (including on first page load)
document.addEventListener('click', (e) => {
  // Allow navigation links (footer links, etc.) to work normally
  const link = e.target.closest('a');
  if (link) {
    // Check if link is in footer (most reliable indicator)
    const isInFooter = link.closest('footer');
    if (isInFooter) {
      // Allow all footer links to work normally
      return;
    }
    // Also check the href attribute directly
    const hrefAttr = link.getAttribute('href');
    if (hrefAttr && (hrefAttr === 'privacy.html' || hrefAttr === 'terms.html' ||
        hrefAttr.includes('privacy.html') || hrefAttr.includes('terms.html') ||
        hrefAttr === '/privacy' || hrefAttr === '/terms' ||
        hrefAttr.startsWith('/privacy#') || hrefAttr.startsWith('/terms#'))) {
      // Allow normal navigation for privacy/terms links - don't prevent default
      return;
    }
    // Also check the resolved href pathname as fallback
    try {
      const linkUrl = new URL(link.href);
      if (linkUrl.pathname.endsWith('privacy.html') || linkUrl.pathname.endsWith('terms.html') ||
          linkUrl.pathname === '/privacy' || linkUrl.pathname === '/terms') {
        return;
      }
    } catch (e) {
      // If URL parsing fails, continue with normal handler
    }
  }
  
  // Handle expand button clicks - check if click is on the button or its child (chev icon)
  // Check both the target and if it's inside an expandBtn
  let expandBtn = e.target.closest('.expandBtn, .expand-details-btn');
  // Also check if clicking directly on the button
  if (!expandBtn && e.target.classList && (e.target.classList.contains('expandBtn') || e.target.classList.contains('expand-details-btn'))) {
    expandBtn = e.target;
  }
  
  if (expandBtn) {
    // Check if this is inside a modal - if so, let modal handler take over
    const card = expandBtn.closest('.card');
    if (card && card.closest('.modal')) {
      // Modal card - handled by modal-local handler, but prevent main page handler
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // Main page card - handle normally
    e.preventDefault();
    e.stopPropagation();
    if (card) {
      const id = card.dataset.id || card.getAttribute('data-id');
      if (id) {
        toggleOpen(id);
      }
    }
    return;
  }

  // Handle card action buttons (only if functions are defined)
  const favoriteBtn = e.target.closest('[data-favorite]');
  if (favoriteBtn && typeof toggleFavorite === 'function') {
    e.preventDefault();
    const id = favoriteBtn.dataset.favorite;
    toggleFavorite(id);
    // Update button state
    const card = favoriteBtn.closest('.card');
    if (card) {
      const program = state.programDataMap.get(id);
      if (program) {
        const idx = Array.from(state.programDataMap.keys()).indexOf(id);
        if (typeof appCreateCard === 'function') {
          const newCard = appCreateCard(program, idx);
          card.replaceWith(newCard);
        }
      }
    }
    return;
  }

  const shareBtn = e.target.closest('[data-share]');
  if (shareBtn && typeof shareProgram === 'function') {
    e.preventDefault();
    const id = shareBtn.dataset.share;
    shareProgram(id);
    return;
  }

  // Handle comparison checkbox
  const compareCheckbox = e.target.closest('[data-compare]');
  if (compareCheckbox && !compareCheckbox.disabled && typeof toggleComparison === 'function') {
    e.preventDefault();
    const programId = compareCheckbox.dataset.compare;
    toggleComparison(programId);
    // Update card state
    const card = compareCheckbox.closest('.card');
    if (card) {
      const id = card.dataset.id;
      const program = state.programDataMap.get(id);
      if (program) {
        const idx = Array.from(state.programDataMap.keys()).indexOf(id);
        if (typeof appCreateCard === 'function') {
          const newCard = appCreateCard(program, idx);
          card.replaceWith(newCard);
        }
      }
    }
    return;
  }

  // SECURITY AUDIT FIX: Handle comparison remove buttons via event delegation
  // This prevents listener accumulation when renderComparison() is called multiple times
  const removeCompareBtn = e.target.closest('.remove-compare');
  if (removeCompareBtn && typeof toggleComparison === 'function') {
    e.preventDefault();
    const id = removeCompareBtn.dataset.remove;
    if (id) {
      toggleComparison(id);
      callRenderComparison();
    }
    return;
  }
});

document.addEventListener('keydown', (e) => {
  const expandBtn = e.target.closest('.expandBtn');
  if (expandBtn && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    e.stopPropagation();
    const card = expandBtn.closest('.card');
    if (card) {
      const id = card.dataset.id;
      if (id) {
        toggleOpen(id);
      }
    }
  }
});

// ========== Fuzzy Search Utilities ==========
// ========== Smart Search Parser ==========
// Uses js/modules/search.js parseSmartSearch (via window.parseSmartSearch)
// Note: We use the module function directly and add organization detection inline where needed
// to avoid naming conflicts and recursion issues

// ========== Utility Functions ==========
// ========== Helper Functions ==========
// All helper functions are now in js/utils/helpers.js and available via window.*
// Removed duplicates to avoid code duplication and maintenance issues

// ========== Filter / relevance (delegate to modules) ==========
/** Shared bindings for `js/modules/filters.js` — single source to avoid duplicating filter state in render(). */
function getFilterModuleBindings(showCrisis) {
  refreshEls();
  const qEl = els.q || document.getElementById('q');
  const locEl = els.loc || document.getElementById('loc');
  const careEl = els.care || document.getElementById('care');
  const ageEl = els.age || document.getElementById('age');
  const insuranceEl = els.insurance || document.getElementById('insurance');
  const onlyVirtualEl = els.onlyVirtual || document.getElementById('onlyVirtual');
  const query = readSearchQuery();
  const parsed =
    typeof window.parseSmartSearch === 'function'
      ? window.parseSmartSearch(query)
      : {};
  const insuranceFromDropdown = insuranceEl?.value || '';
  const effectiveInsurance = insuranceFromDropdown || parsed.insurance || '';
  return {
    filters: {
      query,
      location: locEl?.value || '',
      age: ageEl?.value || '',
      care: careEl?.value || '',
      insurance: effectiveInsurance,
      onlyVirtual: onlyVirtualEl?.checked || false,
      showCrisis,
      county: els.county?.value || '',
      serviceDomain: els.serviceDomain?.value || '',
      verificationRecency: els.verificationRecency?.value || '',
      exactMatch: qEl?.dataset.exactMatch === 'true',
      matchType: qEl?.dataset.matchType || '',
      selectedCounty: state.selectedCounty,
      selectedServiceDomains: state.selectedServiceDomains,
      selectedSudServices: state.selectedSudServices,
      verificationRecencyDays: state.verificationRecencyDays
    },
    options: {
      safeStr: window.safeStr,
      parseSmartSearch: window.parseSmartSearch,
      getTextSearchTermList: window.getTextSearchTermList,
      fuzzyMatch: window.fuzzyMatch,
      programServesAge: window.programServesAge,
      programServesLocation: window.programServesLocation,
      hasVirtual: window.hasVirtual,
      locLabel: window.locLabel,
      featureFlags: window.FEATURE_FLAGS || {},
      programs: state.programs,
      ready: state.ready
    }
  };
}

/** App wrapper — must not be named calculateRelevanceScore (would overwrite window.calculateRelevanceScore from filters.js). */
function getProgramRelevanceScore(program, query) {
  const q = safeStr(query).trim();
  if (!q) return 0;
  if (typeof window.calculateRelevanceScore !== 'function') return 0;
  return window.calculateRelevanceScore(program, query, {
    safeStr: window.safeStr,
    locLabel: window.locLabel,
    fuzzyMatch: window.fuzzyMatch
  });
}

/** Fallback only if filters module failed to load. Must not be named `matchesFilters` — that would overwrite `window.matchesFilters` from `js/modules/filters.js`. */
function matchesFiltersFallback(p) {
  if (typeof window.matchesFilters !== 'function') {
    console.warn('matchesFilters: js/modules/filters.js not loaded; skipping filter logic');
    return true;
  }
  const showCrisis = els.showCrisis?.checked || false;
  const { filters, options } = getFilterModuleBindings(showCrisis);
  return window.matchesFilters(p, filters, options);
}

// Additional helper functions (normalizePhoneForTel, bestAddress, mapsLinkFor, stableIdFor)
// are now in js/utils/helpers.js and available via window.*

// ========== Call Tracking ==========
async function trackCallAttempt(program) {
  const sanitize = typeof window.sanitizeText === 'function' ? window.sanitizeText : (s) => s;
  state.callHistory.unshift({
    program: sanitize(program.program_name),
    org: sanitize(program.organization),
    timestamp: new Date().toISOString()
  });
  state.callHistory = state.callHistory.slice(0, 20);
  const STORAGE_KEYS = window.STORAGE_KEYS || { CALL_HISTORY: 'callHistory' };
  await saveEncryptedDataFn(STORAGE_KEYS.CALL_HISTORY, state.callHistory);
  
  showCallConfirmation(program);
}

function showCallConfirmation(program) {
  const toast = document.createElement('div');
  toast.className = 'call-toast';
  toast.innerHTML = `
    <div class="call-toast-inner">
      <strong>Calling ${escapeHtml(program.organization)}</strong>
      <p>Have this ready: Insurance card, child's age, reason for seeking care</p>
    </div>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 50);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 5000);
}

// ========== Rendering Functions ==========
// All rendering functions are now in js/modules/render.js and available via window.*
// Removed duplicates to avoid code duplication and maintenance issues

// createCard wrapper - uses const to avoid overwriting window.createCard
const appCreateCard = (p, idx) => {
  const fn = window.createCard; // from render.js
  if (typeof fn === 'function') {
  const stateAccessors = {
    getOpenId: () => state.openId,
    getUserLocation: () => state.userLocation,
    getCurrentSort: () => state.currentSort
  };
    return fn(p, idx, {
    els,
    state: stateAccessors,
    isFavorite,
    comparisonSet: state.comparisonSet,
    programDataMap: state.programDataMap,
    allPrograms: state.programs
  });
  } else {
    console.error('createCard not available. Make sure js/modules/render.js is loaded.');
    return document.createElement('div');
  }
};

// renderSkeletons is now in js/modules/render.js and available via window.renderSkeletons
// Removed local wrapper to prevent infinite recursion

function announceToScreenReader(message, priority = 'polite') {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', priority);
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  announcer.textContent = message;
  document.body.appendChild(announcer);
  
  setTimeout(() => {
    if (announcer.parentNode) {
      document.body.removeChild(announcer);
    }
  }, priority === 'assertive' ? 5000 : 3000);
}

// updateStats wrapper - uses const to avoid overwriting window.updateStats
const callUpdateStats = () => {
  const fn = window.updateStats; // from render.js
  if (typeof fn === 'function') {
    fn(state.programs, els, updateFavoritesCount);
  } else {
    console.error('updateStats not available. Make sure js/modules/render.js is loaded.');
    if (els.programCount) els.programCount.textContent = state.programs.length;
    updateFavoritesCount();
  }
};

function updateBadgeCount(el, count) {
  if (!el) return;
  el.textContent = count;
  el.style.display = count > 0 ? 'inline-flex' : 'none';
}

function updateFavoritesCount() {
  const count = state.favorites.size;
  updateBadgeCount(els.favoritesCount, count);
  updateBadgeCount(document.getElementById('favoritesCountMenu'), count);
}

function updateComparisonCount() {
  const count = state.comparisonSet.size;
  updateBadgeCount(document.getElementById('comparisonCount'), count);
  updateBadgeCount(document.getElementById('comparisonCountMenu'), count);
}

function saveComparison() {
  const STORAGE_KEYS = window.STORAGE_KEYS || { COMPARISON: 'comparison' };
  localStorage.setItem(STORAGE_KEYS.COMPARISON, JSON.stringify(Array.from(state.comparisonSet)));
  updateComparisonCount();
}

function toggleComparison(programId) {
  if (state.comparisonSet.has(programId)) {
    state.comparisonSet.delete(programId);
    callShowToast('Removed from comparison', 'success');
  } else {
    if (state.comparisonSet.size >= 3) {
      callShowToast('Maximum 3 programs can be compared', 'error');
      return;
    }
    state.comparisonSet.add(programId);
    callShowToast('Added to comparison', 'success');
  }
  saveComparison();
  render();
  
  // Update comparison view if modal is open
  if (els.comparisonModal && els.comparisonModal.getAttribute('aria-hidden') === 'false') {
    callRenderComparison();
  }
}

function isInComparison(programId) {
  return state.comparisonSet.has(programId);
}

// renderComparison wrapper - uses const to avoid overwriting window.renderComparison
const callRenderComparison = () => {
  const fn = window.renderComparison; // from render.js
  if (typeof fn === 'function') {
    fn({
      els,
      comparisonSet: state.comparisonSet,
      programDataMap: state.programDataMap
    });
  } else {
    console.error('renderComparison not available. Make sure js/modules/render.js is loaded.');
  }
};

async function saveFavorites() {
  const STORAGE_KEYS = window.STORAGE_KEYS || { FAVORITES: 'favorites' };
  await saveEncryptedDataFn(STORAGE_KEYS.FAVORITES, Array.from(state.favorites));
  updateFavoritesCount();
}

async function toggleFavorite(programId) {
  // Validate program ID
  const sanitizedId = typeof window.sanitizeId === 'function' 
    ? window.sanitizeId(programId)
    : programId.replace(/[^a-zA-Z0-9_-]/g, '');
  
  if (sanitizedId !== programId) {
    if (typeof window.logSecurityEvent === 'function') {
      window.logSecurityEvent('suspicious_program_id_favorite', { original: programId, sanitized: sanitizedId });
    }
    return;
  }
  
  if (state.favorites.has(sanitizedId)) {
    state.favorites.delete(sanitizedId);
    callShowToast('Removed from saved programs', 'success');
  } else {
    state.favorites.add(sanitizedId);
    callShowToast('Saved to your programs', 'success');
  }
  await saveFavorites();
  render();
}

function isFavorite(programId) {
  return state.favorites.has(programId);
}

async function saveProgramNote(programId, note) {
  if (!note || note.trim() === '') {
    delete state.programNotes[programId];
  } else {
    state.programNotes[programId] = typeof window.sanitizeText === 'function' 
      ? window.sanitizeText(note, 500)
      : note.substring(0, 500);
  }
  const STORAGE_KEYS = window.STORAGE_KEYS || { PROGRAM_NOTES: 'programNotes' };
  await saveEncryptedDataFn(STORAGE_KEYS.PROGRAM_NOTES, state.programNotes);
}

function getProgramNote(programId) {
  return state.programNotes[programId] || '';
}

async function addProgramTag(programId, tag) {
  if (!state.programTags[programId]) {
    state.programTags[programId] = [];
  }
  const sanitizedTag = typeof window.sanitizeText === 'function'
    ? window.sanitizeText(tag, 50)
    : tag.substring(0, 50);
  if (!state.programTags[programId].includes(sanitizedTag) && sanitizedTag.trim()) {
    state.programTags[programId].push(sanitizedTag);
    const STORAGE_KEYS = window.STORAGE_KEYS || { PROGRAM_TAGS: 'programTags' };
    await saveEncryptedDataFn(STORAGE_KEYS.PROGRAM_TAGS, state.programTags);
  }
}

async function removeProgramTag(programId, tag) {
  if (state.programTags[programId]) {
    state.programTags[programId] = state.programTags[programId].filter(t => t !== tag);
    if (state.programTags[programId].length === 0) {
      delete state.programTags[programId];
    }
    const STORAGE_KEYS = window.STORAGE_KEYS || { PROGRAM_TAGS: 'programTags' };
    await saveEncryptedDataFn(STORAGE_KEYS.PROGRAM_TAGS, state.programTags);
  }
}

function getProgramTags(programId) {
  return state.programTags[programId] || [];
}

async function createCustomList(listName) {
  const sanitizedName = typeof window.sanitizeText === 'function'
    ? window.sanitizeText(listName, 50)
    : listName.substring(0, 50);
  if (sanitizedName.trim() && !state.customLists[sanitizedName]) {
    state.customLists[sanitizedName] = [];
    const STORAGE_KEYS = window.STORAGE_KEYS || { CUSTOM_LISTS: 'customLists' };
    await saveEncryptedDataFn(STORAGE_KEYS.CUSTOM_LISTS, state.customLists);
    return sanitizedName;
  }
  return null;
}

async function addToCustomList(listName, programId) {
  if (state.customLists[listName] && !state.customLists[listName].includes(programId)) {
    state.customLists[listName].push(programId);
    const STORAGE_KEYS = window.STORAGE_KEYS || { CUSTOM_LISTS: 'customLists' };
    await saveEncryptedDataFn(STORAGE_KEYS.CUSTOM_LISTS, state.customLists);
  }
}

async function removeFromCustomList(listName, programId) {
  if (state.customLists[listName]) {
    state.customLists[listName] = state.customLists[listName].filter(id => id !== programId);
    const STORAGE_KEYS = window.STORAGE_KEYS || { CUSTOM_LISTS: 'customLists' };
    await saveEncryptedDataFn(STORAGE_KEYS.CUSTOM_LISTS, state.customLists);
  }
}

function isInCustomList(listName, programId) {
  return state.customLists[listName] && state.customLists[listName].includes(programId);
}

/** Local sort fallback — must not be named sortPrograms (would overwrite window.sortPrograms from sort.js). */
function sortProgramsLocal(list) {
  const sorted = [...list];
  
  const SORT_OPTIONS = window.SORT_OPTIONS || {
    RELEVANCE: 'relevance',
    NAME: 'name',
    VERIFIED: 'verified',
    LOCATION: 'location',
    DISTANCE: 'distance'
  };
  
  switch(state.currentSort) {
    case SORT_OPTIONS.NAME:
      sorted.sort((a, b) => {
        const nameA = safeStr(a.program_name || a.organization).toLowerCase();
        const nameB = safeStr(b.program_name || b.organization).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      break;
    case SORT_OPTIONS.VERIFIED:
      sorted.sort((a, b) => {
        const dateA = a.last_verified ? new Date(a.last_verified) : new Date(0);
        const dateB = b.last_verified ? new Date(b.last_verified) : new Date(0);
        return dateB - dateA;
      });
      break;
    case SORT_OPTIONS.LOCATION:
      sorted.sort((a, b) => {
        const locA = locLabel(a);
        const locB = locLabel(b);
        return locA.localeCompare(locB);
      });
      break;
    case SORT_OPTIONS.DISTANCE:
      if (state.userLocation && typeof window.calculateProgramDistance === 'function') {
        // Separate virtual and in-person programs
        const inPerson = [];
        const virtual = [];
        
        for (const program of sorted) {
          if (program.service_setting === 'Virtual' || 
              (program.locations && program.locations.some(loc => loc.city === 'Virtual'))) {
            virtual.push(program);
          } else {
            inPerson.push(program);
          }
        }
        
        // Calculate distances for in-person programs
        const withDistances = inPerson.map(program => {
          const distance = window.calculateProgramDistance(program, state.userLocation.lat, state.userLocation.lng);
          return { program, distance };
        });
        
        // Sort by distance (null/Infinity goes to end)
        withDistances.sort((a, b) => {
          if (a.distance === null || a.distance === Infinity) return 1;
          if (b.distance === null || b.distance === Infinity) return -1;
          return a.distance - b.distance;
        });
        
        // Combine: sorted in-person first (with distances), then in-person without coordinates, then virtual
        const inPersonWithDistance = withDistances.filter(wd => wd.distance !== null && wd.distance !== Infinity).map(wd => wd.program);
        const inPersonWithoutDistance = withDistances.filter(wd => wd.distance === null || wd.distance === Infinity).map(wd => wd.program);
        
        const result = [...inPersonWithDistance, ...inPersonWithoutDistance, ...virtual];
        
        // Ensure we return all programs (safety check)
        if (result.length !== sorted.length) {
          console.warn(`Distance sort: Expected ${sorted.length} programs, got ${result.length}. Adding missing programs.`);
          const resultIds = new Set(result.map(p => p.program_id));
          const missing = sorted.filter(p => !resultIds.has(p.program_id));
          return [...result, ...missing];
        }
        
        return result;
      }
      // Fallback to location sort if no user location
      sorted.sort((a, b) => {
        const locA = locLabel(a);
        const locB = locLabel(b);
        return locA.localeCompare(locB);
      });
      break;
    case 'relevance':
    default:
      // Keep original order (already filtered by relevance)
      break;
  }
  
  return sorted;
}

function shareProgram(programId) {
  const program = state.programDataMap.get(programId);
  if (!program) return;
  
  // Validate programId to prevent injection
  const sanitizedId = typeof window.sanitizeId === 'function' 
    ? window.sanitizeId(programId)
    : programId.replace(/[^a-zA-Z0-9_-]/g, '');
  
  if (sanitizedId !== programId) {
    if (typeof window.logSecurityEvent === 'function') {
      window.logSecurityEvent('suspicious_program_id_share', { original: programId, sanitized: sanitizedId });
    }
    return;
  }
  
  const pathFn = typeof window.programPublicPath === 'function'
    ? window.programPublicPath
    : (id) => `/programs/${encodeURIComponent(id)}.html`;
  const url = `${window.location.origin}${pathFn(sanitizedId)}`;

  // Show share options modal
  showShareModal(url, `${safeStr(program.program_name)} - ${safeStr(program.organization)}`);
}

function shareCurrentFilters() {
  updateURLState();
  const url = window.location.href;
  showShareModal(url, 'Current search filters');
}

function showShareModal(url, title) {
  // Create or update share modal
  let modal = document.getElementById('shareModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'shareModal';
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'shareModalTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="shareModalTitle">Share</h2>
          <button type="button" class="modal-close" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body" id="shareModalBody"></div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Close handlers
    modal.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => callHideModal(modal));
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) callHideModal(modal);
    });
  }
  
  const body = document.getElementById('shareModalBody');
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  
  // Create static HTML structure with IDs (no user-controlled data)
  body.innerHTML = `
    <div style="text-align: center;">
      <p id="shareTitle" style="margin-bottom: 20px; color: var(--muted);"></p>
      <div style="margin: 20px 0;">
        <img id="shareQrImg" alt="QR Code" style="border: 1px solid var(--stroke); border-radius: 8px; padding: 8px; background: white;" />
      </div>
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <input type="text" id="shareUrlInput" readonly style="flex: 1; padding: 10px; border: 1px solid var(--stroke); border-radius: 8px; font-size: 13px;" />
        <button type="button" id="copyShareBtn" class="btn-primary" style="white-space: nowrap;">Copy Link</button>
      </div>
      ${navigator.share ? `
        <button type="button" id="nativeShareBtn" class="btn-primary" style="width: 100%; margin-top: 12px;">
          Share via...
        </button>
      ` : ''}
    </div>
  `;
  
  // Set user-controlled values via DOM properties (safe from XSS)
  document.getElementById('shareTitle').textContent = title;
  document.getElementById('shareUrlInput').value = url;
  document.getElementById('shareQrImg').src = qrCodeUrl;
  
  // Attach event listeners (no inline handlers)
  const copyShareBtn = document.getElementById('copyShareBtn');
  if (copyShareBtn) {
    copyShareBtn.addEventListener('click', copyShareUrl);
  }
  
  const nativeShareBtn = document.getElementById('nativeShareBtn');
  if (nativeShareBtn) {
    nativeShareBtn.addEventListener('click', () => nativeShare(url, title));
  }
  
  callShowModal(modal);
}

function copyShareUrl() {
  const input = document.getElementById('shareUrlInput');
  if (input) {
    input.select();
    document.execCommand('copy');
    callShowToast('Link copied to clipboard', 'success');
  }
}

function nativeShare(url, title) {
  if (navigator.share) {
    navigator.share({
      title: title,
      url: url
    }).catch(() => {
      copyShareUrl();
    });
  }
}

/**
 * Single source of truth for clearing every filter, toggle, and search state.
 * @param {{ updateUrl?: boolean, closeCards?: boolean }} options
 */
function clearAllFilters(options = {}) {
  const { updateUrl = true, closeCards = true } = options;
  refreshEls();

  const qEl = els.q || document.getElementById('q');
  if (qEl) {
    qEl.value = '';
    delete qEl.dataset.exactMatch;
    delete qEl.dataset.matchType;
  }
  if (els.loc) els.loc.value = '';
  if (els.age) {
    els.age.value = '';
  }
  if (els.care) els.care.value = '';
  if (els.insurance) els.insurance.value = '';
  if (els.onlyVirtual) els.onlyVirtual.checked = false;
  if (els.showCrisis) els.showCrisis.checked = false;
  if (els.onlyVirtualTop) els.onlyVirtualTop.checked = false;
  if (els.showCrisisTop) els.showCrisisTop.checked = false;

  if (els.serviceDomain) els.serviceDomain.value = '';
  state.selectedServiceDomains = [];
  if (els.sudServices) {
    Array.from(els.sudServices.options).forEach((opt) => {
      opt.selected = false;
    });
    if (typeof syncChipsToSelect === 'function') syncChipsToSelect('sudServices');
  }
  state.selectedSudServices = [];
  if (els.county) els.county.value = '';
  state.selectedCounty = null;
  if (els.verificationRecency) els.verificationRecency.value = '';
  state.verificationRecencyDays = null;

  if (stateManager) {
    stateManager.setState({
      selectedCounty: null,
      selectedServiceDomains: [],
      selectedSudServices: [],
      verificationRecencyDays: null,
      openId: closeCards ? null : state.openId,
    });
  }
  if (closeCards) {
    state.openId = null;
  }

  syncStateToManager();
  syncTopToggles();

  if (updateUrl && typeof updateURLState === 'function') {
    updateURLState();
  }
}

function getFilterContextForEmptyState() {
  const query = readSearchQuery();
  const parsed =
    typeof window.parseSmartSearch === 'function'
      ? window.parseSmartSearch(query)
      : {};
  const dropdowns = {
    location: els.loc?.value || '',
    age: els.age?.value || '',
    care: els.care?.value || '',
    insurance: els.insurance?.value || '',
    onlyVirtual: els.onlyVirtual?.checked || false,
    showCrisis: els.showCrisis?.checked || false,
  };
  let chips = [];
  if (typeof window.getEffectiveSearchFilters === 'function') {
    ({ chips } = window.getEffectiveSearchFilters(query, dropdowns, {
      parseSmartSearch: window.parseSmartSearch,
      getTextSearchTerms: window.getTextSearchTerms,
      safeStr,
    }));
  }

  const flags = window.FEATURE_FLAGS || {};
  const extras = {};
  if (flags.STATEWIDE_MODE && els.county?.value) {
    extras.county = `County: ${els.county.options[els.county.selectedIndex]?.text || els.county.value}`;
  }
  if (flags.SHOW_SUD_FILTERS && els.serviceDomain?.value) {
    const domainLabels = {
      mental_health: 'Mental Health',
      substance_use: 'Substance Use',
      co_occurring: 'Co-occurring',
      eating_disorders: 'Eating Disorders',
    };
    extras.serviceDomain = `Service Type: ${domainLabels[els.serviceDomain.value] || els.serviceDomain.value}`;
  }
  if (flags.SHOW_SUD_FILTERS && els.sudServices) {
    const selected = Array.from(els.sudServices.selectedOptions);
    if (selected.length > 0) {
      extras.sudServices = `Substance Use Services: ${selected.map((o) => o.text).join(', ')}`;
    }
  }
  if (flags.SHOW_VERIFICATION_FILTERS && els.verificationRecency?.value) {
    const recencyLabels = { 30: 'Last 30 days', 90: 'Last 90 days', 180: 'Last 180 days' };
    extras.verificationRecency = `Verified: ${recencyLabels[els.verificationRecency.value] || els.verificationRecency.value}`;
  }

  return { query, parsed, dropdowns, chips, extras };
}

function updateEmptyStateDisplay() {
  if (!els.treatmentEmpty) return;

  const titleEl = document.getElementById('emptyStateTitle');
  const bodyEl = document.getElementById('emptyStateBody');
  const tipEl = document.getElementById('emptyStateTip');
  const broadenBtn = els.treatmentEmpty.querySelector('[data-action="broaden-search"]');

  const { query, parsed, dropdowns, chips, extras } = getFilterContextForEmptyState();
  const copy =
    typeof window.getEmptyStateCopy === 'function'
      ? window.getEmptyStateCopy(chips, extras)
      : {
          title: 'No programs match these filters',
          body: 'Try one of the options below.',
          tip: 'Tip: Try a nearby city or remove age or location filters.',
          broadenLabel: 'Broaden search',
        };

  if (titleEl) titleEl.textContent = copy.title;
  if (bodyEl) bodyEl.textContent = copy.body;
  if (tipEl) tipEl.textContent = copy.tip;
  if (broadenBtn) broadenBtn.textContent = copy.broadenLabel;

  const removalPlan =
    typeof window.getBroadenSearchRemovalPlan === 'function'
      ? window.getBroadenSearchRemovalPlan({
          insuranceDropdown: dropdowns.insurance,
          parsedInsurance: parsed.insurance || '',
          careDropdown: dropdowns.care,
          parsedCare: parsed.care || '',
          locDropdown: dropdowns.location,
          parsedLoc: parsed.loc || (parsed.locs && parsed.locs.length ? parsed.locs.join(' ') : ''),
          ageDropdown: dropdowns.age,
          parsedAge: parsed.age || '',
          onlyVirtual: dropdowns.onlyVirtual,
          verificationRecency: els.verificationRecency?.value || '',
          sudSelected: els.sudServices && els.sudServices.selectedOptions.length > 0,
          serviceDomain: els.serviceDomain?.value || '',
          county: els.county?.value || '',
          query: query.trim(),
        })
      : null;

  if (broadenBtn) {
    broadenBtn.disabled = !removalPlan;
    broadenBtn.setAttribute('aria-disabled', removalPlan ? 'false' : 'true');
  }
}

/**
 * Remove the tightest active filter (insurance → care → location → age → …).
 * @returns {string|null} key removed
 */
function broadenSearchOneStep() {
  refreshEls();
  const { query, parsed, dropdowns } = getFilterContextForEmptyState();
  const plan =
    typeof window.getBroadenSearchRemovalPlan === 'function'
      ? window.getBroadenSearchRemovalPlan({
          insuranceDropdown: dropdowns.insurance,
          parsedInsurance: parsed.insurance || '',
          careDropdown: dropdowns.care,
          parsedCare: parsed.care || '',
          locDropdown: dropdowns.location,
          parsedLoc: parsed.loc || (parsed.locs && parsed.locs.length ? parsed.locs.join(' ') : ''),
          ageDropdown: dropdowns.age,
          parsedAge: parsed.age || '',
          onlyVirtual: dropdowns.onlyVirtual,
          verificationRecency: els.verificationRecency?.value || '',
          sudSelected: els.sudServices && els.sudServices.selectedOptions.length > 0,
          serviceDomain: els.serviceDomain?.value || '',
          county: els.county?.value || '',
          query: query.trim(),
        })
      : null;

  if (!plan) return null;

  const rebuild =
    typeof window.rebuildQueryFromParsed === 'function'
      ? window.rebuildQueryFromParsed
      : () => '';

  switch (plan.key) {
    case 'insurance':
      if (els.insurance) els.insurance.value = '';
      if (els.q) {
        const nextParsed = { ...parsed, insurance: '' };
        els.q.value = rebuild(nextParsed);
        delete els.q.dataset.exactMatch;
        delete els.q.dataset.matchType;
      }
      break;
    case 'care':
      if (els.care) els.care.value = '';
      if (els.q) {
        els.q.value = rebuild({ ...parsed, care: '' });
      }
      break;
    case 'location':
      if (els.loc) els.loc.value = '';
      if (els.q) {
        els.q.value = rebuild({ ...parsed, loc: '', locs: [] });
      }
      break;
    case 'age':
      if (els.age) {
        els.age.value = '';
      }
      if (els.q) {
        els.q.value = rebuild({ ...parsed, age: '', minAge: null });
      }
      break;
    case 'virtual':
      if (els.onlyVirtual) els.onlyVirtual.checked = false;
      break;
    case 'verificationRecency':
      if (els.verificationRecency) els.verificationRecency.value = '';
      state.verificationRecencyDays = null;
      if (stateManager) stateManager.setState({ verificationRecencyDays: null });
      syncStateToManager();
      break;
    case 'sudServices':
      if (els.sudServices) {
        Array.from(els.sudServices.options).forEach((opt) => {
          opt.selected = false;
        });
        state.selectedSudServices = [];
        if (typeof syncChipsToSelect === 'function') syncChipsToSelect('sudServices');
        if (stateManager) stateManager.setState({ selectedSudServices: [] });
        syncStateToManager();
      }
      break;
    case 'serviceDomain':
      if (els.serviceDomain) els.serviceDomain.value = '';
      state.selectedServiceDomains = [];
      if (stateManager) stateManager.setState({ selectedServiceDomains: [] });
      syncStateToManager();
      break;
    case 'county':
      if (els.county) els.county.value = '';
      state.selectedCounty = null;
      if (stateManager) stateManager.setState({ selectedCounty: null });
      syncStateToManager();
      break;
    case 'query':
      if (els.q) {
        els.q.value = '';
        delete els.q.dataset.exactMatch;
        delete els.q.dataset.matchType;
      }
      break;
    default:
      break;
  }

  syncTopToggles();
  updateURLState();
  return plan.key;
}

/** Apply a FILTER_PRESETS entry (see js/config/constants.js). */
function applyPresetConfig(config) {
  if (!config || typeof config !== 'object') return;
  refreshEls();

  if (config.query !== undefined && els.q) {
    els.q.value = safeStr(config.query);
    if (!config.query) {
      delete els.q.dataset.exactMatch;
      delete els.q.dataset.matchType;
    }
  }
  if (config.location && els.loc) els.loc.value = config.location;
  if (config.age && els.age) {
    els.age.value = config.age;
  }
  if (config.care && els.care) els.care.value = config.care;
  if (config.insurance && els.insurance) els.insurance.value = config.insurance;
  if (config.onlyVirtual && els.onlyVirtual) els.onlyVirtual.checked = true;
  if (config.showCrisis && els.showCrisis) els.showCrisis.checked = true;
  if (config.serviceDomain && els.serviceDomain) {
    els.serviceDomain.value = config.serviceDomain;
    state.selectedServiceDomains = [config.serviceDomain];
  }
}

function applyFilterPreset(preset) {
  clearAllFilters();

  const presets = window.FILTER_PRESETS || {};
  const config = presets[preset];
  if (!config) {
    console.warn('Unknown filter preset:', preset);
    return;
  }
  applyPresetConfig(config);

  syncTopToggles();
  
  // Sync chips after preset is applied
  if (els.sudServices) {
    syncChipsToSelect('sudServices');
  }
  
  updateURLState();
  updateActiveFilterChips();
  window.flowMotion?.renderSearchQueryChips();

  if (typeof window.setFlowIntent === 'function' && document.body.dataset.intent !== 'treatment') {
    window.setFlowIntent('treatment', null);
  }

  unlockResults();
  render();

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const scrollTarget = document.getElementById('treatmentGrid') || document.getElementById('treatmentSection');

  if (typeof window.revealViableSearch === 'function') {
    window.revealViableSearch({
      focusSearch: false,
      scrollTargetId: scrollTarget?.id || null,
    });
  } else {
    const search = document.getElementById('searchSection');
    if (search) {
      search.classList.add('is-revealed');
    }
    if (scrollTarget) {
      scrollTarget.scrollIntoView({ behavior: motion, block: 'start' });
    }
  }
}

// Make functions globally available for onclick handlers
window.copyShareUrl = copyShareUrl;
window.nativeShare = nativeShare;
window.applyFilterPreset = applyFilterPreset;

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      callShowToast('Link copied to clipboard', 'success');
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    callShowToast('Link copied to clipboard', 'success');
  } catch (err) {
    callShowToast('Could not copy link', 'error');
  }
  document.body.removeChild(textarea);
}

function printProgram(programId) {
  const program = state.programDataMap.get(programId);
  if (!program) return;
  
  const printWindow = window.open('', '_blank');
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(safeStr(program.program_name))}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
        h1 { margin: 0 0 10px; }
        .info { margin: 10px 0; }
        .label { font-weight: bold; color: #666; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(safeStr(program.program_name))}</h1>
      <div class="info"><span class="label">Organization:</span> ${escapeHtml(safeStr(program.organization))}</div>
      <div class="info"><span class="label">Level of Care:</span> ${escapeHtml(safeStr(program.level_of_care))}</div>
      <div class="info"><span class="label">Location:</span> ${escapeHtml(locLabel(program))}</div>
      <div class="info"><span class="label">Phone:</span> ${escapeHtml(safeStr(program.phone))}</div>
      ${program.website_url ? `<div class="info"><span class="label">Website:</span> <a href="${escapeHtml(safeUrl(program.website_url))}">${escapeHtml(safeUrl(program.website_url))}</a></div>` : ''}
      <div class="info"><span class="label">Ages Served:</span> ${escapeHtml(safeStr(program.ages_served))}</div>
      <div class="info"><span class="label">Service Setting:</span> ${escapeHtml(safeStr(program.service_setting))}</div>
      ${program.notes ? `<div class="info"><span class="label">Notes:</span> ${escapeHtml(safeStr(program.notes))}</div>` : ''}
      <div style="margin-top: 30px; font-size: 12px; color: #666;">
        Printed from ViableMHR (viablemhr.com)
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function isValidRecentSearchQuery(query) {
  const trimmed = (query || '').trim();
  if (trimmed.length < 3) return false;
  if (/^accepts\.?$/i.test(trimmed)) return false;
  if (/^(accepts|accept)\s*\.?\s*$/i.test(trimmed)) return false;
  if (!/[a-z0-9]/i.test(trimmed)) return false;
  return true;
}

async function addRecentSearch(query) {
  if (!isValidRecentSearchQuery(query)) return;
  const trimmed = sanitizeText(query.trim(), 200);
  state.recentSearches = state.recentSearches.filter(s => s !== trimmed);
  state.recentSearches.unshift(trimmed);
  state.recentSearches = state.recentSearches.slice(0, 5); // Reduced from 10 to 5
  const STORAGE_KEYS = window.STORAGE_KEYS || { RECENT_SEARCHES: 'recentSearches' };
  await saveEncryptedDataFn(STORAGE_KEYS.RECENT_SEARCHES, state.recentSearches);
  renderRecentSearches();
}

function renderRecentSearches() {
  const container = document.getElementById('recentSearchesContainer')
    || document.querySelector('.recent-searches');
  if (!container) return;

  const validRecent = state.recentSearches.filter(isValidRecentSearchQuery);
  const queryEmpty = !els.q?.value?.trim();
  const shouldShow = validRecent.length > 0 && (state.recentSearchesPanelOpen || queryEmpty);

  if (!shouldShow) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  const recentToShow = validRecent.slice(0, 3);
  container.innerHTML = `
    <p class="recent-searches-title">Recent</p>
    <div class="recent-search-tags">
      ${recentToShow.map(search => `
        <button type="button" class="recent-search-tag" data-search="${escapeHtml(search)}" title="Click to search again">
          ${escapeHtml(search)}
        </button>
      `).join('')}
    </div>
  `;
  
  container.querySelectorAll('.recent-search-tag').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const search = btn.dataset.search;
      els.q.value = search;
      if (window.scheduleRenderFn) {
        window.scheduleRenderFn();
      } else {
        render();
      }
      const t = document.getElementById("treatmentSection");
      if (t) window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
    });
  });
}

if (typeof window !== 'undefined') {
  window.setRecentSearchesPanelOpen = (open) => {
    state.recentSearchesPanelOpen = !!open;
    renderRecentSearches();
  };
  window.renderRecentSearches = renderRecentSearches;
}

function renderFavorites() {
  // SECURITY AUDIT FIX: Add null check before DOM manipulation
  if (!els.favoritesList) {
    console.warn('Favorites list element not found');
    return;
  }

  const favoritePrograms = state.programs.filter(p => {
    const id = stableIdFor(p, state.programs.indexOf(p));
    return state.favorites.has(id);
  });
  
  if (favoritePrograms.length === 0) {
    els.favoritesList.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">No saved programs yet. Click the star icon on any program card to save it.</p>';
    const exportBtn = document.getElementById('exportFavorites');
    if (exportBtn) exportBtn.style.display = 'none';
    return;
  }
  
  els.favoritesList.innerHTML = '<div class="grid favorites-grid"></div>';
  const grid = els.favoritesList.querySelector('.grid');
  
  favoritePrograms.forEach((p, idx) => {
    const card = appCreateCard(p, idx);
    
    // Add "Recently Updated" badge to badgeRow if card is recent (instead of ::after overlay)
    if (card.dataset.recent === 'true') {
      const badgeRow = card.querySelector('.badgeRow');
      if (badgeRow) {
        const recentBadge = document.createElement('span');
        recentBadge.className = 'badge recent';
        recentBadge.textContent = 'Recently Updated';
        badgeRow.appendChild(recentBadge);
      }
    }
    
    // Make modal cards self-contained: replace panel with modal-local details
    const panel = card.querySelector('.panel');
    if (panel) {
      // Create modal-local details container
      const modalDetails = document.createElement('div');
      modalDetails.className = 'card-details';
      modalDetails.setAttribute('hidden', '');
      modalDetails.innerHTML = panel.innerHTML;
      
      // Replace panel with modal details
      panel.replaceWith(modalDetails);
      
      // Set initial state: card starts collapsed
      card.dataset.open = 'false';
      
      // Update expand button to target modal details instead of main page
      const expandBtn = card.querySelector('.expandBtn');
      if (expandBtn) {
        expandBtn.setAttribute('aria-controls', `modal-details-${card.dataset.id}`);
        expandBtn.setAttribute('aria-expanded', 'false');
        expandBtn.setAttribute('title', 'Expand details');
        expandBtn.setAttribute('type', 'button'); // Ensure it's a button
        modalDetails.id = `modal-details-${card.dataset.id}`;
        
        // Remove any existing handlers
        expandBtn.onclick = null;
        expandBtn.ontouchend = null;
        expandBtn.onpointerup = null;
        
        // Create a unified handler with debounce guard to prevent double toggles
        const handleExpand = (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation(); // Prevent other handlers
          
          // Guard against double toggles (e.g., touch + synthetic click)
          const now = Date.now();
          const lastToggleTs = parseInt(expandBtn.dataset.lastToggleTs || '0', 10);
          if (now - lastToggleTs < 350) {
            return; // Ignore if fired within 350ms of last toggle
          }
          
          // Update timestamp before toggling
          expandBtn.dataset.lastToggleTs = now.toString();
          toggleModalCardDetails(card);
        };
        
        // Use pointerup for all devices (unified event), with click fallback
        if (window.PointerEvent) {
          expandBtn.addEventListener('pointerup', handleExpand, { passive: false });
        } else {
          // Fallback for browsers without PointerEvent support
          expandBtn.addEventListener('click', handleExpand, { passive: false });
        }
      }
    }
    
    grid.appendChild(card);
  });
  
  // Setup event delegation for favorites grid (but exclude expand buttons which are handled above)
  setupCardEventDelegation(grid);
  
  // Show export button
  const exportBtn = document.getElementById('exportFavorites');
  if (exportBtn) exportBtn.style.display = 'block';
}

// Print/Export saved programs list
function exportFavorites() {
  const favoritePrograms = state.programs.filter(p => {
    const id = stableIdFor(p, state.programs.indexOf(p));
    return state.favorites.has(id);
  });
  
  if (favoritePrograms.length === 0) {
    callShowToast('No saved programs to export', 'error');
    return;
  }
  
  // Create print-friendly HTML
  const printWindow = window.open('', '_blank');
  const addresses = (p) => {
    if (!Array.isArray(p.locations) || p.locations.length === 0) return 'Not listed';
    return p.locations.map(l => {
      const parts = [l.address, l.city, l.state, l.zip].filter(Boolean);
      return parts.join(', ');
    }).join('; ');
  };
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Saved Programs - Mental Health Resource Navigator</title>
      <style>
        @media print {
          @page { margin: 1in; }
          body { margin: 0; }
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #1e293b;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 { font-size: 24px; margin-bottom: 8px; }
        .meta { font-size: 14px; color: #64748b; margin-bottom: 32px; }
        .program {
          margin-bottom: 32px;
          padding-bottom: 24px;
          border-bottom: 1px solid #e2e8f0;
          page-break-inside: avoid;
        }
        .program:last-child { border-bottom: none; }
        .program-name { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
        .program-org { font-size: 14px; color: #64748b; margin-bottom: 12px; }
        .program-details {
          display: grid;
          gap: 8px;
          font-size: 14px;
        }
        .program-details strong { color: #1e293b; }
        .program-notes { margin-top: 12px; font-size: 13px; color: #64748b; font-style: italic; }
      </style>
    </head>
    <body>
      <h1>Saved Programs</h1>
      <div class="meta">Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      ${favoritePrograms.map(p => `
        <div class="program">
          <div class="program-name">${escapeHtml(safeStr(p.program_name) || 'Program')}</div>
          <div class="program-org">${escapeHtml(safeStr(p.organization) || '')}</div>
          <div class="program-details">
            ${safeStr(p.phone) ? `<div><strong>Phone:</strong> ${escapeHtml(p.phone)}</div>` : ''}
            ${safeStr(p.website_url || p.website) ? `<div><strong>Website:</strong> ${escapeHtml(p.website_url || p.website)}</div>` : ''}
            ${addresses(p) !== 'Not listed' ? `<div><strong>Location:</strong> ${escapeHtml(addresses(p))}</div>` : ''}
            ${safeStr(p.level_of_care) ? `<div><strong>Level of care:</strong> ${escapeHtml(p.level_of_care)}</div>` : ''}
            ${safeStr(p.ages_served) ? `<div><strong>Ages served:</strong> ${escapeHtml(p.ages_served)}</div>` : ''}
          </div>
          ${safeStr(p.notes) ? `<div class="program-notes">${escapeHtml(p.notes)}</div>` : ''}
        </div>
      `).join('')}
    </body>
    </html>
  `);
  
  printWindow.document.close();
  
  // Wait for content to load, then trigger print dialog
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

function renderCallHistory() {
  // SECURITY AUDIT FIX: Add null check before DOM manipulation
  if (!els.historyList) {
    console.warn('History list element not found');
    return;
  }

  if (state.callHistory.length === 0) {
    els.historyList.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">No call history yet. Call buttons will appear here after you use them.</p>';
    return;
  }
  
  els.historyList.innerHTML = state.callHistory.map(call => {
    const date = new Date(call.timestamp);
    return `
      <div class="card" style="margin-bottom: 12px;">
        <div class="cardTop">
          <div>
            <p class="pname">${escapeHtml(call.program)}</p>
            <p class="org">${escapeHtml(call.org)}</p>
          </div>
        </div>
        <div class="meta">
          <span>Called: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderProgressive(activeList, isCrisisList = false, appendOnly = false) {
  if (!els.treatmentGrid) return;
  
  const existingCards = appendOnly ? els.treatmentGrid.querySelectorAll('.card').length : 0;
  const startIndex = appendOnly ? existingCards : 0;
  const toDisplay = activeList.slice(startIndex, state.progressiveLoadState.displayedCount);
  if (!appendOnly) {
    els.treatmentGrid.innerHTML = "";
  }
  
  // Use DocumentFragment to batch DOM operations
  const fragment = document.createDocumentFragment();
  
  toDisplay.forEach((p, idx) => {
    const absoluteIdx = startIndex + idx;
    const realIdx = isCrisisList ? (absoluteIdx + 10000) : absoluteIdx;
    const card = appCreateCard(p, realIdx);
    // Use CSS variable instead of inline style for animation delay
    card.style.setProperty('--enter-delay', `${Math.min(idx, 18) * 18}ms`);
    fragment.appendChild(card);
  });
  
  // Append all cards at once
  els.treatmentGrid.appendChild(fragment);
  
  // Event delegation is handled at document level - no need to set up here
  
  // Show "Load More" button if there are more items
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (activeList.length > state.progressiveLoadState.displayedCount) {
    if (!loadMoreBtn) {
      const btn = document.createElement('button');
      btn.id = 'loadMoreBtn';
      btn.className = 'btn-primary';
      btn.textContent = `Load More (${activeList.length - state.progressiveLoadState.displayedCount} remaining)`;
      btn.style.margin = '20px auto';
      btn.style.display = 'block';
      btn.addEventListener('click', () => {
        state.progressiveLoadState.displayedCount = Math.min(
          state.progressiveLoadState.displayedCount + 20,
          activeList.length
        );
        // Use requestIdleCallback for progressive loading if available
        const loadMore = () => renderProgressive(activeList, isCrisisList, true);
        if (window.requestIdleCallback) {
          requestIdleCallback(loadMore, { timeout: 1000 });
        } else {
          setTimeout(loadMore, 0);
        }
      });
      els.treatmentGrid.parentElement.appendChild(btn);
    } else {
      loadMoreBtn.textContent = `Load More (${activeList.length - state.progressiveLoadState.displayedCount} remaining)`;
      loadMoreBtn.style.display = 'block';
    }
  } else if (loadMoreBtn) {
    loadMoreBtn.style.display = 'none';
  }
}

function render(){
  if (!state.ready) {
    if (els.treatmentGrid) els.treatmentGrid.dataset.state = 'loading';
    updateResultsAwaitingPanel();
    if (!state.resultsUnlocked) renderResultsLocked();
    return;
  }

  // Handoff and other catalog-only pages load programs but have no results grid.
  if (!els.treatmentGrid) {
    return;
  }

  if (!state.resultsUnlocked) {
    renderResultsLocked();
    return;
  }

  const generation = ++state.renderGeneration;
  refreshEls();
  const showCrisis = els.showCrisis?.checked || false;
  const { filters: filterSnapshot, options: filterOptions } = getFilterModuleBindings(showCrisis);

  const filterFn = typeof window.matchesFilters === 'function'
    ? (p) => window.matchesFilters(p, filterSnapshot, filterOptions)
    : matchesFiltersFallback;

  const filtered = state.programs.filter(filterFn);

  const treatment = filtered.filter(p => !isCrisis(p));
  const crisis = filtered.filter(p => isCrisis(p));

  let activeList = showCrisis ? crisis : treatment;

  const activeLabel = showCrisis ? "Crisis Resources" : "Treatment Programs";
  
  // Calculate relevance scores for all results (use same snapshot as filtering)
  const query = safeStr(filterSnapshot.query || '').trim();
  const textTerms =
    typeof window.getTextSearchTerms === 'function'
      ? window.getTextSearchTerms(query)
      : query;
  const isExactMatch = filterSnapshot.exactMatch === true;
  const applyRelevanceCutoff =
    query.length >= 3 &&
    textTerms.length > 0 &&
    !isExactMatch;

  if (query) {
    const scoreFn = (p) => getProgramRelevanceScore(p, query);

    // Map programs with their relevance scores
    let scoredPrograms = activeList.map(p => ({
      program: p,
      score: scoreFn(p)
    }));

    if (applyRelevanceCutoff) {
      scoredPrograms = scoredPrograms.filter((sp) => sp.score > 0);
    }
    
    // Sort by relevance score (highest first) when sort is "relevance"
    const SORT_OPTIONS = window.SORT_OPTIONS || { RELEVANCE: 'relevance' };
    if (state.currentSort === SORT_OPTIONS.RELEVANCE) {
      scoredPrograms.sort((a, b) => b.score - a.score);
      activeList = scoredPrograms.map(sp => sp.program);
    } else {
      // For other sorts, apply the selected sort but relevance is still calculated
      // Use sort module if available, fallback to local function
      const sortFn = typeof window.sortPrograms === 'function'
        ? (list) => {
            const options = {
              safeStr: window.safeStr,
              locLabel: window.locLabel,
              calculateProgramDistance: window.calculateProgramDistance,
              userLocation: state.userLocation,
              SORT_OPTIONS: window.SORT_OPTIONS || {
                RELEVANCE: 'relevance',
                NAME: 'name',
                VERIFIED: 'verified',
                LOCATION: 'location',
                DISTANCE: 'distance'
              }
            };
            return window.sortPrograms(list, state.currentSort, options);
          }
        : sortProgramsLocal; // Fallback to local function
      activeList = sortFn(activeList);
    }
  } else {
    // No query - just apply normal sorting
    // Use sort module if available, fallback to local function
    const sortFn = typeof window.sortPrograms === 'function'
      ? (list) => {
          const options = {
            safeStr: window.safeStr,
            locLabel: window.locLabel,
            calculateProgramDistance: window.calculateProgramDistance,
            userLocation: state.userLocation,
            SORT_OPTIONS: window.SORT_OPTIONS || {
              RELEVANCE: 'relevance',
              NAME: 'name',
              VERIFIED: 'verified',
              LOCATION: 'location',
              DISTANCE: 'distance'
            }
          };
          return window.sortPrograms(list, state.currentSort, options);
        }
      : sortProgramsLocal; // Fallback to local function
    activeList = sortFn(activeList);
  }
  
  // Store for progressive loading
  state.progressiveLoadState.allItems = activeList;
  state.progressiveLoadState.displayedCount = Math.min(20, activeList.length);

  if (state.openId){
    const stillExists = activeList.some((p, idx) => stableIdFor(p, idx) === state.openId);
    if (!stillExists) state.openId = null;
  }

  if (generation !== state.renderGeneration) {
    return;
  }

  updateActiveFilterChips();

  if (els.sectionTitle) els.sectionTitle.textContent = activeLabel;
  if (els.resultsLabel) els.resultsLabel.textContent = showCrisis ? "crisis matches" : "treatment matches";
  if (els.totalCount) els.totalCount.textContent = String(activeList.length);
  
  // Update aria-live results count for screen readers
  const resultsAnnouncer = document.getElementById('resultsCountAnnouncer');
  if (resultsAnnouncer) {
    const count = activeList.length;
    resultsAnnouncer.textContent = count === 0 
      ? 'No programs found' 
      : `Showing ${count} program${count === 1 ? '' : 's'}`;
  }

  // Use progressive loading for large result sets
  if (activeList.length > 20) {
    renderProgressive(activeList, showCrisis);
  } else {
    // Small result sets - render all at once
    if (els.treatmentGrid) {
      els.treatmentGrid.innerHTML = "";
      
      // Use DocumentFragment to batch DOM operations
      const fragment = document.createDocumentFragment();
      
      activeList.forEach((p, idx) => {
        const realIdx = showCrisis ? (idx + 10000) : idx;
        const card = appCreateCard(p, realIdx);
        // Use CSS variable instead of inline style for animation delay
        card.style.setProperty('--enter-delay', `${Math.min(idx, 18) * 18}ms`);
        fragment.appendChild(card);
      });
      
      // Append all cards at once
      els.treatmentGrid.appendChild(fragment);
      // Event delegation is handled at document level
    }
    
    // Remove load more button if it exists
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
  }

  if (els.treatmentCount) els.treatmentCount.textContent = `${activeList.length} result${activeList.length===1?"":"s"}`;

  const resultsIntro = document.getElementById('resultsIntro');
  if (resultsIntro) {
    if (showCrisis) {
      resultsIntro.textContent = activeList.length === 0
        ? 'No crisis resources match these filters. Try clearing filters or turn off other filters.'
        : `Showing ${activeList.length} crisis resource${activeList.length === 1 ? '' : 's'}.`;
    } else if (activeList.length === 0) {
      resultsIntro.textContent = 'No treatment programs match these filters. Try clearing filters or use View all in the search panel.';
    } else {
      resultsIntro.textContent = `Showing ${activeList.length} treatment program${activeList.length === 1 ? '' : 's'}. Use filters above to narrow results; crisis resources stay hidden unless you enable them.`;
    }
  }

  // Show/hide empty state with improved messaging
  if (els.treatmentEmpty) {
    if (activeList.length === 0) {
      updateEmptyStateDisplay();
      els.treatmentEmpty.style.display = "block";
      els.treatmentGrid.style.display = "none";
    } else {
      els.treatmentEmpty.style.display = "none";
      // Remove inline display override to let CSS control layout (CSS defines .grid as flex, not grid)
      // IMPORTANT: Never set display="grid" here - it would override CSS flex layout and break multi-column wrapping
      els.treatmentGrid.style.display = "";
    }
  }
  
  // Dev-only regression guard: warn if treatmentGrid computed display becomes "grid" (would break flex layout)
  checkTreatmentGridDisplayRegression();

  const count = activeList.length;
  const label = showCrisis ? "crisis resources" : "treatment programs";
  announceToScreenReader(`${count} ${label} found${count === 0 ? '. Try adjusting your filters.' : ''}`);
  updateComparisonCount();

  if (typeof window.VMHRProductMetrics?.recordSearchOutcome === 'function') {
    window.VMHRProductMetrics.recordSearchOutcome({
      resultsCount: count,
      filters: filterSnapshot,
      showCrisis,
    });
  }

  if (window.flowMotion) {
    window.flowMotion.setTreatmentGridState(activeList.length);
    window.flowMotion.flashResultsCount();
  }

  document.dispatchEvent(new CustomEvent('vmhr:rendered', { detail: { count: activeList.length, showCrisis } }));
}

// ========== Autocomplete ==========
function generateAutocompleteSuggestions(query) {
  if (!query || query.length < 2) return [];
  
  const q = query.toLowerCase().trim();
  const suggestions = [];
  const seen = new Set();
  
  // Recent searches
  state.recentSearches.forEach(search => {
    if (search.toLowerCase().includes(q) && !seen.has(search)) {
      suggestions.push({ type: 'recent', text: search });
      seen.add(search);
    }
  });
  
  // Program names and organizations - search ALL programs, not just first 50
  if (state.ready && state.programs.length > 0) {
    const exactMatches = [];
    const fuzzyMatches = [];
    
    state.programs.forEach(p => {
      const programName = safeStr(p.program_name);
      const orgName = safeStr(p.organization);
      
      // Check for exact matches first (highest priority)
      if (programName) {
        const progLower = programName.toLowerCase();
        if (progLower === q) {
          exactMatches.push({ type: 'program', text: programName, program: p, isExact: true });
        } else if (progLower.includes(q) || q.includes(progLower)) {
          exactMatches.push({ type: 'program', text: programName, program: p, isExact: false });
        } else if (window.fuzzyMatch && window.fuzzyMatch(q, programName, 0.6) && !seen.has(programName)) {
          fuzzyMatches.push({ type: 'program', text: programName, program: p, isExact: false });
          seen.add(programName);
        }
      }
      
      if (orgName && orgName !== programName) {
        const orgLower = orgName.toLowerCase();
        // Collect all programs for this organization
        const orgPrograms = state.orgProgramsIndex.get(orgLower) || [];
        
        if (orgLower === q) {
          exactMatches.push({ type: 'organization', text: orgName, programs: orgPrograms, isExact: true });
        } else if (orgLower.includes(q) || q.includes(orgLower)) {
          exactMatches.push({ type: 'organization', text: orgName, programs: orgPrograms, isExact: false });
        } else if (window.fuzzyMatch && window.fuzzyMatch(q, orgName, 0.6) && !seen.has(orgName)) {
          fuzzyMatches.push({ type: 'organization', text: orgName, programs: orgPrograms, isExact: false });
          seen.add(orgName);
        }
      }
    });
    
    // Add exact matches first, then fuzzy matches
    exactMatches.forEach(s => {
      if (!seen.has(s.text)) {
        suggestions.push(s);
        seen.add(s.text);
      }
    });
    fuzzyMatches.forEach(s => {
      if (!seen.has(s.text)) {
        suggestions.push(s);
        seen.add(s.text);
      }
    });
  }
  
  // City suggestions
  const cities = ['Dallas', 'Plano', 'Frisco', 'McKinney', 'Richardson', 'Denton', 
    'Arlington', 'Fort Worth', 'Mansfield', 'Keller', 'De Soto', 'Rockwall'];
  
  cities.forEach(city => {
    if (window.fuzzyMatch && window.fuzzyMatch(q, city.toLowerCase(), 0.7) && !seen.has(city)) {
      suggestions.push({ type: 'location', text: `${city} programs` });
      seen.add(city);
    }
  });
  
  // Sort suggestions: exact matches first, then by type priority
  suggestions.sort((a, b) => {
    // Exact matches first
    if (a.isExact && !b.isExact) return -1;
    if (!a.isExact && b.isExact) return 1;
    // Then prioritize: organization > program > location > recent
    const typeOrder = { organization: 0, program: 1, location: 2, recent: 3 };
    return (typeOrder[a.type] || 5) - (typeOrder[b.type] || 5);
  });
  
  return suggestions.slice(0, 10); // Limit to 10 suggestions for better coverage
}

function updateAutocompleteActiveDescendant(index) {
  const input = els.q;
  if (!input) return;
  if (index >= 0) {
    input.setAttribute('aria-activedescendant', `search-sug-${index}`);
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

function renderAutocomplete(suggestions) {
  const container = document.getElementById('search-suggestions');
  const input = els.q;
  
  if (!container || !input) return;
  
  if (suggestions.length === 0) {
    container.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
    updateAutocompleteActiveDescendant(-1);
    state.autocompleteVisible = false;
    return;
  }
  
  state.autocompleteSuggestions = suggestions;
  state.autocompleteSelectedIndex = -1;
  state.autocompleteVisible = true;
  input.setAttribute('aria-expanded', 'true');
  updateAutocompleteActiveDescendant(-1);
  
  // Helper function to remove emojis from text
  const removeEmojis = (text) => {
    if (!text) return '';
    // Remove emoji characters (Unicode ranges for emojis)
    return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu, '').trim();
  };
  
  const html = suggestions.map((suggestion, index) => {
    // No emojis - use text labels instead
    const label = suggestion.type === 'recent' ? 'Recent' :
                 suggestion.type === 'program' ? 'Program' :
                 suggestion.type === 'organization' ? 'Organization' : 'Location';
    // Remove any emojis from the suggestion text itself
    const cleanText = removeEmojis(suggestion.text);
    return `
      <div class="suggestion-item" role="option" id="search-sug-${index}" data-index="${index}" aria-selected="false">
        <span class="suggestion-label">${escapeHtml(label)}</span>
        <span class="suggestion-text">${escapeHtml(cleanText)}</span>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
  container.style.display = 'block';
  
  // Remove any existing click handler to prevent duplicates
  // Use a single delegated click handler that's set up once in bind()
  // For now, we'll use a one-time handler that removes itself
  const clickHandler = (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    
    const indexAttr = item.getAttribute('data-index');
    if (indexAttr !== null) {
      const index = parseInt(indexAttr, 10);
      // Use autocompleteSuggestions instead of suggestions parameter
      if (!isNaN(index) && index >= 0 && index < state.autocompleteSuggestions.length) {
        e.preventDefault();
        e.stopPropagation();
        selectSuggestion(index);
      }
    }
  };
  
  // Remove old listener if it exists, then add new one
  container.removeEventListener('click', container._autocompleteClickHandler);
  container._autocompleteClickHandler = clickHandler;
  container.addEventListener('click', clickHandler);
  
  // Add mouseenter handlers for hover effect
  container.querySelectorAll('.suggestion-item').forEach((item, index) => {
    item.addEventListener('mouseenter', () => {
      setSelectedSuggestion(index);
    });
  });
}

function setSelectedSuggestion(index) {
  const container = document.getElementById('search-suggestions');
  if (!container) return;
  
  const items = container.querySelectorAll('.suggestion-item');
  items.forEach((item, i) => {
    const isSelected = i === index;
    item.classList.toggle('selected', isSelected);
    item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });
  
  state.autocompleteSelectedIndex = index;
  updateAutocompleteActiveDescendant(index);
}

function selectSuggestion(index) {
  if (index < 0 || index >= state.autocompleteSuggestions.length) return;
  
  const suggestion = state.autocompleteSuggestions[index];
  
  // For organization suggestions, use the exact organization name from the database
  // This ensures case-sensitive matching works correctly
  if (suggestion.type === 'organization' && suggestion.programs && suggestion.programs.length > 0) {
    // Use the organization name from the first program to ensure exact match
    els.q.value = safeStr(suggestion.programs[0].organization);
    els.q.dataset.exactMatch = 'true';
    els.q.dataset.matchType = 'organization';
  } else if (suggestion.type === 'program' && suggestion.program) {
    // For program suggestions, use the exact program name
    els.q.value = safeStr(suggestion.program.program_name);
    els.q.dataset.exactMatch = suggestion.isExact ? 'true' : 'false';
    els.q.dataset.matchType = 'program';
  } else {
    // For other types (recent, location), use the suggestion text
    els.q.value = suggestion.text;
    delete els.q.dataset.exactMatch;
    delete els.q.dataset.matchType;
  }
  
  // Hide autocomplete
  const container = document.getElementById('search-suggestions');
  if (container) {
    container.style.display = 'none';
  }
  els.q.setAttribute('aria-expanded', 'false');
  updateAutocompleteActiveDescendant(-1);
  state.autocompleteVisible = false;
  
  // Clear any previous search state and trigger fresh search
  // Use a small delay to ensure the input value is set
  setTimeout(() => {
    if (window.scheduleRenderFn) {
      window.scheduleRenderFn();
    } else {
      render();
    }
    
    // Scroll to results
    const t = document.getElementById("treatmentSection");
    if (t) window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  }, 10);
}

function hideAutocomplete() {
  const container = document.getElementById('search-suggestions');
  if (container) {
    container.style.display = 'none';
  }
  if (els.q) {
    els.q.setAttribute('aria-expanded', 'false');
    updateAutocompleteActiveDescendant(-1);
  }
  state.autocompleteVisible = false;
  state.autocompleteSelectedIndex = -1;
}

// ========== Mobile Swipe Gestures ==========
function initSwipeGestures() {
  if (!els.treatmentGrid) return;
  
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  const minSwipeDistance = 50;
  
  // CRITICAL FIX: Disable touch swipe handlers on mobile - they might cause stutter
  // Swipe to dismiss cards is not essential and can cause performance issues
  if (false) { // DISABLED
    els.treatmentGrid.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });
    
    els.treatmentGrid.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
    
    // Only handle horizontal swipes if they're more horizontal than vertical
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      const cards = Array.from(els.treatmentGrid.querySelectorAll('.card[data-open="true"]'));
      if (cards.length > 0) {
        // Swipe left to close, swipe right to open previous
        if (deltaX < 0) {
          // Swipe left - close current card
          const currentCard = cards[0];
          if (currentCard) {
            const id = currentCard.dataset.id;
            toggleOpen(id);
          }
        }
      }
    }
  }, { passive: true });
  } // End of disabled touch swipe block
}

function bind(){
  // Use events module for event handler setup
  if (typeof window.setupEventHandlers !== 'function') {
    console.error('setupEventHandlers not available. Make sure js/modules/events.js is loaded.');
      return;
    }

  // Handoff and other pages load app.js for programDataMap only — no search UI.
  if (!document.getElementById('q') && !document.getElementById('treatmentGrid')) {
    return;
  }
    
  // Setup state accessors - use StateManager if available, fallback to legacy variables
  const stateAccessors = {
    getReady: () => stateManager ? stateManager.getState('ready') : state.ready,
    getOpenId: () => stateManager ? stateManager.getState('openId') : state.openId,
    setOpenId: (id) => {
      if (stateManager) {
        stateManager.setState({ openId: id });
        state.openId = id; // Update local variable directly
      } else {
        state.openId = id;
      }
    },
    getCurrentSort: () => stateManager ? stateManager.getState('currentSort') : state.currentSort,
    setCurrentSort: (sort) => {
      if (stateManager) {
        stateManager.setState({ currentSort: sort });
        state.currentSort = sort; // Update local variable directly
      } else {
        state.currentSort = sort;
      }
    },
    getUserLocation: () => stateManager ? stateManager.getState('userLocation') : state.userLocation,
    setUserLocation: (loc) => {
      if (stateManager) {
        stateManager.setState({ userLocation: loc });
        state.userLocation = loc; // Update local variable directly
      } else {
        state.userLocation = loc;
      }
    },
    getPrograms: () => stateManager ? stateManager.getState('programs') : state.programs,
    getSelectedCounty: () => stateManager ? stateManager.getState('selectedCounty') : state.selectedCounty,
    setSelectedCounty: (county) => {
      if (stateManager) {
        stateManager.setState({ selectedCounty: county });
        state.selectedCounty = county; // Update local variable directly
      } else {
        state.selectedCounty = county;
      }
    },
    getSelectedServiceDomains: () => stateManager ? stateManager.getState('selectedServiceDomains') : state.selectedServiceDomains,
    setSelectedServiceDomains: (domains) => {
      if (stateManager) {
        stateManager.setState({ selectedServiceDomains: domains });
        state.selectedServiceDomains = domains; // Update local variable directly
      } else {
        state.selectedServiceDomains = domains;
      }
    },
    getSelectedSudServices: () => stateManager ? stateManager.getState('selectedSudServices') : state.selectedSudServices,
    setSelectedSudServices: (services) => {
      if (stateManager) {
        stateManager.setState({ selectedSudServices: services });
        state.selectedSudServices = services; // Update local variable directly
      } else {
        state.selectedSudServices = services;
      }
    },
    getVerificationRecencyDays: () => stateManager ? stateManager.getState('verificationRecencyDays') : state.verificationRecencyDays,
    setVerificationRecencyDays: (days) => {
      if (stateManager) {
        stateManager.setState({ verificationRecencyDays: days });
        state.verificationRecencyDays = days; // Update local variable directly
        } else {
        state.verificationRecencyDays = days;
      }
    }
  };
  
  // Setup callbacks
  const callbacks = {
    render,
    updateURLState,
    loadURLState,
    hideAutocomplete,
    generateAutocompleteSuggestions,
    renderAutocomplete,
    addRecentSearch,
    setSelectedSuggestion,
    selectSuggestion,
    syncTopToggles,
    syncChipsToSelect,
    initChipMultiSelects,
    handleNearMeClick,
    handleStopLocationSharing,
    handleLocationConsentAllow,
    handleLocationConsentCancel,
    showModal,
    hideModal,
    renderFavorites,
    renderCallHistory,
    renderComparison: callRenderComparison,
    exportFavorites,
    shareCurrentFilters,
    applyFilterPreset,
    clearAllFilters: () => {
      clearAllFilters({ updateUrl: true, closeCards: true });
      lockResults();
      render();
    },
    unlockResults,
    lockResults,
    browseAllPrograms,
    broadenSearchOneStep: () => {
      broadenSearchOneStep();
      render();
    },
    setupPrivacyControls,
    setCardOpen,
    getAutocompleteVisible: () => state.autocompleteVisible,
    getAutocompleteSuggestions: () => state.autocompleteSuggestions,
    getAutocompleteSelectedIndex: () => state.autocompleteSelectedIndex,
    clearComparison: () => {
      state.comparisonSet.clear();
      saveComparison();
    }
  };
  
  refreshEls();
  // Call events module setup
  window.setupEventHandlers({ els, callbacks, state: stateAccessors });
  
  // Make scheduleRender accessible globally (set by events module)
  // window.scheduleRenderFn is set inside setupEventHandlers
}

function setupPrivacyControls() {
  const privacyModal = document.getElementById('privacyControls');
  const clearBtn = document.getElementById('clearAllData');
  const exportBtn = document.getElementById('exportMyData');
  const trackingToggle = document.getElementById('disableTracking');
  const closeBtn = privacyModal?.querySelector('.privacy-close');
  
  if (!privacyModal) return;
  
  // Keyboard shortcut: Ctrl+Shift+P (Cmd+Shift+P on Mac)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      const isHidden = privacyModal.style.display === 'none' || privacyModal.getAttribute('aria-hidden') === 'true';
      privacyModal.style.display = isHidden ? 'flex' : 'none';
      privacyModal.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
    }
  });
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      privacyModal.style.display = 'none';
      privacyModal.setAttribute('aria-hidden', 'true');
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (confirm('This will permanently delete all your saved data (favorites, search history, call history). Continue?')) {
        // Clear encrypted data
        localStorage.removeItem('encrypted_favorites');
        localStorage.removeItem('encrypted_recentSearches');
        localStorage.removeItem('encrypted_callHistory');
        localStorage.removeItem('comparison');
        localStorage.removeItem('securityLog');
        
        // Reset in memory
        state.favorites.clear();
        state.recentSearches = [];
        state.callHistory = [];
        state.comparisonSet.clear();
        
        // Update UI
        updateFavoritesCount();
        renderRecentSearches();
        renderCallHistory();
        callRenderComparison();
        render();
        
        callShowToast('All data cleared', 'success');
        privacyModal.style.display = 'none';
        privacyModal.setAttribute('aria-hidden', 'true');
      }
    });
  }
  
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const userData = {
        favorites: Array.from(state.favorites),
        recentSearches: state.recentSearches,
        callHistory: state.callHistory,
        comparison: Array.from(state.comparisonSet),
        exportedAt: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      callShowToast('Data exported', 'success');
    });
  }
  
  if (trackingToggle) {
    trackingToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        // Use sessionStorage instead of localStorage for sensitive data
        localStorage.setItem('disableTracking', 'true');
        callShowToast('Tracking disabled - data will clear when browser closes', 'success');
      } else {
        localStorage.removeItem('disableTracking');
        callShowToast('Tracking enabled', 'success');
      }
    });
    
    // Check initial state
    trackingToggle.checked = localStorage.getItem('disableTracking') === 'true';
  }
}

// ========== Geolocation Functions ==========
async function loadGeocodedData() {
  try {
    const response = await fetch('programs.geocoded.json');
    if (response.ok) {
      const data = await response.json();
      state.geocodedPrograms = new Map();
      if (data.programs && Array.isArray(data.programs)) {
        data.programs.forEach(program => {
          state.geocodedPrograms.set(program.program_id, program);
        });
      }
      console.log(`Loaded ${state.geocodedPrograms.size} geocoded programs`);
      return true;
    } else {
      console.warn('Geocoded data file not found (this is okay if not yet generated)');
    }
  } catch (error) {
    // Silently fail - geocoded data is optional
    console.warn('Geocoded data not available:', error.message);
  }
  return false;
}

function mergeGeocodedData(programs) {
  if (!state.geocodedPrograms || state.geocodedPrograms.size === 0) {
    return programs;
  }
  
  return programs.map(program => {
    const geocoded = state.geocodedPrograms.get(program.program_id);
    if (geocoded && geocoded.locations) {
      const merged = { ...program };
      merged.locations = program.locations.map((loc, idx) => {
        const geoLoc = geocoded.locations[idx];
        if (geoLoc && geoLoc.geo) {
          // Merge geo data, preserving any existing geo structure
          const existingGeo = loc.geo || {};
          return { 
            ...loc, 
            geo: {
              lat: geoLoc.geo.lat !== undefined ? geoLoc.geo.lat : existingGeo.lat,
              lng: geoLoc.geo.lng !== undefined ? geoLoc.geo.lng : existingGeo.lng,
              precision: geoLoc.geo.precision || existingGeo.precision || 'street'
            }
          };
        }
        return loc;
      });
      return merged;
    }
    return program;
  });
}

// ========== Available Filters Detection ==========
// Compute which filters are available based on loaded program data
function computeAvailableFilters(programsList) {
  if (!programsList || programsList.length === 0) {
    return {
      hasCounty: false,
      hasServiceDomains: false,
      hasSUD: false,
      hasVerification: false,
      hasServiceArea: false
    };
  }
  
  let hasCounty = false;
  let hasServiceDomains = false;
  let hasSUD = false;
  let hasVerificationCount = 0;
  let hasServiceArea = false;
  
  programsList.forEach(program => {
    // Check for county data
    if (!hasCounty) {
      if (program.primary_county && program.primary_county.trim()) {
        hasCounty = true;
      } else if (program.service_area && program.service_area.counties && 
                 Array.isArray(program.service_area.counties) && 
                 program.service_area.counties.length > 0) {
        hasCounty = true;
      }
    }
    
    // Check for service_domains beyond default mental_health
    if (!hasServiceDomains && program.service_domains && Array.isArray(program.service_domains)) {
      const domains = program.service_domains;
      if (domains.length > 0 && 
          !(domains.length === 1 && domains[0] === 'mental_health')) {
        hasServiceDomains = true;
      }
    }
    
    // Check for SUD services
    if (!hasSUD) {
      if (program.service_domains && Array.isArray(program.service_domains)) {
        if (program.service_domains.includes('substance_use') || 
            program.service_domains.includes('co_occurring')) {
          hasSUD = true;
        }
      }
      if (!hasSUD && program.sud_services && 
          Array.isArray(program.sud_services) && 
          program.sud_services.length > 0) {
        hasSUD = true;
      }
    }
    
    // Check for verification data (new structure or legacy)
    if (program.verification && program.verification.last_verified_at) {
      hasVerificationCount++;
    } else if (program.last_verified && program.last_verified.trim()) {
      hasVerificationCount++;
    }
    
    // Check for service_area
    if (!hasServiceArea && program.service_area && program.service_area.type) {
      hasServiceArea = true;
    }
  });
  
  // hasVerification is true if >= 50% of programs have verification
  const hasVerification = hasVerificationCount >= Math.ceil(programsList.length * 0.5);
  
  return {
    hasCounty,
    hasServiceDomains,
    hasSUD,
    hasVerification,
    hasServiceArea
  };
}

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

// Display last updated date from metadata
function parseMetadataDate(dateStr) {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T12:00:00`)
      : new Date(raw);
    return !isNaN(date.getTime()) ? date : null;
  } catch (_) {
    return null;
  }
}

function updateLastUpdatedDisplay() {
  const lastUpdatedEl = document.getElementById('lastUpdated');
  if (!lastUpdatedEl) return;

  if (!state.programsMetadata) {
    lastUpdatedEl.textContent = '';
    return;
  }

  const dateStr =
    state.programsMetadata.last_full_verification ||
    state.programsMetadata.generatedAt ||
    state.programsMetadata.generated_at;
  const date = parseMetadataDate(dateStr);
  if (date) {
    const formatted = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    lastUpdatedEl.textContent = `Program list updated: ${formatted}`;
    return;
  }

  lastUpdatedEl.textContent = 'Verification dates are shown on each program listing.';
}

// Dev-only: Check if treatmentGrid has display:grid (would break flex layout)
// This warns once per page load if the computed display becomes "grid" instead of "flex"
function checkTreatmentGridDisplayRegression() {
  // Only run in dev environments (localhost or 127.0.0.1, or with ?debug=1)
  // NOTE: Removed *.pages.dev from dev detection to prevent forced layout on production
  const isDev = typeof window !== 'undefined' && (
    window.location.hostname.includes('localhost') ||
    window.location.hostname.includes('127.0.0.1') ||
    new URLSearchParams(window.location.search).get('debug') === '1'
  );
  
  // Set flag BEFORE any checks to prevent multiple runs, even if check doesn't trigger warning
  if (!isDev || state.didWarnDisplayGrid || !els.treatmentGrid) {
    return;
  }
  
  // Mark as checked immediately to prevent re-running (set BEFORE getComputedStyle)
  state.didWarnDisplayGrid = true;
  
  const computedDisplay = window.getComputedStyle(els.treatmentGrid).display;
  if (computedDisplay === 'grid') {
    console.warn(
      '⚠️ WARNING: treatmentGrid computed display is "grid" (expected "flex"). ' +
      'Inline style or CSS regression may break multi-column layout. ' +
      'The .grid class should use display:flex, not display:grid.'
    );
  }
}

// ========== Program Data Normalization ==========
// Normalizes program data to a canonical internal format
// Supports both program-level and location-level service_domain/sud_services
// Returns a normalized program object ready for filtering and rendering
function normalizeProgramData(p, normalizeCityFn = (city) => city) {
  // Normalize locations and migrate lat/lng to geo structure
  const normalizedLocations = Array.isArray(p.locations) ? p.locations.map(loc => {
    const normalized = {
      ...loc,
      city: loc.city ? normalizeCityFn(loc.city) : loc.city
    };
    
    // Migrate existing lat/lng to geo structure (backward compatibility)
    if (loc.lat !== undefined || loc.lng !== undefined) {
      normalized.geo = {
        lat: typeof loc.lat === 'number' ? loc.lat : (loc.geo?.lat),
        lng: typeof loc.lng === 'number' ? loc.lng : (loc.geo?.lng),
        precision: loc.geo?.precision || (loc.lat && loc.lng ? 'street' : 'city')
      };
      // Remove old lat/lng from location to avoid duplication
      delete normalized.lat;
      delete normalized.lng;
    } else if (loc.geo) {
      // Preserve existing geo structure
      normalized.geo = loc.geo;
    }
    
    return normalized;
  }) : [];
  
  // Determine service_domains - check program level first, then location level, then infer
  let service_domains = p.service_domains;
  if (!service_domains || !Array.isArray(service_domains) || service_domains.length === 0) {
    // Check location-level service_domains (aggregate unique values)
    const locationDomains = normalizedLocations
      .map(loc => loc.service_domains)
      .filter(Boolean)
      .flat()
      .filter((v, i, arr) => arr.indexOf(v) === i); // unique
    
    if (locationDomains.length > 0) {
      service_domains = locationDomains;
    } else {
      // Infer from SUD indicators in existing fields
      const hasSUD = p.sud_services && Array.isArray(p.sud_services) && p.sud_services.length > 0;
      const levelOfCare = (p.level_of_care || '').toLowerCase();
      const notes = (p.notes || '').toLowerCase();
      const hasSUDKeywords = levelOfCare.includes('substance') || 
                            levelOfCare.includes('sud') ||
                            notes.includes('substance') ||
                            notes.includes('detox') ||
                            notes.includes('opioid') ||
                            notes.includes('addiction');
      
      if (hasSUD || hasSUDKeywords) {
        // Check if it's co-occurring (mental health + SUD)
        const hasMentalHealth = levelOfCare.includes('mental') || 
                               levelOfCare.includes('psychiatric') ||
                               levelOfCare.includes('behavioral');
        service_domains = hasMentalHealth ? ['co_occurring'] : ['substance_use'];
      } else {
        // Default to mental_health
        service_domains = ['mental_health'];
      }
    }
  }
  
  // Aggregate sud_services from program and location levels
  let sud_services = p.sud_services;
  if (!sud_services || !Array.isArray(sud_services) || sud_services.length === 0) {
    // Check location-level sud_services (aggregate unique values)
    const locationSudServices = normalizedLocations
      .map(loc => loc.sud_services)
      .filter(Boolean)
      .flat()
      .filter((v, i, arr) => arr.indexOf(v) === i); // unique
    
    if (locationSudServices.length > 0) {
      sud_services = locationSudServices;
    } else {
      sud_services = undefined;
    }
  }
  
  // Migrate verification data to new structure (backward compatible)
  let verification = p.verification;
  if (!verification && (p.verification_source || p.last_verified)) {
    verification = {
      last_verified_at: p.last_verified || undefined,
      sources: p.verification_source ? [{
        name: p.verification_source,
        type: 'website',
        url: p.verification_source.startsWith('http') ? p.verification_source : undefined,
        verified_at: p.last_verified || undefined
      }] : []
    };
  }
  
  return {
    program_id: p.program_id || "",
    entry_type: p.entry_type || "Treatment Program",
    organization: p.organization || "",
    program_name: p.program_name || "",
    level_of_care: p.level_of_care || "Unknown",
    service_setting: p.service_setting || "Unknown",
    ages_served: p.ages_served || "Unknown",
    locations: normalizedLocations,
    website_url: p.website_url || p.website || "",
    website_domain: p.website_domain || "",
    notes: p.notes || "",
    transportation_available: p.transportation_available || "Unknown",
    insurance_notes: p.insurance_notes || "Unknown",
    verification_source: p.verification_source || "", // Keep for backward compatibility
    last_verified: p.last_verified || "", // Keep for backward compatibility
    accepting_new_patients: p.accepting_new_patients || "Unknown",
    waitlist_status: p.waitlist_status || "Unknown",
    accepted_insurance: p.accepted_insurance || null,
    phone: p.phone || "",
    // New statewide-ready fields (all optional)
    primary_county: p.primary_county || undefined,
    service_area: p.service_area || undefined,
    geo: p.geo || undefined, // Program-level geo (if different from location-level)
    verification: verification || undefined,
    service_domains: service_domains,
    sud_services: sud_services || undefined
  };
}

// Try to load regional data (manifest-based)
async function tryLoadRegionalData() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for manifest
    
    const manifestRes = await fetch("data/regions/manifest.json", {
      cache: "no-cache",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!manifestRes.ok) {
      // Manifest doesn't exist - return null to trigger fallback
      return null;
    }
    
    const manifest = await manifestRes.json();
    if (!manifest || !manifest.regions || manifest.regions.length === 0) {
      return null;
    }
    
    // For now, load the first region (dfw)
    // Later, this can be extended to support multiple regions or region selection
    const region = manifest.regions[0];
    if (!region || !region.detailsPath) {
      return null;
    }
    
    // Load details file (contains full program data)
    const detailsController = new AbortController();
    const detailsTimeoutId = setTimeout(() => detailsController.abort(), 10000);
    
    const detailsRes = await fetch(region.detailsPath, {
      cache: "no-cache",
      signal: detailsController.signal
    });
    clearTimeout(detailsTimeoutId);
    
    if (!detailsRes.ok) {
      return null;
    }
    
    const detailsText = await detailsRes.text();
    const detailsData = JSON.parse(detailsText);
    
    return detailsData;
  } catch (err) {
    // Any error loading regional data - return null to trigger fallback
    if (err.name !== 'AbortError') {
      console.info('Regional data not available, falling back to programs.json:', err.message);
    }
    return null;
  }
}

async function loadPrograms(retryCount = 0){
  const maxRetries = 3;
  const retryDelay = 1000 * (retryCount + 1); // Exponential backoff
  
  if (els.loadWarn) {
    els.loadWarn.classList.remove("show");
    els.loadWarn.textContent = "";
  }
  // Use stable alias to prevent recursion if window.renderSkeletons is overwritten
  let rs = window.__vmhr?.renderSkeletons || window.renderSkeletons;
  
  // Defensive check: detect recursive wrapper
  if (rs === window.renderSkeletons && typeof rs === 'function') {
    const funcStr = Function.prototype.toString.call(rs);
    if (funcStr.includes('window.renderSkeletons(')) {
      console.error('renderSkeletons wrapper recursion detected; using __vmhr.renderSkeletons');
      // Force use of stable alias only
      rs = window.__vmhr?.renderSkeletons;
    }
  }
  
  // Handoff and other pro pages have no search grid — skip skeleton UI.
  if (typeof rs === 'function' && els.treatmentGrid) {
    rs(els);
  } else if (typeof rs !== 'function') {
    console.error('renderSkeletons not available. Make sure js/modules/render.js is loaded.');
  }

  try{
    let jsonText;
    let data;
    
    // CRITICAL FIX: Regional data (dfw.details.json) may be outdated and missing
    // specialized programs with eating_disorders/substance_use service_domains.
    // Always load programs.json as canonical source and merge regional data as augmentation.
    const regionalData = await tryLoadRegionalData();
    let canonicalData = null;
    
    // Always load programs.json as canonical source
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("programs.json", {
        cache: "no-cache",
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if(res.ok) {
        jsonText = await res.text();
        canonicalData = JSON.parse(jsonText);
        console.log('Loaded programs.json:', canonicalData ? (canonicalData.programs ? canonicalData.programs.length : 'no programs array') : 'null');
        
        // If validation is available, run it but don't block on failure
        if (typeof window.validateJSON === 'function') {
          const jsonValidation = window.validateJSON(jsonText);
          if (!jsonValidation.valid) {
            console.warn('JSON validation warning (non-blocking):', jsonValidation.error);
            if (typeof window.logSecurityEvent === 'function') {
              window.logSecurityEvent('json_validation_warning', { error: jsonValidation.error });
            }
          }
        }
      } else {
        console.error('Failed to load programs.json:', res.status, res.statusText);
      }
    } catch (parseError) {
      if (typeof window.logSecurityEvent === 'function') {
        window.logSecurityEvent('json_parse_error', { error: parseError.message });
      }
      console.warn('Could not load canonical programs.json:', parseError.message);
    }
    
    if (regionalData && canonicalData) {
      // MERGE: Use canonical as base, augment with regional data
      // Extract programs arrays from both
      let canonicalPrograms = Array.isArray(canonicalData) ? canonicalData : (canonicalData.programs || []);
      let regionalPrograms = Array.isArray(regionalData) ? regionalData : (regionalData.programs || []);
      
      // Use canonical as source-of-truth and only augment missing geo/location fields.
      const canonicalMap = new Map();
      canonicalPrograms.forEach(p => {
        if (p.program_id) {
          canonicalMap.set(p.program_id, p);
        }
      });
      
      regionalPrograms.forEach((regionalProgram) => {
        if (!regionalProgram?.program_id) return;
        const canonicalProgram = canonicalMap.get(regionalProgram.program_id);
        if (!canonicalProgram) {
          return;
        }

        const maybeAugmentField = (field) => {
          if ((canonicalProgram[field] === undefined || canonicalProgram[field] === null || canonicalProgram[field] === '') &&
              regionalProgram[field] !== undefined && regionalProgram[field] !== null && regionalProgram[field] !== '') {
            canonicalProgram[field] = regionalProgram[field];
          }
        };

        maybeAugmentField('latitude');
        maybeAugmentField('longitude');
        maybeAugmentField('primary_county');

        if (!Array.isArray(canonicalProgram.locations) && Array.isArray(regionalProgram.locations)) {
          canonicalProgram.locations = regionalProgram.locations;
        } else if (Array.isArray(canonicalProgram.locations) && Array.isArray(regionalProgram.locations)) {
          canonicalProgram.locations = canonicalProgram.locations.map((location, idx) => {
            const regionalLocation = regionalProgram.locations[idx];
            if (!regionalLocation) return location;
            return {
              ...location,
              lat: location.lat ?? regionalLocation.lat,
              lng: location.lng ?? regionalLocation.lng,
              county: location.county ?? regionalLocation.county
            };
          });
        }
      });
      
      // Use merged programs with canonical metadata
      data = {
        programs: canonicalPrograms,
        metadata: canonicalData.metadata || regionalData.metadata || {}
      };
      
      console.info(`Merged regional augmentation into canonical programs: ${regionalPrograms.length} regional records scanned, canonical total ${canonicalPrograms.length}`);
    } else if (canonicalData) {
      // Use canonical data only
      data = canonicalData;
      console.log('Using canonical data only:', data.programs ? data.programs.length : 'no programs array');
    } else if (regionalData) {
      // Fallback to regional data only
      data = regionalData;
      console.warn('Using regional data fallback because canonical programs.json could not load. Some data may be partial.');
      if (els.loadWarn) {
        els.loadWarn.textContent = 'We could not load the primary programs dataset. Showing fallback data that may be incomplete.';
        els.loadWarn.classList.add('show');
      }
    } else {
      // No data available - throw error
      console.error('No data available - canonicalData:', !!canonicalData, 'regionalData:', !!regionalData);
      throw new Error('Unable to load programs data. Please try refreshing the page.');
    }
    
    // Store metadata for display
    if (data.metadata) {
      state.programsMetadata = data.metadata;
    }
    
    // Handle both array format (programs.json) and object format (regional data)
    let programsArray;
    if (Array.isArray(data)) {
      programsArray = data;
    } else if (data && Array.isArray(data.programs)) {
      programsArray = data.programs;
    } else {
      throw new Error("Programs data loaded but missing a `programs` array.");
    }
    
    // Comprehensive data validation
    if (typeof window.validateProgramsData === 'function') {
      // Pass the full data object (with metadata) for validation - handle both array and object formats
      const dataForValidation = Array.isArray(data) ? { programs: data, metadata: {} } : data;
      const validationResults = window.validateProgramsData(dataForValidation);
      
      if (!validationResults.valid) {
        console.warn('Data validation issues:', {
          invalid: validationResults.invalidPrograms.length,
          total: validationResults.totalPrograms,
          duplicates: validationResults.duplicates.length,
          stale: validationResults.stalePrograms.length
        });
        
        if (typeof window.logSecurityEvent === 'function') {
          window.logSecurityEvent('data_validation_issues', {
            invalid: validationResults.invalidPrograms.length,
            duplicates: validationResults.duplicates.length,
            stale: validationResults.stalePrograms.length,
            missingFields: Object.keys(validationResults.missingFields).length
          });
        }
        
        // Show warning to user if there are critical issues
        if (validationResults.invalidPrograms.length > 0) {
          if (els.loadWarn) {
            els.loadWarn.textContent = `Warning: ${validationResults.invalidPrograms.length} program(s) have data quality issues. Some results may be incomplete.`;
            els.loadWarn.classList.add("show");
          }
        }
      }
      
      // Check for stale data
      if (validationResults.stalePrograms.length > 0) {
        console.info(`${validationResults.stalePrograms.length} programs haven't been verified in 90+ days`);
      }
      
      // Check for duplicates
      if (validationResults.duplicates.length > 0) {
        console.warn(`Found ${validationResults.duplicates.length} potential duplicate program(s):`);
        validationResults.duplicates.forEach((dup, idx) => {
          const [org, location, careLevel] = dup.key.split('|');
          console.warn(`  Duplicate ${idx + 1}: ${dup.programs.length} programs with same org/location/care level`);
          console.warn(`    Organization: ${org}`);
          console.warn(`    Location: ${location}`);
          console.warn(`    Care Level: ${careLevel}`);
          console.warn(`    Program IDs: ${dup.programs.map(p => p.programId).join(', ')}`);
        });
      }
    }
    
    // Legacy validation (keep for backward compatibility)
    if (typeof window.validateProgramStructure === 'function') {
      const invalidPrograms = [];
      programsArray.forEach((p, idx) => {
        const validation = window.validateProgramStructure(p);
        if (!validation.valid) {
          invalidPrograms.push({ index: idx, programId: p.program_id, errors: validation.errors });
        }
      });
      if (invalidPrograms.length > 0) {
        if (typeof window.logSecurityEvent === 'function') {
          window.logSecurityEvent('data_integrity_issues', { count: invalidPrograms.length, programs: invalidPrograms.slice(0, 5) });
        }
        console.warn('Some programs failed validation:', invalidPrograms);
      }
    }

    // Normalize data while mapping
    const normalizeCity = typeof window.normalizeCityName === 'function' 
      ? window.normalizeCityName 
      : (city) => city;
    
    let loadedPrograms = programsArray.map(p => normalizeProgramData(p, normalizeCity));
    
    // Set programs first (before async geocoded data merge)
    state.programs = loadedPrograms;
    state.programDataMap.clear();
    state.programs.forEach(p => state.programDataMap.set(p.program_id, p));
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('vmhr:programs-ready', { detail: { count: state.programs.length } }));
    }
    syncStateToManager(); // Sync with StateManager (programs -> StateManager)
    console.log('Programs loaded:', state.programs.length, 'Ready:', state.ready);
    
    // Update available filters after programs are loaded
    state.availableFilters = computeAvailableFilters(state.programs);
    updateFilterVisibility();
    
    // Apply feature flags to UI on initial load
    applyFeatureFlagsToUI();

    // Build autocomplete indexes to avoid O(n^2) behavior
    buildAutocompleteIndexes(state.programs);

    buildLocationOptions(state.programs);
    buildSearchCities(state.programs);
    buildInsuranceOptions(state.programs);
    if (typeof window.registerInsurancePlansFromData === 'function') {
      window.registerInsurancePlansFromData(state.programs);
    }
    callUpdateStats();
    updateComparisonCount();
    state.ready = true;
    state.openId = null;
    syncStateToManager(); // Sync with StateManager
    
    // Initialize button visibility (TDPSA: ensure opt-out is visible when needed)
    if (typeof updateLocationButtonVisibility === 'function') {
      updateLocationButtonVisibility();
    }
    
    // Display last updated date if available
    updateLastUpdatedDisplay();
    
    render();
    
    // Update crisis banner offset after initial render
    state.updateCrisisBannerOffset();
    
    // Dev-only: Check for display regression after initial render
    checkTreatmentGridDisplayRegression();
    
    // Try to load and merge geocoded data (non-blocking, after initial render)
    loadGeocodedData().then(() => {
      if (state.geocodedPrograms && state.geocodedPrograms.size > 0) {
        state.programs = mergeGeocodedData(state.programs);
        state.programDataMap.clear();
        state.programs.forEach(p => state.programDataMap.set(p.program_id, p));
        syncStateToManager(); // Sync with StateManager
        // Rebuild autocomplete indexes after merge
        buildAutocompleteIndexes(state.programs);
        // Recompute available filters after geocoded data merge
        state.availableFilters = computeAvailableFilters(state.programs);
        updateFilterVisibility();
        
        // Re-apply feature flags after geocoded data merge
        applyFeatureFlagsToUI();
        // Re-render with geocoded data
        if (state.ready) {
          render();
        }
      }
    }).catch(err => {
      console.warn('Failed to load geocoded data:', err);
    });
  }catch(err){
    console.error('Error loading programs:', err);
    
    // Retry logic for network errors
    if (retryCount < maxRetries && (err.name === 'TypeError' || err.name === 'AbortError')) {
      if (els.loadWarn) {
        els.loadWarn.textContent = `Connection issue. Retrying... (${retryCount + 1}/${maxRetries})`;
        els.loadWarn.classList.add("show");
      }
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return loadPrograms(retryCount + 1);
    }
    
    // User-friendly error messages
    let errorMessage = "Unable to load program data. ";
    if (err.name === 'AbortError') {
      errorMessage += "The request took too long. Please check your connection and try again.";
    } else if (err.message.includes('HTTP')) {
      errorMessage += err.message;
    } else if (err.message.includes('parse')) {
      errorMessage += "The data file appears to be corrupted. Please contact support.";
    } else {
      errorMessage += "Please check your internet connection and try refreshing the page.";
    }
    
    if (els.loadWarn) {
      els.loadWarn.textContent = errorMessage;
      els.loadWarn.classList.add("show");
    }
    announceToScreenReader(errorMessage, 'assertive');
    
    state.ready = true;
    state.programs = [];
    buildLocationOptions(state.programs);
    buildInsuranceOptions(state.programs);
    state.openId = null;
    syncStateToManager(); // Sync with StateManager
    render();
  }
}

// Service Worker Registration
if('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silent fail - service worker is optional enhancement
    });
    // Update banner offset after fonts and layout settle
    state.updateCrisisBannerOffset();
  });
}

// Update banner offset when DOM is ready (before fonts may load)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', state.updateCrisisBannerOffset);
} else {
  // DOM already ready
  state.updateCrisisBannerOffset();
}
// Handle call/text tracking via event delegation
document.addEventListener('click', (e) => {
  const callBtn = e.target.closest('[data-program-id]');
  if (callBtn && callBtn.href && (callBtn.href.startsWith('tel:') || callBtn.href.startsWith('sms:'))) {
    const programId = callBtn.dataset.programId;
    const program = state.programDataMap.get(programId);
    if (program) trackCallAttempt(program);
  }
});
// Handle expand button clicks via event delegation (for main grid and favorites modal)
// Note: Main grid uses document-level delegation (see below), but this function is kept
// for containers that need specific delegation (like modals)
function setupCardEventDelegation(container) {
  if (!container) return;
  // For specific containers, we can add container-specific handlers if needed
  // Main grid uses document-level delegation for better dynamic content support
}

// Document-level event delegation is set up in initialization section above
// Handle empty state actions
document.addEventListener('click', (e) => {
  const action = e.target.dataset?.action || e.target.closest('[data-action]')?.dataset?.action;
  if (action === 'clear-filters') {
    clearAllFilters({ updateUrl: true, closeCards: true });
    render();
  } else if (action === 'broaden-search') {
    broadenSearchOneStep();
    render();
  } else if (action === 'show-virtual') {
    els.onlyVirtual.checked = true;
    els.onlyVirtualTop.checked = true;
    syncTopToggles();
    render();
  } else if (action === 'view-all') {
    els.q.value = '';
    // Clear dataset attributes
    delete els.q.dataset.exactMatch;
    delete els.q.dataset.matchType;
    els.loc.value = '';
    els.age.value = '';
    els.care.value = '';
    els.onlyVirtual.checked = false;
    els.showCrisis.checked = false;
    syncTopToggles();
    state.openId = null;
    render();
    const t = document.getElementById("treatmentSection");
    if (t) window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  }
});

// Document-level event delegation is set up at the top of the file (after DOM elements)

// Initialize
bind();
initSwipeGestures();

// Clear location on page load (privacy-first: never persist location)
state.userLocation = null;

// Clear location when page unloads (extra privacy measure)
window.addEventListener('beforeunload', () => {
  state.userLocation = null;
});

loadPrograms().then(() => {
  state.recentSearches = state.recentSearches.filter(isValidRecentSearchQuery);
  // Clear any stale dataset attributes on initial load if q is empty
  if (els.q && (!els.q.value || !els.q.value.trim())) {
    delete els.q.dataset.exactMatch;
    delete els.q.dataset.matchType;
  }
  handleURLParams();
  if (hasURLFilterParams()) {
    unlockResults();
  }
  updateResultsVisibility();
  render();
  renderRecentSearches();
  updateFavoritesCount();
}).catch(err => {
  console.error('Failed to load programs:', err);
});
