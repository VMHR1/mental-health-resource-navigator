// Single backing store for what used to be app.js's top-level variables.
// Deliberately a plain mutable object so the migration is a mechanical
// rename (`programs` -> `state.programs`) with zero behavior change.
// StateManager mirroring (syncStateToManager) is unchanged from before.

// Initialize StateManager instance
let stateManager = null;
if (typeof window.getStateManager === 'function') {
  stateManager = window.getStateManager();
} else {
  console.error('getStateManager not available. Make sure js/state-manager.js is loaded.');
}

const URL_FILTER_PARAM_KEYS = ['q', 'loc', 'care', 'age', 'insurance', 'crisis', 'virtual', 'sort'];

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

const STORAGE_KEYS_COMPARISON = window.STORAGE_KEYS || { COMPARISON: 'comparison' };

const state = {
  programs: [],
  ready: false,
  /** When false, treatment cards and results chrome stay hidden until Find Programs or Browse all. */
  resultsUnlocked: false,
  openId: null,
  currentSort: window.DEFAULT_SORT || 'relevance',
  userLocation: null, // { lat, lng } - kept in memory only, never stored
  geocodedPrograms: null, // Loaded from programs.geocoded.json if available
  availableFilters: {
    hasCounty: false,
    hasServiceDomains: false,
    hasSUD: false,
    hasVerification: false,
    hasServiceArea: false
  },
  // Statewide filter state (with safe defaults)
  selectedCounty: null,
  selectedServiceDomains: [],
  selectedSudServices: [],
  verificationRecencyDays: null,
  // Encrypted storage state (populated by initializeEncryptedStorage in app.js)
  favorites: new Set(),
  recentSearches: [],
  callHistory: [],
  customLists: {}, // { listName: Set<programIds> }
  programNotes: {}, // { programId: note }
  programTags: {}, // { programId: [tags] }
  userPreferences: {
    defaultSort: window.DEFAULT_SORT || 'relevance',
    defaultView: 'grid',
    showCrisisByDefault: false,
    itemsPerPage: 20
  },
  performanceModule: null,
  updateCrisisBannerOffset: null,
  comparisonSet: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS_COMPARISON.COMPARISON) || '[]')),
  programDataMap: new Map(),
  // Avoid O(n^2) behavior in autocomplete by pre-indexing organizations.
  orgProgramsIndex: new Map(), // key: lowercased organization name -> Program[]
  /** Bumped on each render; stale async renders must not overwrite the UI. */
  renderGeneration: 0,
  recentSearchesPanelOpen: false,
  // Progressive loading state
  progressiveLoadState: {
    allItems: [],
    displayedCount: 20,
    isLoading: false
  },
  autocompleteSuggestions: [],
  autocompleteSelectedIndex: -1,
  autocompleteVisible: false,
  // Store metadata for display
  programsMetadata: null,
  // Dev-only regression guard: track if we've already warned about display:grid issue
  didWarnDisplayGrid: false
};

// Sync legacy variables with StateManager
function syncStateFromManager() {
  if (!stateManager) return;
  const s = stateManager.getState();
  state.programs = s.programs || [];
  state.ready = s.ready || false;
  state.openId = s.openId || null;
  state.currentSort = s.currentSort || window.DEFAULT_SORT || 'relevance';
  state.userLocation = s.userLocation || null;
  state.geocodedPrograms = s.geocodedPrograms || null;
  state.availableFilters = s.availableFilters || {
    hasCounty: false,
    hasServiceDomains: false,
    hasSUD: false,
    hasVerification: false,
    hasServiceArea: false
  };
  state.selectedCounty = s.selectedCounty || null;
  state.selectedServiceDomains = s.selectedServiceDomains || [];
  state.selectedSudServices = s.selectedSudServices || [];
  state.verificationRecencyDays = s.verificationRecencyDays || null;
}

// Sync StateManager with legacy variables
function syncStateToManager() {
  if (!stateManager) return;
  stateManager.setState({
    programs: state.programs,
    ready: state.ready,
    openId: state.openId,
    currentSort: state.currentSort,
    userLocation: state.userLocation,
    geocodedPrograms: state.geocodedPrograms,
    availableFilters: state.availableFilters,
    selectedCounty: state.selectedCounty,
    selectedServiceDomains: state.selectedServiceDomains,
    selectedSudServices: state.selectedSudServices,
    verificationRecencyDays: state.verificationRecencyDays
  });
}

export {
  state, stateManager, syncStateFromManager, syncStateToManager,
  loadEncryptedDataFn, saveEncryptedDataFn, URL_FILTER_PARAM_KEYS, STORAGE_KEYS_COMPARISON,
};
