// ========== Security ==========
// Load security module (encryption, validation, etc.)
// Security functions are available globally after security.js loads

// ========== MOBILE PERFORMANCE DEBUGGING (REMOVED) ==========
// All debug code has been removed

// ========== State Management ==========
// Initialize StateManager instance
let stateManager = null;
if (typeof window.getStateManager === 'function') {
  stateManager = window.getStateManager();
} else {
  console.error('getStateManager not available. Make sure js/state-manager.js is loaded.');
}

// Legacy state variables - kept for backward compatibility during migration
// These will be gradually replaced with stateManager.getState() / stateManager.setState()
let programs = [];
let ready = false;
let openId = null;
let currentSort = window.DEFAULT_SORT || 'relevance';
let userLocation = null; // { lat, lng } - kept in memory only, never stored
let geocodedPrograms = null; // Loaded from programs.geocoded.json if available
let availableFilters = {
  hasCounty: false,
  hasServiceDomains: false,
  hasSUD: false,
  hasVerification: false,
  hasServiceArea: false
};

// Statewide filter state (with safe defaults)
let selectedCounty = null;
let selectedServiceDomains = [];
let selectedSudServices = [];
let verificationRecencyDays = null;

// Sync legacy variables with StateManager
function syncStateFromManager() {
  if (!stateManager) return;
  const state = stateManager.getState();
  programs = state.programs || [];
  ready = state.ready || false;
  openId = state.openId || null;
  currentSort = state.currentSort || window.DEFAULT_SORT || 'relevance';
  userLocation = state.userLocation || null;
  geocodedPrograms = state.geocodedPrograms || null;
  availableFilters = state.availableFilters || {
    hasCounty: false,
    hasServiceDomains: false,
    hasSUD: false,
    hasVerification: false,
    hasServiceArea: false
  };
  selectedCounty = state.selectedCounty || null;
  selectedServiceDomains = state.selectedServiceDomains || [];
  selectedSudServices = state.selectedSudServices || [];
  verificationRecencyDays = state.verificationRecencyDays || null;
}

// Sync StateManager with legacy variables
function syncStateToManager() {
  if (!stateManager) return;
  stateManager.setState({
    programs,
    ready,
    openId,
    currentSort,
    userLocation,
    geocodedPrograms,
    availableFilters,
    selectedCounty,
    selectedServiceDomains,
    selectedSudServices,
    verificationRecencyDays
  });
}

// Initial sync from StateManager (load persisted state)
syncStateFromManager();

// Use unified storage functions from js/modules/storage.js
// These are loaded before app.js and available on window object
const loadEncryptedDataFn =
  (typeof window.loadEncryptedData === 'function')
    ? window.loadEncryptedData
    : async (key, defaultValue = []) => {
        try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue)); }
        catch { return defaultValue; }
      };

const saveEncryptedDataFn =
  (typeof window.saveEncryptedData === 'function')
    ? window.saveEncryptedData
    : async (key, data) => {
        localStorage.setItem(key, JSON.stringify(data));
      };

// Initialize encrypted storage
let favorites = new Set();
let recentSearches = [];
let callHistory = [];
let customLists = {}; // { listName: Set<programIds> }
let programNotes = {}; // { programId: note }
let programTags = {}; // { programId: [tags] }
let userPreferences = {
  defaultSort: window.DEFAULT_SORT || 'relevance',
  defaultView: 'grid',
  showCrisisByDefault: false,
  itemsPerPage: 20
};

async function initializeEncryptedStorage() {
  const STORAGE_KEYS = window.STORAGE_KEYS || {
    FAVORITES: 'favorites',
    RECENT_SEARCHES: 'recentSearches',
    CALL_HISTORY: 'callHistory',
    CUSTOM_LISTS: 'customLists',
    PROGRAM_NOTES: 'programNotes',
    PROGRAM_TAGS: 'programTags'
  };
  
  favorites = new Set(await loadEncryptedDataFn(STORAGE_KEYS.FAVORITES, []));
  recentSearches = await loadEncryptedDataFn(STORAGE_KEYS.RECENT_SEARCHES, []);
  callHistory = await loadEncryptedDataFn(STORAGE_KEYS.CALL_HISTORY, []);
  customLists = await loadEncryptedDataFn(STORAGE_KEYS.CUSTOM_LISTS, {});
  programNotes = await loadEncryptedDataFn(STORAGE_KEYS.PROGRAM_NOTES, {});
  programTags = await loadEncryptedDataFn(STORAGE_KEYS.PROGRAM_TAGS, {});
  const prefs = await loadEncryptedDataFn('userPreferences', {});
  userPreferences = { ...userPreferences, ...prefs };
  
  // Apply preferences (els might not be initialized yet, so check)
  if (userPreferences.defaultSort && typeof els !== 'undefined' && els.sortSelect) {
    currentSort = userPreferences.defaultSort;
    els.sortSelect.value = currentSort;
  }
}

// Initialize on load
initializeEncryptedStorage();

// ========== Performance Optimizations ==========
// All performance code is now in js/modules/performance.js
// Initialize performance optimizations (text scale detection, banner offset, etc.)
let performanceModule = null;
let updateCrisisBannerOffset = null;

if (typeof window.initPerformanceOptimizations === 'function') {
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  performanceModule = window.initPerformanceOptimizations({ isCoarsePointer });
  updateCrisisBannerOffset = performanceModule.updateCrisisBannerOffset;
            } else {
  console.error('initPerformanceOptimizations not available. Make sure js/modules/performance.js is loaded.');
  // Fallback: minimal updateCrisisBannerOffset function
  updateCrisisBannerOffset = function() {
  const banner = document.querySelector('.crisis-banner');
    if (banner) {
    const h = banner.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--crisis-banner-h', `${h}px`);
    }
  };
}

const STORAGE_KEYS_COMPARISON = window.STORAGE_KEYS || { COMPARISON: 'comparison' };
let comparisonSet = new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS_COMPARISON.COMPARISON) || '[]'));

const programDataMap = new Map();

// ========== Autocomplete Indexes ==========
// Avoid O(n^2) behavior in autocomplete by pre-indexing organizations.
let orgProgramsIndex = new Map(); // key: lowercased organization name -> Program[]

function buildAutocompleteIndexes(list){
  orgProgramsIndex = new Map();
  for (const p of list || []) {
    const org = safeStr(p.organization).trim();
    if (!org) continue;
    const key = org.toLowerCase();
    const arr = orgProgramsIndex.get(key);
    if (arr) arr.push(p);
    else orgProgramsIndex.set(key, [p]);
  }
}

