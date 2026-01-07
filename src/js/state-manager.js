// ========== State Manager ==========
// Centralized state management with validation and persistence

class StateManager {
  constructor() {
    this.state = {
      programs: [],
      ready: false,
      openId: null,
      currentSort: (typeof window !== 'undefined' && window.DEFAULT_SORT) || 'relevance',
      userLocation: null, // { lat, lng } - kept in memory only, never stored (privacy-first)
      geocodedPrograms: null, // Loaded from programs.geocoded.json if available
      availableFilters: {
        hasCounty: false,
        hasServiceDomains: false,
        hasSUD: false,
        hasVerification: false,
        hasServiceArea: false
      },
      // Statewide filter state
      selectedCounty: null,
      selectedServiceDomains: [],
      selectedSudServices: [],
      verificationRecencyDays: null,
      filters: {
        query: '',
        location: '',
        age: '',
        care: '',
        insurance: '',
        showCrisis: false,
        onlyVirtual: false
      },
      progressiveLoad: {
        allItems: [],
        displayedCount: 20,
        isLoading: false
      }
    };
    
    this.listeners = new Set();
    // Only persist non-sensitive state (userLocation is never persisted)
    this.persistKeys = ['currentSort', 'filters'];
  }

  // Get state
  getState(key) {
    if (key) {
      return this.state[key];
    }
    return { ...this.state };
  }

  // Set state
  setState(updates) {
    const oldState = { ...this.state };
    
    Object.keys(updates).forEach(key => {
      if (this.state.hasOwnProperty(key)) {
        this.state[key] = updates[key];
      }
    });
    
    // Validate state
    this.validateState();
    
    // Persist if needed
    this.persistState();
    
    // Notify listeners
    this.notifyListeners(oldState, this.state);
    
    return this.state;
  }

  // Update nested state
  updateNested(key, updates) {
    if (!this.state[key] || typeof this.state[key] !== 'object') {
      this.state[key] = {};
    }
    
    const oldState = { ...this.state };
    this.state[key] = { ...this.state[key], ...updates };
    
    this.validateState();
    this.persistState();
    this.notifyListeners(oldState, this.state);
    
    return this.state[key];
  }

  // Validate state
  validateState() {
    // Validate sort
    const SORT_OPTIONS = (typeof window !== 'undefined' && window.SORT_OPTIONS) || {
      RELEVANCE: 'relevance',
      NAME: 'name',
      VERIFIED: 'verified',
      LOCATION: 'location',
      DISTANCE: 'distance'
    };
    const validSorts = [
      SORT_OPTIONS.RELEVANCE,
      SORT_OPTIONS.NAME,
      SORT_OPTIONS.VERIFIED,
      SORT_OPTIONS.LOCATION,
      SORT_OPTIONS.DISTANCE
    ];
    if (!validSorts.includes(this.state.currentSort)) {
      this.state.currentSort = SORT_OPTIONS.RELEVANCE;
    }
    
    // Validate filters
    if (this.state.filters.age) {
      const age = Number(this.state.filters.age);
      if (!Number.isFinite(age) || age < 0 || age > 17) {
        this.state.filters.age = '';
      }
    }
    
    // Validate progressive load
    if (this.state.progressiveLoad.displayedCount < 0) {
      this.state.progressiveLoad.displayedCount = 20;
    }
    
    // Validate statewide filters
    if (!Array.isArray(this.state.selectedServiceDomains)) {
      this.state.selectedServiceDomains = [];
    }
    if (!Array.isArray(this.state.selectedSudServices)) {
      this.state.selectedSudServices = [];
    }
    if (this.state.verificationRecencyDays !== null && 
        (!Number.isFinite(this.state.verificationRecencyDays) || this.state.verificationRecencyDays < 0)) {
      this.state.verificationRecencyDays = null;
    }
  }

  // Persist state to localStorage
  persistState() {
    try {
      const toPersist = {};
      this.persistKeys.forEach(key => {
        if (this.state[key] !== undefined) {
          toPersist[key] = this.state[key];
        }
      });
      localStorage.setItem('appState', JSON.stringify(toPersist));
    } catch (e) {
      console.warn('Failed to persist state:', e);
    }
  }

  // Load state from localStorage
  loadPersistedState() {
    try {
      const persisted = localStorage.getItem('appState');
      if (persisted) {
        const parsed = JSON.parse(persisted);
        Object.keys(parsed).forEach(key => {
          if (this.state.hasOwnProperty(key)) {
            this.state[key] = parsed[key];
          }
        });
        this.validateState();
      }
    } catch (e) {
      console.warn('Failed to load persisted state:', e);
    }
  }

  // Subscribe to state changes
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify listeners
  notifyListeners(oldState, newState) {
    this.listeners.forEach(listener => {
      try {
        listener(newState, oldState);
      } catch (e) {
        console.error('State listener error:', e);
      }
    });
  }

  // Reset state
  reset() {
    const oldState = { ...this.state };
    const DEFAULT_SORT = (typeof window !== 'undefined' && window.DEFAULT_SORT) || 'relevance';
    this.state = {
      programs: this.state.programs, // Keep programs
      ready: this.state.ready, // Keep ready status
      geocodedPrograms: this.state.geocodedPrograms, // Keep geocoded data
      availableFilters: this.state.availableFilters, // Keep available filters metadata
      openId: null,
      currentSort: DEFAULT_SORT,
      userLocation: null, // Clear user location (privacy-first)
      selectedCounty: null,
      selectedServiceDomains: [],
      selectedSudServices: [],
      verificationRecencyDays: null,
      filters: {
        query: '',
        location: '',
        age: '',
        care: '',
        insurance: '',
        showCrisis: false,
        onlyVirtual: false
      },
      progressiveLoad: {
        allItems: [],
        displayedCount: 20,
        isLoading: false
      }
    };
    this.validateState();
    this.persistState();
    this.notifyListeners(oldState, this.state);
  }

  // Get state snapshot for debugging
  getSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }
}

// Create singleton instance
let stateManagerInstance = null;

function getStateManager() {
  if (!stateManagerInstance) {
    stateManagerInstance = new StateManager();
    stateManagerInstance.loadPersistedState();
  }
  return stateManagerInstance;
}

// For non-module environments
if (typeof window !== 'undefined') {
  window.StateManager = StateManager;
  window.getStateManager = getStateManager;
}


