// ========== Configuration Constants ==========

const SITE = {
  name: 'ViableMHR',
  tagline: 'Texas youth mental health resources',
  geoScope: 'the Dallas–Fort Worth metro and surrounding North Texas',
  url: 'https://viablemhr.com',
  ogImage: 'https://viablemhr.com/icon.png',
  description:
    'A neutral directory of adolescent and youth mental health programs in the Dallas–Fort Worth metro and surrounding North Texas. Filter by level of care, location, and needs.',
};

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
  /** Quick start — broad (no single city) */
  'youth-teens': {
    age: '15',
    query: '',
  },
  'crisis-support': {
    showCrisis: true,
    query: 'crisis support',
  },
  'virtual-therapy': {
    onlyVirtual: true,
    query: '',
  },
  'iop-programs': {
    care: 'Intensive Outpatient (IOP)',
    query: '',
  },
  'outpatient-programs': {
    care: 'Outpatient',
    query: '',
  },
  /** Legacy / examples — city + filter combos */
  'teens-dallas': {
    location: 'Dallas',
    age: '13',
    query: '',
  },
  'iop-plano': {
    location: 'Plano',
    care: 'Intensive Outpatient (IOP)',
    query: '',
  },
  'eating-disorders-all': {
    serviceDomain: 'eating_disorders',
    query: '',
  },
  'eating-disorders-php': {
    serviceDomain: 'eating_disorders',
    care: 'Partial Hospitalization (PHP)',
    query: '',
  },
  'eating-disorders-iop': {
    serviceDomain: 'eating_disorders',
    care: 'Intensive Outpatient (IOP)',
    query: '',
  },
  'eating-disorders-outpatient': {
    serviceDomain: 'eating_disorders',
    care: 'Outpatient',
    query: '',
  },
  'substance-use-all': {
    serviceDomain: 'substance_use',
    query: '',
  },
  'substance-use-php': {
    serviceDomain: 'substance_use',
    care: 'Partial Hospitalization (PHP)',
    query: '',
  },
  'substance-use-iop': {
    serviceDomain: 'substance_use',
    care: 'Intensive Outpatient (IOP)',
    query: '',
  },
  'substance-use-outpatient': {
    serviceDomain: 'substance_use',
    care: 'Outpatient',
    query: '',
  },
};

/** Quick-fill examples shown under the search box (also documented in search tips). */
const SEARCH_EXAMPLES = [
  { label: 'IOP in Plano', query: 'IOP in Plano' },
  { label: 'PHP in Dallas', query: 'partial hospitalization Dallas' },
  { label: 'Teen (age 14)', query: 'outpatient Dallas 14' },
  { label: '13 and up', query: 'IOP 13 and up' },
];

const PROGRESSIVE_LOAD_INCREMENT = 20;
const INITIAL_LOAD_COUNT = 20;
const MAX_RECENT_SEARCHES = 5;
const MAX_CALL_HISTORY = 20;
const MAX_COMPARISON_ITEMS = 3;

// ========== Sort Options ==========
const SORT_OPTIONS = {
  RELEVANCE: 'relevance',
  NAME: 'name',
  VERIFIED: 'verified',
  LOCATION: 'location',
  DISTANCE: 'distance'
};

const DEFAULT_SORT = SORT_OPTIONS.RELEVANCE;

// ========== Storage Keys ==========
const STORAGE_KEYS = {
  FAVORITES: 'favorites',
  RECENT_SEARCHES: 'recentSearches',
  CALL_HISTORY: 'callHistory',
  COMPARISON: 'comparison',
  PROGRAM_NOTES: 'programNotes',
  PROGRAM_TAGS: 'programTags',
  CUSTOM_LISTS: 'customLists'
};

// ========== CSS Class Names ==========
const CSS_CLASSES = {
  TEXT_SMALL: 'text-small',
  IS_SCROLLING: 'is-scrolling',
  VV_CHANGING: 'vv-changing',
  IS_RESIZING: 'is-resizing',
  MODAL_OPEN: 'modal-open'
};

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
  window.SITE = SITE;
  window.CITIES = CITIES;
  window.LEVELS_OF_CARE = LEVELS_OF_CARE;
  window.FILTER_PRESETS = FILTER_PRESETS;
  window.SEARCH_EXAMPLES = SEARCH_EXAMPLES;
  window.FEATURE_FLAGS = FEATURE_FLAGS;
  window.SORT_OPTIONS = SORT_OPTIONS;
  window.DEFAULT_SORT = DEFAULT_SORT;
  window.STORAGE_KEYS = STORAGE_KEYS;
  window.CSS_CLASSES = CSS_CLASSES;
}