// ========== DOM Elements ==========
const els = {
  q: document.getElementById("q"),
  loc: document.getElementById("loc"),
  age: document.getElementById("age"),
  care: document.getElementById("care"),
  showCrisis: document.getElementById("showCrisis"),
  onlyVirtual: document.getElementById("onlyVirtual"),
  showCrisisTop: document.getElementById("showCrisisTop"),
  onlyVirtualTop: document.getElementById("onlyVirtualTop"),
  reset: document.getElementById("reset"),
  resetTop: document.getElementById("resetTop"),
  viewAll: document.getElementById("viewAll"),
  treatmentSection: document.getElementById("treatmentSection"),
  treatmentGrid: document.getElementById("treatmentGrid"),
  treatmentCount: document.getElementById("treatmentCount"),
  totalCount: document.getElementById("totalCount"),
  resultsLabel: document.getElementById("resultsLabel"),
  sectionTitle: document.getElementById("sectionTitle"),
  treatmentEmpty: document.getElementById("treatmentEmpty"),
  loadWarn: document.getElementById("loadWarn"),
  smartSearchBtn: document.getElementById("smartSearchBtn"),
  showAdvanced: document.getElementById("showAdvanced"),
  advancedFilters: document.getElementById("advancedFilters"),
  viewCrisisResources: document.getElementById("viewCrisisResources"),
  viewTreatmentOptions: document.getElementById("viewTreatmentOptions"),
  programCount: document.getElementById("programCount"),
  sortSelect: document.getElementById("sortSelect"),
  viewFavorites: document.getElementById("viewFavorites"),
  viewHistory: document.getElementById("viewHistory"),
  favoritesCount: document.getElementById("favoritesCount"),
  favoritesModal: document.getElementById("favoritesModal"),
  historyModal: document.getElementById("historyModal"),
  favoritesList: document.getElementById("favoritesList"),
  historyList: document.getElementById("historyList"),
  toast: document.getElementById("toast"),
  insurance: document.getElementById("insurance"),
  county: document.getElementById("county"),
  serviceDomain: document.getElementById("serviceDomain"),
  sudServices: document.getElementById("sudServices"),
  verificationRecency: document.getElementById("verificationRecency"),
  viewComparison: document.getElementById("viewComparison"),
  comparisonModal: document.getElementById("comparisonModal"),
  comparisonList: document.getElementById("comparisonList"),
  helpModal: document.getElementById("helpModal"),
  shareFilters: document.getElementById("shareFilters"),
  nearMeBtn: document.getElementById("nearMeBtn"),
  stopLocationBtn: document.getElementById("stopLocationBtn"),
  locationConsentModal: document.getElementById("locationConsentModal"),
  locationConsentAllow: document.getElementById("locationConsentAllow"),
  locationConsentCancel: document.getElementById("locationConsentCancel")
};

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
        hrefAttr.includes('privacy.html') || hrefAttr.includes('terms.html'))) {
      // Allow normal navigation for privacy/terms links - don't prevent default
      return;
    }
    // Also check the resolved href pathname as fallback
    try {
      const linkUrl = new URL(link.href);
      if (linkUrl.pathname.endsWith('privacy.html') || linkUrl.pathname.endsWith('terms.html')) {
        return;
      }
    } catch (e) {
      // If URL parsing fails, continue with normal handler
    }
  }
  
  // Handle expand button clicks - check if click is on the button or its child (chev icon)
  // Check both the target and if it's inside an expandBtn
  let expandBtn = e.target.closest('.expandBtn');
  // Also check if clicking directly on the button
  if (!expandBtn && e.target.classList && e.target.classList.contains('expandBtn')) {
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
      const program = programDataMap.get(id);
      if (program) {
        const idx = Array.from(programDataMap.keys()).indexOf(id);
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
      const program = programDataMap.get(id);
      if (program) {
        const idx = Array.from(programDataMap.keys()).indexOf(id);
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

// ========== Age Dropdown Custom Component ==========
function initAgeDropdown(){
  const root = document.querySelector('.dropdown[data-dd="age"]');
  if (!root) return;

  const btn = root.querySelector('#ageBtn');
  const valueEl = root.querySelector('#ageBtnValue');
  const menu = root.querySelector('#ageMenu');
  const native = root.querySelector('#age');
  const label = root.closest('.input-group') ? root.closest('.input-group').querySelector('.dd-label') : null;

  const options = Array.from(menu.querySelectorAll('.dd-option'));
  let activeIndex = 0;
  let typeBuf = "";
  let typeT = null;

  function setActive(i, scroll){
    activeIndex = Math.max(0, Math.min(options.length - 1, i));
    options.forEach((o, idx) => o.classList.toggle('is-active', idx === activeIndex));
    if (scroll) options[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function syncFromNative(){
    const val = native.value || "";
    valueEl.textContent = (val === "") ? "Any age" : String(val);
    options.forEach(o => {
      const v = (o.dataset.value ?? "");
      const isSel = v === String(val);
      o.classList.toggle('is-selected', isSel);
      o.setAttribute('aria-selected', isSel ? "true" : "false");
    });
  }

  window.__ageDropdownSync = syncFromNative;

  function open(){
    if (root.classList.contains('open')) return;
    root.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');

    const val = native.value || "";
    let idx = options.findIndex(o => (o.dataset.value ?? "") === String(val));
    if (idx < 0) idx = 0;
    setActive(idx, true);

    menu.focus({ preventScroll: true });
  }

  function close(focusBtn){
    if (!root.classList.contains('open')) return;
    root.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) btn.focus({ preventScroll: true });
  }

  function toggle(){
    if (root.classList.contains('open')) close(false);
    else open();
  }

  function choose(val){
    native.value = val;
    syncFromNative();
    native.dispatchEvent(new Event("change", { bubbles: true }));
  }

  syncFromNative();
  native.addEventListener("change", syncFromNative);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    toggle();
  });

  if (label){
    label.style.cursor = "pointer";
    label.addEventListener("click", () => btn.click());
  }

  options.forEach((opt, idx) => {
    opt.addEventListener("click", (e) => {
      e.preventDefault();
      choose(opt.dataset.value ?? "");
      close(true);
    });
    opt.addEventListener("mousemove", () => {
      if (root.classList.contains('open')) setActive(idx, false);
    });
  });

  btn.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "Escape") {
      e.preventDefault();
      close(false);
      return;
    }
    if (k === "ArrowDown" || k === "Enter" || k === " "){
      e.preventDefault();
      open();
    } else if (k === "ArrowUp"){
      e.preventDefault();
      open();
      setActive(activeIndex - 1, true);
    }
  });

  menu.addEventListener("keydown", (e) => {
    const k = e.key;

    if (k === "Escape"){
      e.preventDefault();
      close(true);
      return;
    }
    if (k === "ArrowDown"){
      e.preventDefault();
      setActive(activeIndex + 1, true);
      return;
    }
    if (k === "ArrowUp"){
      e.preventDefault();
      setActive(activeIndex - 1, true);
      return;
    }
    if (k === "Home"){
      e.preventDefault();
      setActive(0, true);
      return;
    }
    if (k === "End"){
      e.preventDefault();
      setActive(options.length - 1, true);
      return;
    }
    if (k === "Enter" || k === " "){
      e.preventDefault();
      const opt = options[activeIndex];
      choose(opt.dataset.value ?? "");
      close(true);
      return;
    }

    if (/^\d$/.test(k)){
      typeBuf += k;
      if (typeT) clearTimeout(typeT);
      typeT = setTimeout(() => { typeBuf = ""; }, 650);

      const needle = typeBuf;
      const idx = options.findIndex(o => (o.dataset.value ?? "") === needle);
      if (idx >= 0){
        setActive(idx, true);
      } else {
        const idx2 = options.findIndex(o => (o.textContent || "").trim().startsWith(needle));
        if (idx2 >= 0) setActive(idx2, true);
      }
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (!root.classList.contains('open')) return;
    if (root.contains(e.target)) return;
    close(false);
  });

  // SECURITY AUDIT FIX: Throttle resize handler to prevent jank
  let __modalResizeRAF = null;
  let __modalResizeT = null;
  const handleModalResize = () => {
    if (__modalResizeRAF) cancelAnimationFrame(__modalResizeRAF);
    __modalResizeRAF = requestAnimationFrame(() => {
      if (__modalResizeT) clearTimeout(__modalResizeT);
      __modalResizeT = setTimeout(() => {
        close(false);
      }, 150);
    });
  };
  window.addEventListener("resize", handleModalResize);
}

// ========== Utility Functions ==========
// ========== Helper Functions ==========
// All helper functions are now in js/utils/helpers.js and available via window.*
// Removed duplicates to avoid code duplication and maintenance issues

function buildLocationOptions(list){
  const set = new Set();
  list.forEach(p => {
    (p.locations || []).forEach(l => {
      const c = safeStr(l.city);
      if (c && c.toLowerCase() !== "virtual" && c.toLowerCase() !== "multiple" && c.toLowerCase() !== "n/a") set.add(c);
    });
  });
  const cities = Array.from(set).sort((a,b)=>a.localeCompare(b));
  
  // Clear existing options (preserve the select element)
  if (els.loc) {
    els.loc.innerHTML = '<option value="">Any</option>';
    
    // Add options using DOM methods (safe from XSS)
    cities.forEach(city => {
      const option = document.createElement('option');
      option.value = city; // Browser automatically escapes attribute values
      option.textContent = city; // textContent is safe from XSS
      els.loc.appendChild(option);
    });
  }
}

function buildInsuranceOptions(list){
  const typesSet = new Set();
  const plansSet = new Set();
  
  list.forEach(p => {
    const insurance = p.accepted_insurance || {};
    
    // Extract insurance types
    if (Array.isArray(insurance.types)) {
      insurance.types.forEach(type => {
        const cleanType = safeStr(type).trim();
        if (cleanType) {
          // Normalize common variations
          const normalized = cleanType
            .replace(/\(many\)/gi, '')
            .replace(/\(some\)/gi, '')
            .replace(/\(varies\)/gi, '')
            .replace(/\(listed\)/gi, '')
            .replace(/\(most major\)/gi, '')
            .trim();
          if (normalized) typesSet.add(normalized);
        }
      });
    }
    
    // Extract insurance plans
    if (Array.isArray(insurance.plans)) {
      insurance.plans.forEach(plan => {
        const cleanPlan = safeStr(plan).trim();
        if (cleanPlan) plansSet.add(cleanPlan);
      });
    }
  });
  
  const types = Array.from(typesSet).sort((a,b)=>a.localeCompare(b));
  const plans = Array.from(plansSet).sort((a,b)=>a.localeCompare(b));
  
  if (els.insurance) {
    // Clear existing options
    els.insurance.innerHTML = '';
    
    // Add default "Any insurance" option (static, safe)
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Any insurance';
    els.insurance.appendChild(defaultOption);
    
    // Add insurance types section with optgroup
    if (types.length > 0) {
      const typesGroup = document.createElement('optgroup');
      typesGroup.label = 'Insurance Types'; // Static label, safe
      
      types.forEach(type => {
        const option = document.createElement('option');
        // Value format must be exactly "type:${type}" for filtering logic to work
        option.value = `type:${type}`; // Browser automatically escapes attribute values
        option.textContent = type; // textContent is safe from XSS
        typesGroup.appendChild(option);
      });
      
      els.insurance.appendChild(typesGroup);
    }
    
    // Add insurance plans section with optgroup
    if (plans.length > 0) {
      const plansGroup = document.createElement('optgroup');
      plansGroup.label = 'Insurance Plans'; // Static label, safe
      
      plans.forEach(plan => {
        const option = document.createElement('option');
        // Value format must be exactly "plan:${plan}" for filtering logic to work
        option.value = `plan:${plan}`; // Browser automatically escapes attribute values
        option.textContent = plan; // textContent is safe from XSS
        plansGroup.appendChild(option);
      });
      
      els.insurance.appendChild(plansGroup);
    }
  }
}

