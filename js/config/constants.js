// ========== Configuration Constants ==========

const CITIES = [
  'dallas', 'plano', 'frisco', 'mckinney', 'richardson', 'denton', 
  'arlington', 'fort worth', 'mansfield', 'keller', 'desoto', 'de soto',
  'rockwall', 'sherman', 'forney', 'burleson', 'flower mound', 
  'the colony', 'bedford', 'lewisville', 'carrollton', 'garland', 
  'mesquite', 'irving', 'grand prairie', 'corsicana'
];

const LEVELS_OF_CARE = [
  'Partial Hospitalization (PHP)',
  'Intensive Outpatient (IOP)',
  'Outpatient',
  'Navigation',
  'Crisis services'
];

const FILTER_PRESETS = {
  'teens-dallas': {
    location: 'Dallas',
    age: '13',
    query: ''
  },
  'crisis-support': {
    showCrisis: true,
    query: 'crisis support'
  },
  'virtual-therapy': {
    onlyVirtual: true,
    query: 'virtual therapy'
  },
  'iop-plano': {
    location: 'Plano',
    care: 'Intensive Outpatient (IOP)'
  }
};

const PROGRESSIVE_LOAD_INCREMENT = 20;
const INITIAL_LOAD_COUNT = 20;
const MAX_RECENT_SEARCHES = 5;
const MAX_CALL_HISTORY = 20;
const MAX_COMPARISON_ITEMS = 3;

// ========== Feature Flags ==========
// Feature flags control statewide-ready functionality without UI clutter
// Set to true to enable features; false to keep UI minimal
const FEATURE_FLAGS = {
  STATEWIDE_MODE: false,           // Enable county filtering and statewide location support
  SHOW_SUD_FILTERS: true,         // Enable service_domain and sud_services filters (needed for eating disorders and substance use)
  SHOW_VERIFICATION_FILTERS: false // Enable verification recency filter
};

// For non-module environments
if (typeof window !== 'undefined') {
  window.CITIES = CITIES;
  window.LEVELS_OF_CARE = LEVELS_OF_CARE;
  window.FILTER_PRESETS = FILTER_PRESETS;
  window.FEATURE_FLAGS = FEATURE_FLAGS;
}


