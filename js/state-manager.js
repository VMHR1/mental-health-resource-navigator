// ========== State Manager ==========
// Centralized state management with validation and persistence

class StateManager {
  constructor() {
    this.state = {
      programs: [],
      ready: false,
      openId: null,
      currentSort: 'relevance',
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
    const validSorts = ['relevance', 'name', 'verified', 'location'];
    if (!validSorts.includes(this.state.currentSort)) {
      this.state.currentSort = 'relevance';
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
    this.state = {
      programs: this.state.programs, // Keep programs
      ready: this.state.ready, // Keep ready status
      openId: null,
      currentSort: 'relevance',
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