// ========== Relevance Scoring ==========
function calculateRelevanceScore(program, query) {
  if (!query || !query.trim()) return 0;
  
  let score = 0;
  const qLower = query.toLowerCase().trim();
  const orgLower = safeStr(program.organization).toLowerCase();
  const progLower = safeStr(program.program_name).toLowerCase();
  const levelOfCare = safeStr(program.level_of_care).toLowerCase();
  const entryType = safeStr(program.entry_type).toLowerCase();
  const serviceSetting = safeStr(program.service_setting).toLowerCase();
  const agesServed = safeStr(program.ages_served).toLowerCase();
  const notes = safeStr(program.notes || '').toLowerCase();
  const loc = locLabel(program).toLowerCase();
  
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
    } else if (window.fuzzyMatch && window.fuzzyMatch(qLower, orgLower, 0.85)) {
      score += 60;
    }
    
    // Program name matching
    if (progLower.includes(qLower)) {
      score += 70;
    } else if (qLower.includes(progLower)) {
      score += 65;
    } else if (window.fuzzyMatch && window.fuzzyMatch(qLower, progLower, 0.85)) {
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

function matchesFilters(p){
  const q = safeStr(els.q?.value || '').toLowerCase();
  const loc = safeStr(els.loc?.value || '').toLowerCase();
  const ageVal = safeStr(els.age?.value || '');
  const care = safeStr(els.care?.value || '').toLowerCase();
  const onlyVirtual = els.onlyVirtual?.checked || false;

  // Parse smart search to get additional filters
  // Use module function directly, then add organization detection if needed
  const query = els.q?.value || '';
  const parsed = typeof window.parseSmartSearch === 'function' 
    ? window.parseSmartSearch(query)
    : { loc: '', locs: [], age: '', minAge: null, care: '', showCrisis: false, organization: '' };
  
  // App-specific: Try to detect organization name from query
  if (ready && programs.length > 0 && !parsed.loc && typeof window.parseSmartSearch === 'function') {
    const q = query.toLowerCase();
    const exactOrg = programs.find(p => safeStr(p.organization).toLowerCase() === q);
    if (exactOrg) {
      parsed.organization = exactOrg.organization;
    }
  }
  const searchMinAge = parsed.minAge;

  // Text search - check if query terms appear in program fields
  if (q && q.trim()) {
    const orgLower = safeStr(p.organization).toLowerCase();
    const progLower = safeStr(p.program_name).toLowerCase();
    const qLower = q.toLowerCase().trim();
    
    // Check for exact matches first (highest priority)
    // Only check dataset attributes if there's actually a query
    const isExactMatch = els.q?.dataset.exactMatch === 'true';
    const matchType = els.q?.dataset.matchType;
    
    // If this was selected from autocomplete as an organization, match all programs from that org
    if (matchType === 'organization' && qLower) {
      // For organization matches, check if this program belongs to the selected organization
      // Use case-insensitive comparison
      if (orgLower === qLower) {
        // This program belongs to the selected organization - continue with other filters
      } else {
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
      if (orgLower === qLower || progLower === qLower) {
        // Exact match found - continue with other filters but this will score highest
      } else {
        // Remove location, age, and care level terms from search query for text matching
        // BUT preserve organization-like terms (don't remove words that might be part of org names)
        const searchTerms = q
          .replace(/\b(php|partial hospitalization|iop|intensive outpatient|outpatient|navigation)\b/gi, '')
          .replace(/\b\d+\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up|and\s*older|year|yr|y\.o\.|yo|old)\b/gi, '')
          // Only remove city names if they're standalone (not part of organization names)
          // Use word boundaries to avoid removing city names embedded in org names
          .replace(/\b(dallas|plano|frisco|mckinney|richardson|denton|arlington|fort worth|mansfield|keller|desoto|de soto|rockwall|sherman|forney|burleson|flower mound|the colony|bedford|lewisville|carrollton|garland|mesquite|irving|grand prairie|corsicana)\b(?=\s|$)/gi, '')
          .trim();
        
        if (searchTerms) {
          const hay = [
            p.program_name, p.organization, p.level_of_care,
            p.entry_type, p.service_setting, p.ages_served,
            locLabel(p),
            (p.notes || ""),
          ].map(safeStr).join(" ").toLowerCase();
          
          // Check if all remaining search terms appear (with fuzzy matching for typos)
          const terms = searchTerms.split(/\s+/).filter(t => t.length > 0);
          if (terms.length > 0) {
            // Prioritize organization and program name matches
            const orgMatch = terms.every(term => {
              if (orgLower.includes(term)) return true;
              if (term.length > 3) return window.fuzzyMatch && window.fuzzyMatch(term, orgLower, 0.85);
              return false;
            });
            
            const progMatch = terms.every(term => {
              if (progLower.includes(term)) return true;
              if (term.length > 3) return window.fuzzyMatch && window.fuzzyMatch(term, progLower, 0.85);
              return false;
            });
            
            // If matches organization or program name, allow it
            if (orgMatch || progMatch) {
              // Continue with other filters
            } else {
              // Check other fields with fuzzy matching
              const allMatch = terms.every(term => {
                if (hay.includes(term)) return true;
                // Fuzzy match for terms longer than 3 characters
                if (term.length > 3) {
                  return window.fuzzyMatch && window.fuzzyMatch(term, hay, 0.7);
                }
                return false;
              });
              if (!allMatch) return false;
            }
          }
        }
      }
    }
  }

  // Location filter - use parsed location or dropdown value, support multi-location
  if (parsed.locs && parsed.locs.length > 0) {
    // Multi-location search: program must serve at least one of the specified locations
    const programCities = (p.locations || []).map(l => safeStr(l.city).toLowerCase());
    const searchCities = parsed.locs.map(loc => loc.toLowerCase());
    const matches = searchCities.some(searchCity => {
      if (searchCity === 'de soto') {
        return programCities.some(c => c === 'de soto' || c === 'desoto');
      }
      return programCities.some(c => c === searchCity || (window.fuzzyMatch && window.fuzzyMatch(searchCity, c, 0.8)));
    });
    if (!matches) return false;
  } else {
    const locationToCheck = parsed.loc ? parsed.loc.toLowerCase() : loc;
    if (locationToCheck) {
      const cities = (p.locations || []).map(l => safeStr(l.city).toLowerCase());
      // Handle "De Soto" matching both "De Soto" and "Desoto"
      const normalizedLocation = locationToCheck.replace(/\s+/g, ' ').trim();
      if (normalizedLocation === 'de soto') {
        if (!cities.some(c => c === 'de soto' || c === 'desoto')) return false;
      } else {
        // Use fuzzy matching for location
        const matches = cities.some(c => c === normalizedLocation || (window.fuzzyMatch && window.fuzzyMatch(normalizedLocation, c, 0.8)));
        if (!matches) return false;
      }
    }
  }

  // Level of care filter - use parsed care or dropdown value
  const careToCheck = parsed.care ? parsed.care.toLowerCase() : care;
  if (careToCheck) {
    if (safeStr(p.level_of_care).toLowerCase() !== careToCheck) return false;
  }

  // Age filter - handle both exact age and "and up" patterns
  const ageToCheck = ageVal || (parsed.age || '');
  if (ageToCheck) {
    const age = Number(ageToCheck);
    if (Number.isFinite(age)) {
      if (searchMinAge !== null) {
        // "13 and up" - check if program serves this age or higher
        // Program must serve at least age 13
        if (!programServesAge(p, age)) return false;
      } else {
        // Exact age match
        if (!programServesAge(p, age)) return false;
      }
    }
  }

  // Insurance filter
  const insuranceVal = els.insurance ? safeStr(els.insurance.value) : '';
  if (insuranceVal) {
    const insurance = p.accepted_insurance || {};
    const insuranceTypes = Array.isArray(insurance.types) ? insurance.types.map(t => safeStr(t).toLowerCase()) : [];
    const insurancePlans = Array.isArray(insurance.plans) ? insurance.plans.map(pl => safeStr(pl).toLowerCase()) : [];
    
    // Check if it's a type or plan filter
    if (insuranceVal.startsWith('type:')) {
      const filterType = insuranceVal.replace('type:', '').toLowerCase();
      // Normalize for matching (remove qualifiers like "(many)", "(some)", etc.)
      const normalizedTypes = insuranceTypes.map(t => 
        t.replace(/\(many\)/g, '').replace(/\(some\)/g, '').replace(/\(varies\)/g, '').replace(/\(listed\)/g, '').replace(/\(most major\)/g, '').trim()
      );
      if (!normalizedTypes.some(t => t.includes(filterType) || filterType.includes(t))) {
        return false;
      }
    } else if (insuranceVal.startsWith('plan:')) {
      const filterPlan = insuranceVal.replace('plan:', '').toLowerCase();
      if (!insurancePlans.some(pl => pl === filterPlan || pl.includes(filterPlan) || filterPlan.includes(pl))) {
        return false;
      }
    }
  }

  if (onlyVirtual && !hasVirtual(p)) {
    return false;
  }

  // ========== Statewide Filters (Feature Flag Protected) ==========
  // These filters only apply when the corresponding feature flags are enabled
  const flags = window.FEATURE_FLAGS || {};
  
  // County filter - only applies when STATEWIDE_MODE is enabled
  if (flags.STATEWIDE_MODE) {
    const countyVal = els.county ? safeStr(els.county.value || '') : '';
    if (countyVal) {
      const programCounty = safeStr(p.primary_county || '').toLowerCase();
      const serviceAreaCounties = Array.isArray(p.service_area?.counties) 
        ? p.service_area.counties.map(c => safeStr(c).toLowerCase())
        : [];
      // Also check locations for county data
      const locationCounties = (p.locations || [])
        .map(loc => safeStr(loc.county || '').toLowerCase())
        .filter(c => c);
      const countyMatch = programCounty === countyVal.toLowerCase() ||
                          serviceAreaCounties.includes(countyVal.toLowerCase()) ||
                          locationCounties.includes(countyVal.toLowerCase());
      if (!countyMatch) return false;
    }
    
    // Placeholder for Texas-wide location filtering (future enhancement)
    // When STATEWIDE_MODE is enabled, can filter by state == "TX" and optionally city/county
    // For now, existing location filter handles city-level filtering
    // Future: if (flags.STATEWIDE_MODE && selectedState && selectedState !== 'TX') {
    //   const programStates = (p.locations || []).map(loc => safeStr(loc.state).toUpperCase());
    //   if (!programStates.includes(selectedState.toUpperCase())) return false;
    // }
  }

  // Service domain filter - check both UI element and parsed search filters
  const serviceDomainVal = (els.serviceDomain ? safeStr(els.serviceDomain.value || '') : '') || parsed.serviceDomain || '';
  if (serviceDomainVal) {
    const programDomains = Array.isArray(p.service_domains) 
      ? p.service_domains.map(d => safeStr(d).toLowerCase())
      : [];
    // Check if program's service_domains includes the selected domain
    if (!programDomains.includes(serviceDomainVal.toLowerCase())) return false;
  }
  
  // SUD services filter - only applies when SHOW_SUD_FILTERS is enabled
  if (flags.SHOW_SUD_FILTERS) {

    // SUD services filter - only applies when SHOW_SUD_FILTERS is enabled
    if (els.sudServices) {
      const selectedOptions = Array.from(els.sudServices.selectedOptions).map(opt => opt.value);
      if (selectedOptions.length > 0) {
        const programSudServices = Array.isArray(p.sud_services)
          ? p.sud_services.map(s => safeStr(s).toLowerCase())
          : [];
        // Check if there's any intersection between selected and program SUD services
        const hasMatch = selectedOptions.some(selected =>
          programSudServices.includes(selected.toLowerCase())
        );
        if (!hasMatch) return false;
      }
    }
  }

  // Verification recency filter - only applies when SHOW_VERIFICATION_FILTERS is enabled
  if (flags.SHOW_VERIFICATION_FILTERS) {
    const verificationRecencyVal = els.verificationRecency ? safeStr(els.verificationRecency.value || '') : '';
    if (verificationRecencyVal) {
      const recencyDays = parseInt(verificationRecencyVal, 10);
      if (!isNaN(recencyDays) && recencyDays > 0) {
        const verifiedAt = p.verification?.last_verified_at || p.last_verified; // Support legacy field
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
    }
  }

  return true;
}

// Additional helper functions (normalizePhoneForTel, bestAddress, mapsLinkFor, stableIdFor)
// are now in js/utils/helpers.js and available via window.*

// ========== Call Tracking ==========
async function trackCallAttempt(program) {
  const sanitize = typeof window.sanitizeText === 'function' ? window.sanitizeText : (s) => s;
  callHistory.unshift({
    program: sanitize(program.program_name),
    org: sanitize(program.organization),
    timestamp: new Date().toISOString()
  });
  callHistory = callHistory.slice(0, 20);
  const STORAGE_KEYS = window.STORAGE_KEYS || { CALL_HISTORY: 'callHistory' };
  await saveEncryptedDataFn(STORAGE_KEYS.CALL_HISTORY, callHistory);
  
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

// ========== Card Management ==========
function setCardOpen(cardEl, isOpen){
  cardEl.dataset.open = isOpen ? "true" : "false";
  const btn = cardEl.querySelector(".expandBtn");
  if (btn) btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

// Toggle modal-local card details (self-contained, doesn't affect main page)
function toggleModalCardDetails(cardEl) {
  if (!cardEl) return;
  
  const details = cardEl.querySelector('.card-details');
  if (!details) return;
  
  const isOpen = !details.hasAttribute('hidden');
  const expandBtn = cardEl.querySelector('.expandBtn');
  
  if (isOpen) {
    // Collapse
    details.setAttribute('hidden', '');
    cardEl.dataset.open = 'false';
    if (expandBtn) {
      expandBtn.setAttribute('aria-expanded', 'false');
      expandBtn.setAttribute('title', 'Expand details');
    }
  } else {
    // Expand
    details.removeAttribute('hidden');
    cardEl.dataset.open = 'true';
    if (expandBtn) {
      expandBtn.setAttribute('aria-expanded', 'true');
      expandBtn.setAttribute('title', 'Collapse details');
    }
  }
}

function toggleOpen(id){
  if (!id) return;
  
  const nextOpenId = (openId === id) ? null : id;

  // Close previously open card
  if (openId && openId !== nextOpenId){
    const prev = document.querySelector(`.card[data-id="${CSS.escape(openId)}"]`);
    if (prev) {
      setCardOpen(prev, false);
    }
  }

  openId = nextOpenId;
  syncStateToManager(); // Sync with StateManager

  // Open new card if needed
  if (openId){
    const cur = document.querySelector(`.card[data-id="${CSS.escape(openId)}"]`);
    if (cur) {
      // Only scroll on main page cards, not inside modals
      const isInModal = cur.closest('.modal');
      
      setCardOpen(cur, true);

      // Scroll expanded panel into view (only for main page, not modals)
      if (!isInModal) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          const panel = cur.querySelector('.panel');
          if (panel) {
            panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        });
      }
    }
  }
}

// ========== Rendering Functions ==========
// All rendering functions are now in js/modules/render.js and available via window.*
// Removed duplicates to avoid code duplication and maintenance issues

// createCard wrapper - uses const to avoid overwriting window.createCard
const appCreateCard = (p, idx) => {
  const fn = window.createCard; // from render.js
  if (typeof fn === 'function') {
  const state = {
    getOpenId: () => openId,
    getUserLocation: () => userLocation,
    getCurrentSort: () => currentSort
  };
    return fn(p, idx, {
    els,
    state,
    isFavorite,
    comparisonSet,
    programDataMap
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
    fn(programs, els, updateFavoritesCount);
  } else {
    console.error('updateStats not available. Make sure js/modules/render.js is loaded.');
    // Fallback
  els.programCount.textContent = programs.length;
  updateFavoritesCount();
  }
};

function updateFavoritesCount() {
  const count = favorites.size;
  els.favoritesCount.textContent = count;
  els.favoritesCount.style.display = count > 0 ? 'block' : 'none';
}

function updateComparisonCount() {
  const count = comparisonSet.size;
  const countEl = document.getElementById('comparisonCount');
  if (countEl) {
    countEl.textContent = count;
    countEl.style.display = count > 0 ? 'block' : 'none';
  }
}

function saveComparison() {
  const STORAGE_KEYS = window.STORAGE_KEYS || { COMPARISON: 'comparison' };
  localStorage.setItem(STORAGE_KEYS.COMPARISON, JSON.stringify(Array.from(comparisonSet)));
  updateComparisonCount();
}

function toggleComparison(programId) {
  if (comparisonSet.has(programId)) {
    comparisonSet.delete(programId);
    callShowToast('Removed from comparison', 'success');
  } else {
    if (comparisonSet.size >= 3) {
      callShowToast('Maximum 3 programs can be compared', 'error');
      return;
    }
    comparisonSet.add(programId);
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
  return comparisonSet.has(programId);
}

// renderComparison wrapper - uses const to avoid overwriting window.renderComparison
const callRenderComparison = () => {
  const fn = window.renderComparison; // from render.js
  if (typeof fn === 'function') {
    fn({
      els,
      comparisonSet,
      programDataMap
    });
  } else {
    console.error('renderComparison not available. Make sure js/modules/render.js is loaded.');
  }
};

async function saveFavorites() {
  const STORAGE_KEYS = window.STORAGE_KEYS || { FAVORITES: 'favorites' };
  await saveEncryptedDataFn(STORAGE_KEYS.FAVORITES, Array.from(favorites));
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
  
  if (favorites.has(sanitizedId)) {
    favorites.delete(sanitizedId);
    callShowToast('Removed from saved programs', 'success');
  } else {
    favorites.add(sanitizedId);
    callShowToast('Saved to your programs', 'success');
  }
  await saveFavorites();
  render();
}

function isFavorite(programId) {
  return favorites.has(programId);
}

async function saveProgramNote(programId, note) {
  if (!note || note.trim() === '') {
    delete programNotes[programId];
  } else {
    programNotes[programId] = typeof window.sanitizeText === 'function' 
      ? window.sanitizeText(note, 500)
      : note.substring(0, 500);
  }
  const STORAGE_KEYS = window.STORAGE_KEYS || { PROGRAM_NOTES: 'programNotes' };
  await saveEncryptedDataFn(STORAGE_KEYS.PROGRAM_NOTES, programNotes);
}

function getProgramNote(programId) {
  return programNotes[programId] || '';
}

async function addProgramTag(programId, tag) {
  if (!programTags[programId]) {
    programTags[programId] = [];
  }
  const sanitizedTag = typeof window.sanitizeText === 'function'
    ? window.sanitizeText(tag, 50)
    : tag.substring(0, 50);
  if (!programTags[programId].includes(sanitizedTag) && sanitizedTag.trim()) {
    programTags[programId].push(sanitizedTag);
    const STORAGE_KEYS = window.STORAGE_KEYS || { PROGRAM_TAGS: 'programTags' };
    await saveEncryptedDataFn(STORAGE_KEYS.PROGRAM_TAGS, programTags);
  }
}

async function removeProgramTag(programId, tag) {
  if (programTags[programId]) {
    programTags[programId] = programTags[programId].filter(t => t !== tag);
    if (programTags[programId].length === 0) {
      delete programTags[programId];
    }
    const STORAGE_KEYS = window.STORAGE_KEYS || { PROGRAM_TAGS: 'programTags' };
    await saveEncryptedDataFn(STORAGE_KEYS.PROGRAM_TAGS, programTags);
  }
}

function getProgramTags(programId) {
  return programTags[programId] || [];
}

async function createCustomList(listName) {
  const sanitizedName = typeof window.sanitizeText === 'function'
    ? window.sanitizeText(listName, 50)
    : listName.substring(0, 50);
  if (sanitizedName.trim() && !customLists[sanitizedName]) {
    customLists[sanitizedName] = [];
    const STORAGE_KEYS = window.STORAGE_KEYS || { CUSTOM_LISTS: 'customLists' };
    await saveEncryptedDataFn(STORAGE_KEYS.CUSTOM_LISTS, customLists);
    return sanitizedName;
  }
  return null;
}

async function addToCustomList(listName, programId) {
  if (customLists[listName] && !customLists[listName].includes(programId)) {
    customLists[listName].push(programId);
    const STORAGE_KEYS = window.STORAGE_KEYS || { CUSTOM_LISTS: 'customLists' };
    await saveEncryptedDataFn(STORAGE_KEYS.CUSTOM_LISTS, customLists);
  }
}

async function removeFromCustomList(listName, programId) {
  if (customLists[listName]) {
    customLists[listName] = customLists[listName].filter(id => id !== programId);
    const STORAGE_KEYS = window.STORAGE_KEYS || { CUSTOM_LISTS: 'customLists' };
    await saveEncryptedDataFn(STORAGE_KEYS.CUSTOM_LISTS, customLists);
  }
}

function isInCustomList(listName, programId) {
  return customLists[listName] && customLists[listName].includes(programId);
}

// showToast wrapper - uses const to avoid overwriting window.showToast
// Note: security.js should use window.showToast directly from render.js
const callShowToast = (message, type = 'success') => {
  const fn = window.showToast; // from render.js
  if (typeof fn === 'function') {
    fn(message, type, els.toast);
  } else {
    // Fallback
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = `toast ${type} show`;
  setTimeout(() => {
    els.toast.classList.remove('show');
  }, type === 'error' ? 5000 : 3000);
  }
};

// showModal wrapper - uses const to avoid overwriting window.showModal
const callShowModal = (modalEl) => {
  const fn = window.showModal; // from render.js
  if (typeof fn === 'function') {
    fn(modalEl);
  } else {
    console.error('showModal not available. Make sure js/modules/render.js is loaded.');
  }
};

// hideModal wrapper - uses const to avoid overwriting window.hideModal
const callHideModal = (modalEl) => {
  const fn = window.hideModal; // from render.js
  if (typeof fn === 'function') {
    fn(modalEl);
  } else {
    console.error('hideModal not available. Make sure js/modules/render.js is loaded.');
  }
};

function sortPrograms(list) {
  const sorted = [...list];
  
  const SORT_OPTIONS = window.SORT_OPTIONS || {
    RELEVANCE: 'relevance',
    NAME: 'name',
    VERIFIED: 'verified',
    LOCATION: 'location',
    DISTANCE: 'distance'
  };
  
  switch(currentSort) {
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
      if (userLocation && typeof window.calculateProgramDistance === 'function') {
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
          const distance = window.calculateProgramDistance(program, userLocation.lat, userLocation.lng);
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
  const program = programDataMap.get(programId);
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
  
  const pathname = window.location.pathname.split('?')[0];
  const url = `${window.location.origin}${pathname}?program=${encodeURIComponent(sanitizedId)}`;
  
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

function applyFilterPreset(preset) {
  // Clear ALL current filters comprehensively
  els.q.value = "";
  delete els.q.dataset.exactMatch;
  delete els.q.dataset.matchType;
  els.loc.value = "";
  els.age.value = "";
  if (window.__ageDropdownSync) window.__ageDropdownSync();
  els.care.value = "";
  if (els.insurance) els.insurance.value = "";
  els.onlyVirtual.checked = false;
  els.showCrisis.checked = false;

  // Clear statewide filters
  if (els.serviceDomain) els.serviceDomain.value = "";
  selectedServiceDomains = [];
  if (els.sudServices) {
    Array.from(els.sudServices.options).forEach(opt => opt.selected = false);
  }
  selectedSudServices = [];
  if (els.county) els.county.value = "";
  selectedCounty = null;
  if (els.verificationRecency) els.verificationRecency.value = "";
  verificationRecencyDays = null;
  
  switch(preset) {
    case 'teens-dallas':
      els.loc.value = 'Dallas';
      els.age.value = '13';
      if (window.__ageDropdownSync) window.__ageDropdownSync();
      break;
    case 'crisis-support':
      els.showCrisis.checked = true;
      els.q.value = 'crisis support';
      break;
    case 'virtual-therapy':
      els.onlyVirtual.checked = true;
      els.q.value = 'virtual therapy';
      break;
    case 'iop-plano':
      els.loc.value = 'Plano';
      els.care.value = 'Intensive Outpatient (IOP)';
      break;
    
    // Eating Disorders presets
    case 'eating-disorders-all':
      if (els.serviceDomain) els.serviceDomain.value = 'eating_disorders';
      selectedServiceDomains = ['eating_disorders'];
      break;
    case 'eating-disorders-php':
      if (els.serviceDomain) els.serviceDomain.value = 'eating_disorders';
      selectedServiceDomains = ['eating_disorders'];
      els.care.value = 'Partial Hospitalization (PHP)';
      break;
    case 'eating-disorders-iop':
      if (els.serviceDomain) els.serviceDomain.value = 'eating_disorders';
      selectedServiceDomains = ['eating_disorders'];
      els.care.value = 'Intensive Outpatient (IOP)';
      break;
    case 'eating-disorders-outpatient':
      if (els.serviceDomain) els.serviceDomain.value = 'eating_disorders';
      selectedServiceDomains = ['eating_disorders'];
      els.care.value = 'Outpatient';
      break;
    
    // Substance Use presets
    case 'substance-use-all':
      if (els.serviceDomain) els.serviceDomain.value = 'substance_use';
      selectedServiceDomains = ['substance_use'];
      break;
    case 'substance-use-php':
      if (els.serviceDomain) els.serviceDomain.value = 'substance_use';
      selectedServiceDomains = ['substance_use'];
      els.care.value = 'Partial Hospitalization (PHP)';
      break;
    case 'substance-use-iop':
      if (els.serviceDomain) els.serviceDomain.value = 'substance_use';
      selectedServiceDomains = ['substance_use'];
      els.care.value = 'Intensive Outpatient (IOP)';
      break;
    case 'substance-use-outpatient':
      if (els.serviceDomain) els.serviceDomain.value = 'substance_use';
      selectedServiceDomains = ['substance_use'];
      els.care.value = 'Outpatient';
      break;
  }
  
  syncTopToggles();
  
  // Sync chips after preset is applied
  if (els.sudServices) {
    syncChipsToSelect('sudServices');
  }
  
  render();
  updateURLState();
  updateActiveFilterChips();
  
  const t = document.getElementById("treatmentSection");
  if (t) window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
}

// Make functions globally available for onclick handlers
window.copyShareUrl = copyShareUrl;
window.nativeShare = nativeShare;

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
  const program = programDataMap.get(programId);
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
        Printed from Texas Youth Mental Health Resource Finder
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

async function addRecentSearch(query) {
  if (!query || query.trim().length < 3) return;
  const trimmed = sanitizeText(query.trim(), 200);
  recentSearches = recentSearches.filter(s => s !== trimmed);
  recentSearches.unshift(trimmed);
  recentSearches = recentSearches.slice(0, 5); // Reduced from 10 to 5
  const STORAGE_KEYS = window.STORAGE_KEYS || { RECENT_SEARCHES: 'recentSearches' };
  await saveEncryptedDataFn(STORAGE_KEYS.RECENT_SEARCHES, recentSearches);
  renderRecentSearches();
}

let scheduleRenderFn = null;

function renderRecentSearches() {
  const container = document.querySelector('.recent-searches');
  if (!container) return;
  
  if (recentSearches.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  // Only show the 3 most recent
  const recentToShow = recentSearches.slice(0, 3);
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
      if (scheduleRenderFn) {
        scheduleRenderFn();
      } else {
        render();
      }
      const t = document.getElementById("treatmentSection");
      if (t) window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
    });
  });
}

function renderFavorites() {
  // SECURITY AUDIT FIX: Add null check before DOM manipulation
  if (!els.favoritesList) {
    console.warn('Favorites list element not found');
    return;
  }

  const favoritePrograms = programs.filter(p => {
    const id = stableIdFor(p, programs.indexOf(p));
    return favorites.has(id);
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
  const favoritePrograms = programs.filter(p => {
    const id = stableIdFor(p, programs.indexOf(p));
    return favorites.has(id);
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

  if (callHistory.length === 0) {
    els.historyList.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">No call history yet. Call buttons will appear here after you use them.</p>';
    return;
  }
  
  els.historyList.innerHTML = callHistory.map(call => {
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

// Progressive loading state
let progressiveLoadState = {
  allItems: [],
  displayedCount: 20,
  isLoading: false
};

function renderProgressive(activeList, isCrisisList = false) {
  if (!els.treatmentGrid) return;
  
  const toDisplay = activeList.slice(0, progressiveLoadState.displayedCount);
  els.treatmentGrid.innerHTML = "";
  
  // Use DocumentFragment to batch DOM operations
  const fragment = document.createDocumentFragment();
  
  toDisplay.forEach((p, idx) => {
    const realIdx = isCrisisList ? (idx + 10000) : idx;
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
  if (activeList.length > progressiveLoadState.displayedCount) {
    if (!loadMoreBtn) {
      const btn = document.createElement('button');
      btn.id = 'loadMoreBtn';
      btn.className = 'btn-primary';
      btn.textContent = `Load More (${activeList.length - progressiveLoadState.displayedCount} remaining)`;
      btn.style.margin = '20px auto';
      btn.style.display = 'block';
      btn.addEventListener('click', () => {
        progressiveLoadState.displayedCount = Math.min(
          progressiveLoadState.displayedCount + 20,
          activeList.length
        );
        // Use requestIdleCallback for progressive loading if available
        const loadMore = () => renderProgressive(activeList);
        if (window.requestIdleCallback) {
          requestIdleCallback(loadMore, { timeout: 1000 });
        } else {
          setTimeout(loadMore, 0);
        }
      });
      els.treatmentGrid.parentElement.appendChild(btn);
    } else {
      loadMoreBtn.textContent = `Load More (${activeList.length - progressiveLoadState.displayedCount} remaining)`;
      loadMoreBtn.style.display = 'block';
    }
  } else if (loadMoreBtn) {
    loadMoreBtn.style.display = 'none';
  }
}

function render(){
  if (!ready) {
    return;
  }
  const showCrisis = els.showCrisis?.checked || false;

  // Use filter module if available, fallback to local function
  const filterFn = typeof window.matchesFilters === 'function' 
    ? (p) => {
        const filters = {
          query: els.q?.value || '',
          location: els.loc?.value || '',
          age: els.age?.value || '',
          care: els.care?.value || '',
          insurance: els.insurance?.value || '',
          onlyVirtual: els.onlyVirtual?.checked || false,
          showCrisis: showCrisis,
          county: els.county?.value || '',
          serviceDomain: els.serviceDomain?.value || '',
          verificationRecency: els.verificationRecency?.value || '',
          exactMatch: els.q?.dataset.exactMatch === 'true',
          matchType: els.q?.dataset.matchType || '',
          selectedCounty: selectedCounty,
          selectedServiceDomains: selectedServiceDomains,
          selectedSudServices: selectedSudServices,
          verificationRecencyDays: verificationRecencyDays
        };
        
        const options = {
          safeStr: window.safeStr,
          parseSmartSearch: window.parseSmartSearch,
          fuzzyMatch: window.fuzzyMatch,
          programServesAge: window.programServesAge,
          hasVirtual: window.hasVirtual,
          locLabel: window.locLabel,
          featureFlags: window.FEATURE_FLAGS || {},
          programs: programs,
          ready: ready
        };
        
        return window.matchesFilters(p, filters, options);
      }
    : matchesFilters; // Fallback to local function
  
  const filtered = programs.filter(filterFn);

  const treatment = filtered.filter(p => !isCrisis(p));
  const crisis = filtered.filter(p => isCrisis(p));

  let activeList = showCrisis ? crisis : treatment;
  const activeLabel = showCrisis ? "Crisis Resources" : "Treatment Programs";
  
  // Update active filter chips
  updateActiveFilterChips();

  // Calculate relevance scores for all results
  const query = safeStr(els.q?.value || '').trim();
  if (query) {
    // Use filter module if available, fallback to local function
    const scoreFn = typeof window.calculateRelevanceScore === 'function'
      ? (p) => {
          const options = {
            safeStr: window.safeStr,
            locLabel: window.locLabel,
            fuzzyMatch: window.fuzzyMatch
          };
          return window.calculateRelevanceScore(p, query, options);
        }
      : calculateRelevanceScore; // Fallback to local function
    
    // Map programs with their relevance scores
    const scoredPrograms = activeList.map(p => ({
      program: p,
      score: scoreFn(p)
    }));
    
    // Sort by relevance score (highest first) when sort is "relevance"
    const SORT_OPTIONS = window.SORT_OPTIONS || { RELEVANCE: 'relevance' };
    if (currentSort === SORT_OPTIONS.RELEVANCE) {
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
              userLocation: userLocation,
              SORT_OPTIONS: window.SORT_OPTIONS || {
                RELEVANCE: 'relevance',
                NAME: 'name',
                VERIFIED: 'verified',
                LOCATION: 'location',
                DISTANCE: 'distance'
              }
            };
            return window.sortPrograms(list, currentSort, options);
          }
        : sortPrograms; // Fallback to local function
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
            userLocation: userLocation,
            SORT_OPTIONS: window.SORT_OPTIONS || {
              RELEVANCE: 'relevance',
              NAME: 'name',
              VERIFIED: 'verified',
              LOCATION: 'location',
              DISTANCE: 'distance'
            }
          };
          return window.sortPrograms(list, currentSort, options);
        }
      : sortPrograms; // Fallback to local function
    activeList = sortFn(activeList);
  }
  
  // Store for progressive loading
  progressiveLoadState.allItems = activeList;
  progressiveLoadState.displayedCount = Math.min(20, activeList.length);

  if (openId){
    const stillExists = activeList.some((p, idx) => stableIdFor(p, idx) === openId);
    if (!stillExists) openId = null;
  }

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

  // Show/hide empty state with improved messaging
  if (els.treatmentEmpty) {
    if (activeList.length === 0) {
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
}

function syncTopToggles(){
  els.showCrisisTop.checked = els.showCrisis.checked;
  els.onlyVirtualTop.checked = els.onlyVirtual.checked;
}

// ========== Autocomplete ==========
let autocompleteSuggestions = [];
let autocompleteSelectedIndex = -1;
let autocompleteVisible = false;

function generateAutocompleteSuggestions(query) {
  if (!query || query.length < 2) return [];
  
  const q = query.toLowerCase().trim();
  const suggestions = [];
  const seen = new Set();
  
  // Recent searches
  recentSearches.forEach(search => {
    if (search.toLowerCase().includes(q) && !seen.has(search)) {
      suggestions.push({ type: 'recent', text: search });
      seen.add(search);
    }
  });
  
  // Program names and organizations - search ALL programs, not just first 50
  if (ready && programs.length > 0) {
    const exactMatches = [];
    const fuzzyMatches = [];
    
    programs.forEach(p => {
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
        const orgPrograms = orgProgramsIndex.get(orgLower) || [];
        
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

function renderAutocomplete(suggestions) {
  const container = document.getElementById('search-suggestions');
  const input = els.q;
  
  if (!container || !input) return;
  
  if (suggestions.length === 0) {
    container.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
    autocompleteVisible = false;
    return;
  }
  
  autocompleteSuggestions = suggestions;
  autocompleteSelectedIndex = -1;
  autocompleteVisible = true;
  input.setAttribute('aria-expanded', 'true');
  
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
      <div class="suggestion-item" role="option" data-index="${index}" aria-selected="false">
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
      if (!isNaN(index) && index >= 0 && index < autocompleteSuggestions.length) {
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
  
  autocompleteSelectedIndex = index;
}

function selectSuggestion(index) {
  if (index < 0 || index >= autocompleteSuggestions.length) return;
  
  const suggestion = autocompleteSuggestions[index];
  
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
  autocompleteVisible = false;
  
  // Clear any previous search state and trigger fresh search
  // Use a small delay to ensure the input value is set
  setTimeout(() => {
    if (scheduleRenderFn) {
      scheduleRenderFn();
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
  }
  autocompleteVisible = false;
  autocompleteSelectedIndex = -1;
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

// Sync chip checkboxes to match select state
function syncChipsToSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const chipContainer = document.querySelector(`[data-sync-select="${selectId}"]`);
  if (!chipContainer) return;
  
  const selectedValues = Array.from(select.selectedOptions).map(opt => opt.value);
  const checkboxes = chipContainer.querySelectorAll('input[type="checkbox"]');
  
  checkboxes.forEach(checkbox => {
    checkbox.checked = selectedValues.includes(checkbox.value);
  });
  
  // Show/hide clear button
  const clearBtn = document.querySelector(`[data-clear-select="${selectId}"]`);
  if (clearBtn) {
    clearBtn.style.display = selectedValues.length > 0 ? 'block' : 'none';
  }
}

// Sync select to match chip checkbox state
function syncSelectToChips(selectId, checkboxValue, isChecked) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const option = Array.from(select.options).find(opt => opt.value === checkboxValue);
  if (option) {
    option.selected = isChecked;
    // Dispatch change event so existing handlers run
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// Initialize chip-based multi-selects
function initChipMultiSelects() {
  const chipContainers = document.querySelectorAll('[data-sync-select]');
  
  chipContainers.forEach(container => {
    const selectId = container.dataset.syncSelect;
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Initial sync from select to chips
    syncChipsToSelect(selectId);
    
    // Handle chip checkbox changes
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        syncSelectToChips(selectId, checkbox.value, e.target.checked);
      });
    });
    
    // Handle clear button
    const clearBtn = document.querySelector(`[data-clear-select="${selectId}"]`);
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        // Clear all options
        Array.from(select.options).forEach(opt => opt.selected = false);
        // Dispatch change event
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  });
}

function bind(){
  // Use events module for event handler setup
  if (typeof window.setupEventHandlers !== 'function') {
    console.error('setupEventHandlers not available. Make sure js/modules/events.js is loaded.');
      return;
    }
    
  // Setup state accessors - use StateManager if available, fallback to legacy variables
  const state = {
    getReady: () => stateManager ? stateManager.getState('ready') : ready,
    getOpenId: () => stateManager ? stateManager.getState('openId') : openId,
    setOpenId: (id) => {
      if (stateManager) {
        stateManager.setState({ openId: id });
        openId = id; // Update local variable directly
      } else {
        openId = id;
      }
    },
    getCurrentSort: () => stateManager ? stateManager.getState('currentSort') : currentSort,
    setCurrentSort: (sort) => {
      if (stateManager) {
        stateManager.setState({ currentSort: sort });
        currentSort = sort; // Update local variable directly
      } else {
        currentSort = sort;
      }
    },
    getUserLocation: () => stateManager ? stateManager.getState('userLocation') : userLocation,
    setUserLocation: (loc) => {
      if (stateManager) {
        stateManager.setState({ userLocation: loc });
        userLocation = loc; // Update local variable directly
      } else {
        userLocation = loc;
      }
    },
    getPrograms: () => stateManager ? stateManager.getState('programs') : programs,
    getSelectedCounty: () => stateManager ? stateManager.getState('selectedCounty') : selectedCounty,
    setSelectedCounty: (county) => {
      if (stateManager) {
        stateManager.setState({ selectedCounty: county });
        selectedCounty = county; // Update local variable directly
      } else {
        selectedCounty = county;
      }
    },
    getSelectedServiceDomains: () => stateManager ? stateManager.getState('selectedServiceDomains') : selectedServiceDomains,
    setSelectedServiceDomains: (domains) => {
      if (stateManager) {
        stateManager.setState({ selectedServiceDomains: domains });
        selectedServiceDomains = domains; // Update local variable directly
      } else {
        selectedServiceDomains = domains;
      }
    },
    getSelectedSudServices: () => stateManager ? stateManager.getState('selectedSudServices') : selectedSudServices,
    setSelectedSudServices: (services) => {
      if (stateManager) {
        stateManager.setState({ selectedSudServices: services });
        selectedSudServices = services; // Update local variable directly
      } else {
        selectedSudServices = services;
      }
    },
    getVerificationRecencyDays: () => stateManager ? stateManager.getState('verificationRecencyDays') : verificationRecencyDays,
    setVerificationRecencyDays: (days) => {
      if (stateManager) {
        stateManager.setState({ verificationRecencyDays: days });
        verificationRecencyDays = days; // Update local variable directly
        } else {
        verificationRecencyDays = days;
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
    setupPrivacyControls,
    setCardOpen,
    getAutocompleteVisible: () => autocompleteVisible,
    getAutocompleteSuggestions: () => autocompleteSuggestions,
    getAutocompleteSelectedIndex: () => autocompleteSelectedIndex,
    clearComparison: () => {
      comparisonSet.clear();
      saveComparison();
    }
  };
  
  // Call events module setup
  window.setupEventHandlers({ els, callbacks, state });
  
  // Make scheduleRender accessible globally (set by events module)
  // scheduleRenderFn is set inside setupEventHandlers
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
        favorites.clear();
        recentSearches = [];
        callHistory = [];
        comparisonSet.clear();
        
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
        favorites: Array.from(favorites),
        recentSearches: recentSearches,
        callHistory: callHistory,
        comparison: Array.from(comparisonSet),
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
      geocodedPrograms = new Map();
      if (data.programs && Array.isArray(data.programs)) {
        data.programs.forEach(program => {
          geocodedPrograms.set(program.program_id, program);
        });
      }
      console.log(`Loaded ${geocodedPrograms.size} geocoded programs`);
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
  if (!geocodedPrograms || geocodedPrograms.size === 0) {
    return programs;
  }
  
  return programs.map(program => {
    const geocoded = geocodedPrograms.get(program.program_id);
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
        selectedSudServices = [];
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
  const accordion = document.getElementById('statewideFiltersAccordion');
  if (!accordion) return;
  
  const flags = window.FEATURE_FLAGS || {};
  
  // Check if any advanced filter is available AND enabled by feature flags
  const hasAnyAdvancedFilter = 
    (flags.STATEWIDE_MODE && availableFilters.hasCounty) ||
    (flags.SHOW_SUD_FILTERS && (availableFilters.hasServiceDomains || availableFilters.hasSUD)) ||
    (flags.SHOW_VERIFICATION_FILTERS && availableFilters.hasVerification) ||
    availableFilters.hasServiceArea; // Service area is always available if present
  
  accordion.style.display = hasAnyAdvancedFilter ? 'block' : 'none';
  
  // Show/hide individual filter groups (respect both data availability and feature flags)
  const countyGroup = document.getElementById('countyFilterGroup');
  if (countyGroup) {
    countyGroup.style.display = (flags.STATEWIDE_MODE && availableFilters.hasCounty) ? 'block' : 'none';
  }
  
  const serviceDomainGroup = document.getElementById('serviceDomainFilterGroup');
  if (serviceDomainGroup) {
    serviceDomainGroup.style.display = (flags.SHOW_SUD_FILTERS && (availableFilters.hasServiceDomains || availableFilters.hasSUD)) ? 'block' : 'none';
  }
  
  // Substance Use Services filter - only visible when:
  // 1. Feature flag allows it (SHOW_SUD_FILTERS)
  // 2. Data has SUD services (availableFilters.hasSUD)
  // 3. Service Type is set to "substance_use" (not co-occurring or mental_health)
  const sudServicesGroup = document.getElementById('sudServicesFilterGroup');
  if (sudServicesGroup) {
    const isSubstanceUseSelected = els.serviceDomain && els.serviceDomain.value === 'substance_use';
    const shouldShow = flags.SHOW_SUD_FILTERS && availableFilters.hasSUD && isSubstanceUseSelected;
    
    if (shouldShow) {
      sudServicesGroup.style.display = 'block';
    } else {
      sudServicesGroup.style.display = 'none';
      // Clear selections when hiding
      if (els.sudServices) {
        Array.from(els.sudServices.options).forEach(opt => opt.selected = false);
        selectedSudServices = [];
        syncChipsToSelect('sudServices');
      }
    }
  }
  
  const verificationGroup = document.getElementById('verificationFilterGroup');
  if (verificationGroup) {
    verificationGroup.style.display = (flags.SHOW_VERIFICATION_FILTERS && availableFilters.hasVerification) ? 'block' : 'none';
  }
  
  // Update ARIA expanded state
  const summary = accordion.querySelector('.advanced-filters-summary');
  if (summary) {
    summary.setAttribute('aria-expanded', accordion.open ? 'true' : 'false');
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
  
  // County filter - only show if STATEWIDE_MODE is enabled
  if (flags.STATEWIDE_MODE && els.county && els.county.value) {
    activeFilters.push({
      type: 'county',
      label: `County: ${els.county.options[els.county.selectedIndex]?.text || els.county.value}`,
      removeFn: () => {
        els.county.value = '';
        selectedCounty = null;
        scheduleRender();
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
        selectedServiceDomains = [];
        scheduleRender();
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
          selectedSudServices = [];
          syncChipsToSelect('sudServices');
          scheduleRender();
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
        verificationRecencyDays = null;
        scheduleRender();
      }
    });
  }
  
  // Show/hide container based on active filters
  if (activeFilters.length > 0) {
    container.style.display = 'flex';
    
    // Render chips
    chipsContainer.innerHTML = activeFilters.map((filter, idx) => {
      const chipId = `filter-chip-${filter.type}-${idx}`;
      return `
        <div class="active-filter-chip" role="listitem" id="${chipId}">
          <span class="active-filter-chip-label">${escapeHtml(filter.label)}</span>
          <button 
            type="button" 
            class="active-filter-chip-remove" 
            aria-label="Remove ${escapeHtml(filter.label)} filter"
            data-filter-type="${escapeHtml(filter.type)}"
            tabindex="0">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      `;
    }).join('');
    
    // Attach remove handlers
    chipsContainer.querySelectorAll('.active-filter-chip-remove').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        activeFilters[idx].removeFn();
      });
      // Keyboard support
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activeFilters[idx].removeFn();
        }
      });
    });
  } else {
    container.style.display = 'none';
    chipsContainer.innerHTML = '';
  }
}

function requestUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0 // Don't use cached location
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        let message = 'Unable to get your location';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location access denied';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out';
            break;
        }
        reject(new Error(message));
      },
      options
    );
  });
}

function showLocationConsent() {
  if (!els.locationConsentModal) {
    console.error('Location consent modal not found');
    return;
  }
  callShowModal(els.locationConsentModal);
}

function hideLocationConsent() {
  if (!els.locationConsentModal) return;
    callHideModal(els.locationConsentModal);
}

async function handleNearMeClick() {
  // Always clear previous location to ensure fresh consent every time
  userLocation = null;
  
  // Always show consent modal first (privacy-first approach)
  if (!els.locationConsentModal) {
    callShowToast('Location feature not available', 'error');
    return;
  }
  showLocationConsent();
}

async function handleLocationConsentAllow() {
  hideLocationConsent();
  
  try {
    // Check if distance module is loaded
    if (typeof window.calculateProgramDistance !== 'function') {
      callShowToast('Distance calculation not available. Please refresh the page.', 'error');
      console.error('Distance module not loaded');
      return;
    }
    
    // Request location
    userLocation = await requestUserLocation();
    
    if (!userLocation) {
      callShowToast('Failed to get location', 'error');
      return;
    }
    
    // Set sort to distance
    const SORT_OPTIONS = window.SORT_OPTIONS || { DISTANCE: 'distance' };
    currentSort = SORT_OPTIONS.DISTANCE;
    if (els.sortSelect) {
      els.sortSelect.value = SORT_OPTIONS.DISTANCE;
    }
    
    // Re-render with distance sorting
    if (typeof scheduleRenderFn === 'function') {
      scheduleRenderFn();
    } else {
      render();
    }
    
    // Update button visibility (show stop button, hide near me button)
    updateLocationButtonVisibility();
    
    callShowToast('Location found. Results sorted by distance.', 'success');
  } catch (error) {
    console.error('Location error:', error);
    callShowToast(error.message || 'Failed to get location', 'error');
  }
}

function handleLocationConsentCancel() {
  hideLocationConsent();
}

// TDPSA Compliance: Stop sharing location (right to opt-out)
function handleStopLocationSharing() {
  // Clear location data (TDPSA: right to delete personal data)
  userLocation = null;
  
  // Reset sort if it was set to distance
  const SORT_OPTIONS = window.SORT_OPTIONS || { DISTANCE: 'distance', RELEVANCE: 'relevance' };
  if (currentSort === SORT_OPTIONS.DISTANCE) {
    currentSort = SORT_OPTIONS.RELEVANCE;
    if (els.sortSelect) {
      els.sortSelect.value = SORT_OPTIONS.RELEVANCE;
    }
  }
  
  // Update UI to reflect location is no longer active
  updateLocationButtonVisibility();
  
  // Re-render without distance sorting
  if (typeof scheduleRenderFn === 'function') {
    scheduleRenderFn();
  } else {
    render();
  }
  
  // Provide user feedback (TDPSA: clear communication)
  callShowToast('Location sharing stopped. Your location has been cleared.', 'success');
}

// Update button visibility based on location state (TDPSA: clear opt-out mechanism)
function updateLocationButtonVisibility() {
  if (!els.nearMeBtn || !els.stopLocationBtn) return;
  
  if (userLocation) {
    // Location is active: show stop button, hide near me button
    els.nearMeBtn.style.display = 'none';
    els.stopLocationBtn.style.display = 'inline-flex';
  } else {
    // Location not active: show near me button, hide stop button
    els.nearMeBtn.style.display = 'inline-flex';
    els.stopLocationBtn.style.display = 'none';
  }
}

// Display last updated date from metadata
function updateLastUpdatedDisplay() {
  const lastUpdatedEl = document.getElementById('lastUpdated');
  if (!lastUpdatedEl || !programsMetadata) return;
  
  // Try generatedAt first (ISO format), then generated_at (date format)
  const dateStr = programsMetadata.generatedAt || programsMetadata.generated_at;
  if (dateStr) {
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const formatted = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        lastUpdatedEl.textContent = `Program list updated: ${formatted}`;
        return;
      }
    } catch (e) {
      // Invalid date, fall through to omit
    }
  }
  
  // No valid date found - omit display rather than fabricating
  lastUpdatedEl.textContent = '';
}

// Store metadata for display
let programsMetadata = null;

// Dev-only regression guard: track if we've already warned about display:grid issue
let didWarnDisplayGrid = false;

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
  if (!isDev || didWarnDisplayGrid || !els.treatmentGrid) {
    return;
  }
  
  // Mark as checked immediately to prevent re-running (set BEFORE getComputedStyle)
  didWarnDisplayGrid = true;
  
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
  
  els.loadWarn.classList.remove("show");
  els.loadWarn.textContent = "";
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
  
  if (typeof rs === 'function') {
    rs(els);
  } else {
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
      
      // Create a map of canonical programs by program_id for deduplication
      const canonicalMap = new Map();
      canonicalPrograms.forEach(p => {
        if (p.program_id) {
          canonicalMap.set(p.program_id, p);
        }
      });
      
      // Add regional programs that don't exist in canonical (augmentation only)
      regionalPrograms.forEach(p => {
        if (p.program_id && !canonicalMap.has(p.program_id)) {
          canonicalPrograms.push(p);
        }
      });
      
      // Use merged programs with canonical metadata
      data = {
        programs: canonicalPrograms,
        metadata: canonicalData.metadata || regionalData.metadata || {}
      };
      
      console.info(`Merged regional data: ${regionalPrograms.length} regional programs into ${canonicalPrograms.length} canonical programs`);
    } else if (canonicalData) {
      // Use canonical data only
      data = canonicalData;
      console.log('Using canonical data only:', data.programs ? data.programs.length : 'no programs array');
    } else if (regionalData) {
      // Fallback to regional data only
      data = regionalData;
      console.log('Using regional data only (fallback):', data.programs ? data.programs.length : 'no programs array');
    } else {
      // No data available - throw error
      console.error('No data available - canonicalData:', !!canonicalData, 'regionalData:', !!regionalData);
      throw new Error('Unable to load programs data. Please try refreshing the page.');
    }
    
    // Store metadata for display
    if (data.metadata) {
      programsMetadata = data.metadata;
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
          els.loadWarn.textContent = `Warning: ${validationResults.invalidPrograms.length} program(s) have data quality issues. Some results may be incomplete.`;
          els.loadWarn.classList.add("show");
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
    programs = loadedPrograms;
    programDataMap.clear();
    programs.forEach(p => programDataMap.set(p.program_id, p));
    syncStateToManager(); // Sync with StateManager (programs -> StateManager)
    console.log('Programs loaded:', programs.length, 'Ready:', ready);
    
    // Update available filters after programs are loaded
    availableFilters = computeAvailableFilters(programs);
    updateFilterVisibility();
    
    // Apply feature flags to UI on initial load
    applyFeatureFlagsToUI();

    // Build autocomplete indexes to avoid O(n^2) behavior
    buildAutocompleteIndexes(programs);

    buildLocationOptions(programs);
    buildInsuranceOptions(programs);
    callUpdateStats();
    updateComparisonCount();
    ready = true;
    openId = null;
    syncStateToManager(); // Sync with StateManager
    
    // Initialize button visibility (TDPSA: ensure opt-out is visible when needed)
    if (typeof updateLocationButtonVisibility === 'function') {
      updateLocationButtonVisibility();
    }
    
    // Display last updated date if available
    updateLastUpdatedDisplay();
    
    render();
    
    // Update crisis banner offset after initial render
    updateCrisisBannerOffset();
    
    // Dev-only: Check for display regression after initial render
    checkTreatmentGridDisplayRegression();
    
    // Try to load and merge geocoded data (non-blocking, after initial render)
    loadGeocodedData().then(() => {
      if (geocodedPrograms && geocodedPrograms.size > 0) {
        programs = mergeGeocodedData(programs);
        programDataMap.clear();
        programs.forEach(p => programDataMap.set(p.program_id, p));
        syncStateToManager(); // Sync with StateManager
        // Rebuild autocomplete indexes after merge
        buildAutocompleteIndexes(programs);
        // Recompute available filters after geocoded data merge
        availableFilters = computeAvailableFilters(programs);
        updateFilterVisibility();
        
        // Re-apply feature flags after geocoded data merge
        applyFeatureFlagsToUI();
        // Re-render with geocoded data
        if (ready) {
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
      els.loadWarn.textContent = `Connection issue. Retrying... (${retryCount + 1}/${maxRetries})`;
    els.loadWarn.classList.add("show");
      
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
    
    els.loadWarn.textContent = errorMessage;
    els.loadWarn.classList.add("show");
    announceToScreenReader(errorMessage, 'assertive');
    
    ready = true;
    programs = [];
    buildLocationOptions(programs);
    buildInsuranceOptions(programs);
    openId = null;
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
    updateCrisisBannerOffset();
  });
}

// Update banner offset when DOM is ready (before fonts may load)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateCrisisBannerOffset);
} else {
  // DOM already ready
  updateCrisisBannerOffset();
}
// Handle call/text tracking via event delegation
document.addEventListener('click', (e) => {
  const callBtn = e.target.closest('[data-program-id]');
  if (callBtn && callBtn.href && (callBtn.href.startsWith('tel:') || callBtn.href.startsWith('sms:'))) {
    const programId = callBtn.dataset.programId;
    const program = programDataMap.get(programId);
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
  const action = e.target.dataset.action;
  if (action === 'clear-filters') {
    // Clear all filters
    els.q.value = '';
    delete els.q.dataset.exactMatch;
    delete els.q.dataset.matchType;
    els.loc.value = '';
    els.age.value = '';
    if (window.__ageDropdownSync) window.__ageDropdownSync();
    if (els.care) els.care.value = '';
    if (els.insurance) els.insurance.value = '';
    els.onlyVirtual.checked = false;
    els.onlyVirtualTop.checked = false;
    els.showCrisis.checked = false;
    els.showCrisisTop.checked = false;
    
    // Clear statewide filters if feature flags are enabled
    const flags = window.FEATURE_FLAGS || {};
    if (flags.STATEWIDE_MODE && els.county) els.county.value = '';
    if (flags.SHOW_SUD_FILTERS) {
      if (els.serviceDomain) els.serviceDomain.value = '';
      if (els.sudServices) {
        Array.from(els.sudServices.options).forEach(opt => opt.selected = false);
      }
    }
    if (flags.SHOW_VERIFICATION_FILTERS && els.verificationRecency) {
      els.verificationRecency.value = '';
    }
    
    syncTopToggles();
    render();
  } else if (action === 'broaden-search') {
    // Remove most restrictive filters: clear location, age, and care level
    els.loc.value = '';
    els.age.value = '';
    if (window.__ageDropdownSync) window.__ageDropdownSync();
    if (els.care) els.care.value = '';
    render();
  } else if (action === 'open-what-to-ask') {
    // Scroll to and open the "What to ask" guide
    const guide = document.getElementById('whatToAskGuide');
    if (guide) {
      guide.open = true;
      guide.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Focus the summary for keyboard users
      const summary = guide.querySelector('summary');
      if (summary) {
        setTimeout(() => summary.focus(), 300);
      }
    }
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
    if (window.__ageDropdownSync) window.__ageDropdownSync();
    els.care.value = '';
    els.onlyVirtual.checked = false;
    els.showCrisis.checked = false;
    syncTopToggles();
    openId = null;
    render();
    const t = document.getElementById("treatmentSection");
    if (t) window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  }
});

// ========== URL State Management ==========
function updateURLState() {
  const params = new URLSearchParams();
  
  // Add search query
  if (els.q && els.q.value) {
    params.set('q', els.q.value);
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
  if (currentSort && currentSort !== SORT_OPTIONS.RELEVANCE) {
    params.set('sort', currentSort);
  }
  
  // Update URL without reload
  const newURL = params.toString() 
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
  window.history.replaceState({ filters: params.toString() }, '', newURL);
}

function loadURLState() {
  const params = new URLSearchParams(window.location.search);
  
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
    if (window.__ageDropdownSync) window.__ageDropdownSync();
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
    currentSort = params.get('sort');
    els.sortSelect.value = currentSort;
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
        selectedSudServices = [];
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
  if (ready) {
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
  
  if (programId && ready) {
    // Find and open the program
    programs.forEach((p, idx) => {
      const id = stableIdFor(p, idx);
      if (id === programId) {
        openId = id;
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

// Document-level event delegation is set up at the top of the file (after DOM elements)

// Initialize
initAgeDropdown();
bind();
initSwipeGestures();

// Clear location on page load (privacy-first: never persist location)
userLocation = null;

// Clear location when page unloads (extra privacy measure)
window.addEventListener('beforeunload', () => {
  userLocation = null;
});

loadPrograms().then(() => {
  // Clear any stale dataset attributes on initial load if q is empty
  if (els.q && (!els.q.value || !els.q.value.trim())) {
    delete els.q.dataset.exactMatch;
    delete els.q.dataset.matchType;
  }
  handleURLParams();
  renderRecentSearches();
  updateFavoritesCount();
}).catch(err => {
  console.error('Failed to load programs:', err);
});
