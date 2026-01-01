// ========== Security ==========
// Load security module (encryption, validation, etc.)
// Security functions are available globally after security.js loads

// ========== State Management ==========
let programs = [];
let ready = false;
let openId = null;
let currentSort = 'relevance';
let userLocation = null; // { lat, lng } - kept in memory only, never stored
let geocodedPrograms = null; // Loaded from programs.geocoded.json if available
let availableFilters = {
  hasCounty: false,
  hasServiceDomains: false,
  hasSUD: false,
  hasVerification: false,
  hasServiceArea: false
};

// Load encrypted data
async function loadEncryptedData(key, defaultValue = []) {
  try {
    const encrypted = localStorage.getItem(`encrypted_${key}`);
    if (!encrypted) return defaultValue;
    if (typeof window.decryptData === 'function') {
      const decrypted = await window.decryptData(encrypted);
      return decrypted || defaultValue;
    }
    // Fallback if security.js not loaded
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue));
  } catch (error) {
    console.error(`Error loading ${key}:`, error);
    return defaultValue;
  }
}

async function saveEncryptedData(key, data) {
  try {
    if (typeof window.encryptData === 'function') {
      const encrypted = await window.encryptData(data);
      if (encrypted) {
        localStorage.setItem(`encrypted_${key}`, encrypted);
        return;
      }
    }
    // Fallback if security.js not loaded
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error saving ${key}:`, error);
    // Fallback to unencrypted storage
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save data:', e);
    }
  }
}

// Initialize encrypted storage
let favorites = new Set();
let recentSearches = [];
let callHistory = [];
let customLists = {}; // { listName: Set<programIds> }
let programNotes = {}; // { programId: note }
let programTags = {}; // { programId: [tags] }
let userPreferences = {
  defaultSort: 'relevance',
  defaultView: 'grid',
  showCrisisByDefault: false,
  itemsPerPage: 20
};

async function initializeEncryptedStorage() {
  favorites = new Set(await loadEncryptedData('favorites', []));
  recentSearches = await loadEncryptedData('recentSearches', []);
  callHistory = await loadEncryptedData('callHistory', []);
  customLists = await loadEncryptedData('customLists', {});
  programNotes = await loadEncryptedData('programNotes', {});
  programTags = await loadEncryptedData('programTags', {});
  const prefs = await loadEncryptedData('userPreferences', {});
  userPreferences = { ...userPreferences, ...prefs };
  
  // Apply preferences
  if (userPreferences.defaultSort && els.sortSelect) {
    currentSort = userPreferences.defaultSort;
    els.sortSelect.value = currentSort;
  }
}

// Initialize on load
initializeEncryptedStorage();

let comparisonSet = new Set(JSON.parse(localStorage.getItem('comparison') || '[]'));

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
  // Handle expand button clicks - check if click is on the button or its child (chev icon)
  // Check both the target and if it's inside an expandBtn
  let expandBtn = e.target.closest('.expandBtn');
  // Also check if clicking directly on the button
  if (!expandBtn && e.target.classList && e.target.classList.contains('expandBtn')) {
    expandBtn = e.target;
  }
  
  if (expandBtn) {
    e.preventDefault();
    e.stopPropagation();
    const card = expandBtn.closest('.card');
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
        if (typeof createCard === 'function') {
          const newCard = createCard(program, idx);
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
        if (typeof createCard === 'function') {
          const newCard = createCard(program, idx);
          card.replaceWith(newCard);
        }
      }
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
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  return dp[m][n];
}

function fuzzyMatch(query, text, threshold = 0.7) {
  if (!query || !text) return false;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  
  // Exact match
  if (t.includes(q)) return true;
  
  // Word-boundary aware matching for multi-word queries
  const qWords = q.split(/\s+/).filter(w => w.length > 0);
  if (qWords.length > 1) {
    // Check if all query words appear in text (with word boundaries)
    const allWordsMatch = qWords.every(qw => {
      // Try exact word match first
      const wordBoundaryRegex = new RegExp(`\\b${qw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (wordBoundaryRegex.test(t)) return true;
      // Then try substring match
      if (t.includes(qw)) return true;
      // Finally try fuzzy match for longer words
      if (qw.length > 3) {
        return fuzzyMatchSingleWord(qw, t, threshold);
      }
      return false;
    });
    if (allWordsMatch) return true;
  }
  
  // Fuzzy match for shorter queries
  if (q.length <= 3) {
    const distance = levenshteinDistance(q, t.substring(0, q.length + 2));
    return distance <= 1;
  }
  
  // For longer queries, check if query is similar to any substring
  const maxDistance = Math.floor(q.length * (1 - threshold));
  for (let i = 0; i <= t.length - q.length; i++) {
    const substring = t.substring(i, i + q.length + maxDistance);
    const distance = levenshteinDistance(q, substring.substring(0, q.length));
    if (distance <= maxDistance) return true;
  }
  
  return false;
}

// Helper function for single word fuzzy matching
function fuzzyMatchSingleWord(query, text, threshold = 0.7) {
  if (!query || !text) return false;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  
  if (t.includes(q)) return true;
  
  if (q.length <= 3) {
    const distance = levenshteinDistance(q, t.substring(0, q.length + 2));
    return distance <= 1;
  }
  
  const maxDistance = Math.floor(q.length * (1 - threshold));
  for (let i = 0; i <= t.length - q.length; i++) {
    const substring = t.substring(i, i + q.length + maxDistance);
    const distance = levenshteinDistance(q, substring.substring(0, q.length));
    if (distance <= maxDistance) return true;
  }
  
  return false;
}

function findBestCityMatch(query, cities) {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  
  // Exact match first
  for (const city of cities) {
    const cityLower = city.toLowerCase();
    if (cityLower === q || cityLower.includes(q) || q.includes(cityLower)) {
      return city;
    }
  }
  
  // Fuzzy match
  let bestMatch = null;
  let bestScore = Infinity;
  
  for (const city of cities) {
    const cityLower = city.toLowerCase();
    const distance = levenshteinDistance(q, cityLower);
    const maxLen = Math.max(q.length, cityLower.length);
    const similarity = 1 - (distance / maxLen);
    
    if (similarity >= 0.6 && distance < bestScore) {
      bestScore = distance;
      bestMatch = city;
    }
  }
  
  return bestMatch;
}

// ========== Smart Search Parser ==========
function parseSmartSearch(query) {
  const q = query.toLowerCase();
  const filters = {
    loc: '',
    locs: [], // Multi-location support
    age: '',
    minAge: null, // For "13 and up" type searches
    care: '',
    showCrisis: false,
    organization: '' // Store detected organization name
  };
  
  // Location detection - handle both "desoto" and "de soto" and multi-location
  const cities = [
    'dallas', 'plano', 'frisco', 'mckinney', 'richardson', 'denton', 
    'arlington', 'fort worth', 'mansfield', 'keller', 'desoto', 'de soto',
    'rockwall', 'sherman', 'forney', 'burleson', 'flower mound', 
    'the colony', 'bedford', 'lewisville', 'carrollton', 'garland', 
    'mesquite', 'irving', 'grand prairie', 'corsicana'
  ];
  
  // Check for multi-location patterns: "Dallas or Plano", "Dallas, Plano", "Dallas/Plano"
  const multiLocationPatterns = [
    /\b([a-z\s]+)\s+(?:or|,|and|\/)\s+([a-z\s]+)\b/i,
    /\b([a-z\s]+)\s*,\s*([a-z\s]+)\b/i
  ];
  
  let foundMultiLocation = false;
  for (const pattern of multiLocationPatterns) {
    const match = q.match(pattern);
    if (match) {
      const city1 = findBestCityMatch(match[1].trim(), cities);
      const city2 = findBestCityMatch(match[2].trim(), cities);
      if (city1 && city2) {
        filters.locs = [city1, city2];
        foundMultiLocation = true;
        break;
      }
    }
  }
  
  // Single location detection if no multi-location found
  // Use word boundaries to avoid matching city names embedded in organization names
  if (!foundMultiLocation) {
    // Check for city matches (prioritize longer matches first)
    // Only match if city appears as a standalone word or at the end
    const sortedCities = cities.sort((a, b) => b.length - a.length);
    for (const city of sortedCities) {
      // Match city only if it's a complete word (word boundary) or at start/end
      const cityPattern = new RegExp(`(^|\\s)${city.replace(/\s+/g, '\\s+')}(\\s|$)`, 'i');
      if (cityPattern.test(q)) {
        // Double-check it's not part of a known organization name pattern
        // (e.g., "Dallas" in "Dallas Children's Health" should still match, but be careful)
        // Normalize city name - handle "de soto" -> "De Soto", "desoto" -> "De Soto"
        if (city === 'desoto' || city === 'de soto') {
          filters.loc = 'De Soto';
        } else {
          filters.loc = city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        break; // Use first (longest) match
      }
    }
    
    // Try fuzzy matching if no exact match
    if (!filters.loc) {
      const fuzzyMatch = findBestCityMatch(q, cities);
      if (fuzzyMatch) {
        if (fuzzyMatch === 'desoto' || fuzzyMatch === 'de soto') {
          filters.loc = 'De Soto';
        } else {
          filters.loc = fuzzyMatch.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
      }
    }
  }
  
  // Try to detect organization name from query
  // Look for common organization patterns (but don't be too aggressive)
  // This is mainly for exact matching when user types an organization name
  if (ready && programs.length > 0 && !filters.loc) {
    // Check if query exactly matches an organization name
    const exactOrg = programs.find(p => 
      safeStr(p.organization).toLowerCase() === q
    );
    if (exactOrg) {
      filters.organization = exactOrg.organization;
    }
  }
  
  // Age detection - handle multiple patterns
  // Pattern 1: "13 and up" or "13+" or "13 years and up"
  const andUpMatch = q.match(/\b(\d{1,2})\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up|and\s*older)\b/i);
  if (andUpMatch) {
    filters.minAge = Number(andUpMatch[1]);
    // Set age to the minimum for filtering purposes
    filters.age = andUpMatch[1];
  } else {
    // Pattern 2: Exact age like "13 year old" or "13"
    const ageMatch = q.match(/\b(\d{1,2})\s*(?:year|yr|y\.o\.|yo)?\s*(?:old)?\b/);
    if(ageMatch) {
      filters.age = ageMatch[1];
    }
  }
  
  // Level of care detection
  if(q.includes('php') || q.includes('partial hospitalization')) {
    filters.care = 'Partial Hospitalization (PHP)';
  } else if(q.includes('iop') || q.includes('intensive outpatient')) {
    filters.care = 'Intensive Outpatient (IOP)';
  } else if(q.includes('outpatient') && !q.includes('intensive')) {
    filters.care = 'Outpatient';
  } else if(q.includes('navigation')) {
    filters.care = 'Navigation';
  }
  
  // Crisis detection
  if(q.includes('crisis') || q.includes('emergency') || q.includes('urgent')) {
    filters.showCrisis = true;
  }
  
  return filters;
}

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

  window.addEventListener("resize", () => close(false));
}

// ========== Utility Functions ==========
function safeStr(x){ return (x ?? "").toString().trim(); }

function escapeHtml(s){
  // Use local implementation to avoid circular reference issues
  // Don't call window.escapeHtml to prevent recursion
  const str = safeStr(s);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\//g, "&#x2F;");
}


function safeUrl(u){
  const s = safeStr(u);
  if (!s) return "";
  // Use validateUrl from security.js if available
  if (typeof window.validateUrl === 'function' && !window.validateUrl(s)) {
    if (typeof window.logSecurityEvent === 'function') {
      window.logSecurityEvent('invalid_url_attempt', { url: s.substring(0, 100) });
    }
    return "";
  }
  try{
    const parsed = new URL(s, window.location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  }catch(_){
    if (typeof window.logSecurityEvent === 'function') {
      window.logSecurityEvent('url_parse_failed', { url: s.substring(0, 100) });
    }
  }
  return "";
}

function domainFromUrl(url){
  try{
    const u = new URL(url);
    return (u.hostname || "").replace(/^www\./i, "");
  }catch(_){
    return "";
  }
}


function isCrisis(p){
  return safeStr(p.entry_type).toLowerCase() === "crisis service";
}

function locLabel(p){
  const locs = Array.isArray(p.locations) ? p.locations : [];
  const first = locs[0] || {};
  const city = safeStr(first.city);
  const state = safeStr(first.state);
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  return "Location not listed";
}

function hasVirtual(p){
  const setting = safeStr(p.service_setting).toLowerCase();
  if (setting.includes("virtual") || setting.includes("tele")) return true;
  const locs = Array.isArray(p.locations) ? p.locations : [];
  return locs.some(l => safeStr(l.city).toLowerCase() === "virtual");
}

function parseAgeSpec(spec){
  const s0 = safeStr(spec);
  if (!s0) return [];
  const s = s0.toLowerCase();

  if (s.includes("all ages") || s.includes("any age")) return [[0, 17]];
  if (s.includes("child") && s.includes("adolescent")) return [[0, 17]];

  const norm = s0.toLowerCase().replace(/[\u2013\u2014\u2212\u2015\u2010\u2011]/g, "-").replace(/\s+/g, " ").trim();

  const plus = norm.match(/(\d+)\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up)/);
  if (plus) return [[Number(plus[1]), 17]];

  const range = norm.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return [[Number(range[1]), Number(range[2])]];

  const to = norm.match(/(\d+)\s*(?:to|through|thru)\s*(\d+)/);
  if (to) return [[Number(to[1]), Number(to[2])]];

  const nums = (norm.match(/\d+/g) || []).map(n => Number(n)).filter(n => Number.isFinite(n));
  if (nums.length >= 2) return [[Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])]];
  if (nums.length === 1) return [[nums[0], nums[0]]];
  return [];
}

function programServesAge(p, age){
  const ranges = parseAgeSpec(p.ages_served);
  if (!ranges.length) return false;
  return ranges.some(([min, max]) => age >= min && age <= max);
}

function buildLocationOptions(list){
  const set = new Set();
  list.forEach(p => {
    (p.locations || []).forEach(l => {
      const c = safeStr(l.city);
      if (c && c.toLowerCase() !== "virtual" && c.toLowerCase() !== "multiple" && c.toLowerCase() !== "n/a") set.add(c);
    });
  });
  const cities = Array.from(set).sort((a,b)=>a.localeCompare(b));
  els.loc.innerHTML = '<option value="">Any</option>' + cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
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
  
  let html = '<option value="">Any insurance</option>';
  
  // Add insurance types section
  if (types.length > 0) {
    html += '<optgroup label="Insurance Types">';
    types.forEach(type => {
      html += `<option value="type:${escapeHtml(type)}">${escapeHtml(type)}</option>`;
    });
    html += '</optgroup>';
  }
  
  // Add insurance plans section
  if (plans.length > 0) {
    html += '<optgroup label="Insurance Plans">';
    plans.forEach(plan => {
      html += `<option value="plan:${escapeHtml(plan)}">${escapeHtml(plan)}</option>`;
    });
    html += '</optgroup>';
  }
  
  if (els.insurance) {
    els.insurance.innerHTML = html;
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
    } else if (fuzzyMatch(qLower, orgLower, 0.85)) {
      score += 60;
    }
    
    // Program name matching
    if (progLower.includes(qLower)) {
      score += 70;
    } else if (qLower.includes(progLower)) {
      score += 65;
    } else if (fuzzyMatch(qLower, progLower, 0.85)) {
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
  const parsed = parseSmartSearch(els.q?.value || '');
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
            (p.notes || "")
          ].map(safeStr).join(" ").toLowerCase();
          
          // Check if all remaining search terms appear (with fuzzy matching for typos)
          const terms = searchTerms.split(/\s+/).filter(t => t.length > 0);
          if (terms.length > 0) {
            // Prioritize organization and program name matches
            const orgMatch = terms.every(term => {
              if (orgLower.includes(term)) return true;
              if (term.length > 3) return fuzzyMatch(term, orgLower, 0.85);
              return false;
            });
            
            const progMatch = terms.every(term => {
              if (progLower.includes(term)) return true;
              if (term.length > 3) return fuzzyMatch(term, progLower, 0.85);
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
                  return fuzzyMatch(term, hay, 0.7);
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
      return programCities.some(c => c === searchCity || fuzzyMatch(searchCity, c, 0.8));
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
        const matches = cities.some(c => c === normalizedLocation || fuzzyMatch(normalizedLocation, c, 0.8));
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

  return true;
}

function normalizePhoneForTel(phone){
  const raw = safeStr(phone);
  if (!raw) return "";
  const plus = raw.trim().startsWith("+") ? "+" : "";
  const digits = raw.replace(/[^\d]/g,"");
  return (plus + digits);
}

function bestAddress(p){
  const locs = Array.isArray(p.locations) ? p.locations : [];
  const l = locs[0] || {};
  const parts = [safeStr(l.address), safeStr(l.city), safeStr(l.state), safeStr(l.zip)].filter(Boolean);
  return parts.join(", ");
}

function mapsLinkFor(p){
  const addr = bestAddress(p);
  if (!addr) return "";
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
}

// Stable, cross-sort/cross-filter identifier.
// IMPORTANT: Do not include the current list index; it changes whenever results are
// sorted/filtered, which breaks Saved/Compare state.
function stableIdFor(p, _i){
  const pid = safeStr(p.program_id);
  if (pid) return `p_${pid}`;

  // Fallback (should be rare): hash the core identifying fields.
  const base =
    `${safeStr(p.program_name)}|${safeStr(p.organization)}|${locLabel(p)}|${safeStr(p.level_of_care)}|${safeStr(p.entry_type)}`
    .toLowerCase();

  let h = 2166136261;
  for (let k=0; k<base.length; k++){
    h ^= base.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return `p_${(h>>>0).toString(16)}`;
}

// ========== Call Tracking ==========
async function trackCallAttempt(program) {
  const sanitize = typeof window.sanitizeText === 'function' ? window.sanitizeText : (s) => s;
  callHistory.unshift({
    program: sanitize(program.program_name),
    org: sanitize(program.organization),
    timestamp: new Date().toISOString()
  });
  callHistory = callHistory.slice(0, 20);
  await saveEncryptedData('callHistory', callHistory);
  
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

  // Open new card if needed
  if (openId){
    const cur = document.querySelector(`.card[data-id="${CSS.escape(openId)}"]`);
    if (cur) {
      setCardOpen(cur, true);

      // Scroll into view if needed
      const rect = cur.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight){
        window.scrollTo({ top: window.scrollY + rect.top - 14, behavior: "smooth" });
      }
    }
  }
}

function createCard(p, idx){
  const crisis = isCrisis(p);
  const loc = locLabel(p);
  const care = safeStr(p.level_of_care) || "Not listed";
  const id = stableIdFor(p, idx);
  programDataMap.set(id, p);
  const isOpen = (openId === id);

  const phone = safeStr(p.phone);
  const tel = normalizePhoneForTel(phone);
  const maps = mapsLinkFor(p);

  const website = safeUrl(p.website_url || p.website || "");
  const websiteDomain = website ? (safeStr(p.website_domain) || domainFromUrl(website)) : "";

  const addresses = (Array.isArray(p.locations) ? p.locations : [])
    .map(l => [safeStr(l.address), safeStr(l.city), safeStr(l.state), safeStr(l.zip)].filter(Boolean).join(", "))
    .filter(Boolean);

  const verificationSource = safeStr(p.verification_source);
  const lastVerified = safeStr(p.last_verified);
  const accuracyLine = (verificationSource || lastVerified)
    ? `Source: ${verificationSource || "—"}${verificationSource && lastVerified ? " • " : ""}${lastVerified ? `Last verified: ${lastVerified}` : ""}`
    : `Verification info not provided for this listing. Please confirm details with the program directly.`;

  // Availability badge
  const waitlist = safeStr(p.waitlist_status).toLowerCase();
  const accepting = safeStr(p.accepting_new_patients).toLowerCase();
  
  let availabilityBadge = '';
  if(accepting === 'yes' && (waitlist === 'none' || waitlist === 'short')) {
    availabilityBadge = `
      <div class="availability-badge available">
        <span class="badge-icon">✓</span>
        <span>Currently Accepting Patients</span>
      </div>
    `;
  } else if(waitlist === 'long' || waitlist === 'moderate') {
    availabilityBadge = `
      <div class="availability-badge limited">
        <span class="badge-icon">⏱️</span>
        <span>Limited Availability - ${waitlist.charAt(0).toUpperCase() + waitlist.slice(1)} Waitlist</span>
      </div>
    `;
  }

  const div = document.createElement("article");
  div.className = "card";
  div.dataset.open = isOpen ? "true" : "false";
  div.setAttribute("data-id", id);

  // Check if verified within 60 days
  if(lastVerified) {
    const date = new Date(lastVerified);
    const now = new Date();
    const daysSince = (now - date) / (1000 * 60 * 60 * 24);
    if(daysSince < 60) {
      div.dataset.recent = "true";
    }
  }

  div.innerHTML = `
    <div class="badgeRow">
      <span class="badge ${crisis ? "crisis" : ""}">${escapeHtml(care)}</span>
      <span class="badge ${crisis ? "crisis" : "loc"}">${escapeHtml(loc)}</span>
      ${hasVirtual(p) ? `<span class="badge ${crisis ? "crisis" : "loc2"}">Virtual option</span>` : ``}
      ${userLocation && currentSort === 'distance' && typeof window.calculateProgramDistance === 'function' ? (() => {
        const distance = window.calculateProgramDistance(p, userLocation.lat, userLocation.lng);
        if (distance !== null && distance !== Infinity) {
          return `<span class="badge distance-badge">${distance.toFixed(1)} mi</span>`;
        }
        return '';
      })() : ''}
    </div>

    <div class="cardTop">
      <div style="min-width:0">
        <p class="pname">${escapeHtml(safeStr(p.program_name) || "Program")}</p>
        <p class="org">${escapeHtml(safeStr(p.organization) || "")}</p>
      </div>

      <button class="expandBtn" type="button"
        aria-expanded="${isOpen ? "true" : "false"}"
        aria-controls="panel_${escapeHtml(id)}"
        title="${isOpen ? "Collapse details" : "Expand details"}">
        <span class="chev" aria-hidden="true"></span>
      </button>
    </div>

    <div class="meta">
      <span>Age: ${escapeHtml(safeStr(p.ages_served) || "Unknown")}</span>
      <span>Setting: ${escapeHtml(safeStr(p.service_setting) || "Unknown")}</span>
    </div>

    ${availabilityBadge}

    <div class="card-actions">
      <button type="button" class="card-action-btn favorite ${isFavorite(id) ? 'active' : ''}" data-favorite="${escapeHtml(id)}" aria-label="${isFavorite(id) ? 'Remove from saved' : 'Save program'}">
        <span class="icon">${isFavorite(id) ? '⭐' : '☆'}</span>
        <span>${isFavorite(id) ? 'Saved' : 'Save'}</span>
      </button>
      <button type="button" class="card-action-btn" data-share="${escapeHtml(id)}" aria-label="Share program">
        <span class="icon">🔗</span>
        <span>Share</span>
      </button>
      <label class="card-action-btn compare-btn ${comparisonSet.has(id) ? 'active' : ''}" ${comparisonSet.size >= 3 && !comparisonSet.has(id) ? 'style="opacity: 0.5; cursor: not-allowed;"' : ''}>
        <input type="checkbox" data-compare="${escapeHtml(id)}" ${comparisonSet.has(id) ? 'checked' : ''} ${comparisonSet.size >= 3 && !comparisonSet.has(id) ? 'disabled' : ''} aria-label="Add to comparison" style="display: none;" />
        <span class="icon">⚖️</span>
        <span>${comparisonSet.has(id) ? 'Comparing' : 'Compare'}</span>
      </label>
    </div>

    <div class="accuracyStrip">${escapeHtml(accuracyLine)}</div>

    <div class="panel" id="panel_${escapeHtml(id)}">
      ${addresses.length ? `
        <div class="kv">
          <div class="k">Address</div>
          <div class="v">${addresses.map(a=>`<div>${escapeHtml(a)}</div>`).join("")}</div>
        </div>
      ` : ``}

      <div class="kv">
        <div class="k">Type</div>
        <div class="v">${escapeHtml(safeStr(p.entry_type) || "Not listed")}</div>
      </div>
        <div class="kv">
        <div class="k">Insurance</div>
        <div class="v">${escapeHtml(safeStr(p.insurance_notes) || "Not listed — call to confirm")}</div>
      </div>

      ${website ? `
        <div class="kv">
          <div class="k">Website</div>
          <div class="v">
            <a class="siteLink" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">
              Visit website <span aria-hidden="true">↗</span>
            </a>
            ${websiteDomain ? `<span class="siteDomain">${escapeHtml(websiteDomain)}</span>` : ``}
          </div>
        </div>
      ` : ``}
      <div class="kv">
        <div class="k">Transportation</div>
        <div class="v">${escapeHtml(safeStr(p.transportation_available) || "Not listed")}</div>
      </div>
      <div class="kv">
        <div class="k">Notes</div>
        <div class="v">${escapeHtml(safeStr(p.notes) || "—")}</div>
      </div>

      <div class="actions">
        <a class="linkBtn" href="program.html?id=${escapeHtml(safeStr(p.program_id))}" style="margin-right: 8px;">View Details</a>
        ${tel ? `<a class="linkBtn ${crisis ? "danger" : "primary"}" href="tel:${escapeHtml(tel)}" data-program-id="${escapeHtml(id)}">Call Now</a>` : ``}
        ${maps ? `<a class="linkBtn" href="${escapeHtml(maps)}" target="_blank" rel="noopener">Directions</a>` : ``}
        ${(!tel && !maps) ? `<span style="color:var(--muted);font-size:13px;font-weight:700;">No quick actions available for this listing.</span>` : ``}
      </div>
    </div>
  `;
  return div;
}

function renderSkeletons(){
  const make = () => {
    const d = document.createElement("div");
    d.className = "skeleton";
    d.innerHTML = `<div class="shimmer"></div>`;
    return d;
  };
  els.treatmentGrid.innerHTML = "";
  for (let i=0; i<9; i++) els.treatmentGrid.appendChild(make());
  els.treatmentCount.textContent = "Loading…";
  els.treatmentEmpty.style.display = "none";
  els.totalCount.textContent = "…";
}

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

function updateStats() {
  const uniqueCities = new Set();
  programs.forEach(p => {
    (p.locations || []).forEach(l => {
      const city = safeStr(l.city);
      if(city && city.toLowerCase() !== 'virtual' && city.toLowerCase() !== 'multiple') uniqueCities.add(city);
    });
  });
  
  els.programCount.textContent = programs.length;
  updateFavoritesCount();
}

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
  localStorage.setItem('comparison', JSON.stringify(Array.from(comparisonSet)));
  updateComparisonCount();
}

function toggleComparison(programId) {
  if (comparisonSet.has(programId)) {
    comparisonSet.delete(programId);
    showToast('Removed from comparison', 'success');
  } else {
    if (comparisonSet.size >= 3) {
      showToast('Maximum 3 programs can be compared', 'error');
      return;
    }
    comparisonSet.add(programId);
    showToast('Added to comparison', 'success');
  }
  saveComparison();
  render();
  
  // Update comparison view if modal is open
  if (els.comparisonModal && els.comparisonModal.getAttribute('aria-hidden') === 'false') {
    renderComparison();
  }
}

function isInComparison(programId) {
  return comparisonSet.has(programId);
}

function renderComparison() {
  if (comparisonSet.size === 0) {
    els.comparisonList.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">No programs selected for comparison. Check the "Compare" box on program cards to add them.</p>';
    return;
  }
  
  const comparisonPrograms = Array.from(comparisonSet).map(id => {
    return programDataMap.get(id);
  }).filter(p => p !== undefined);
  
  if (comparisonPrograms.length === 0) {
    els.comparisonList.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 40px 20px;">Selected programs not found.</p>';
    return;
  }
  
  // Create comparison table
  const fields = [
    { label: 'Program Name', getValue: (p) => safeStr(p.program_name), isHtml: false },
    { label: 'Organization', getValue: (p) => safeStr(p.organization), isHtml: false },
    { label: 'Level of Care', getValue: (p) => safeStr(p.level_of_care), isHtml: false },
    { label: 'Location', getValue: (p) => locLabel(p), isHtml: false },
    { label: 'Ages Served', getValue: (p) => safeStr(p.ages_served), isHtml: false },
    { label: 'Service Setting', getValue: (p) => safeStr(p.service_setting), isHtml: false },
    { label: 'Phone', getValue: (p) => {
      const phone = safeStr(p.phone);
      if (!phone) return '—';
      const tel = normalizePhoneForTel(phone);
      return tel ? `<a href="tel:${escapeHtml(tel)}" class="comparison-link">${escapeHtml(phone)}</a>` : escapeHtml(phone);
    }, isHtml: true },
    { label: 'Website', getValue: (p) => {
      const url = safeUrl(p.website_url || p.website || '');
      if (!url) return '—';
      const domain = domainFromUrl(url) || url;
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="comparison-link">${escapeHtml(domain)} <span aria-hidden="true">↗</span></a>`;
    }, isHtml: true },
    { label: 'Insurance', getValue: (p) => {
      const ins = p.accepted_insurance || {};
      const types = Array.isArray(ins.types) ? ins.types : [];
      const plans = Array.isArray(ins.plans) ? ins.plans : [];
      if (types.length > 0 || plans.length > 0) {
        const allItems = [...types, ...plans];
        if (allItems.length === 0) {
          return escapeHtml(safeStr(p.insurance_notes) || 'Unknown');
        }
        // Display all insurance items in a formatted list
        const itemsHtml = allItems.map(item => {
          const cleanItem = safeStr(item).trim();
          return cleanItem ? `<div class="comparison-insurance-item">${escapeHtml(cleanItem)}</div>` : '';
        }).filter(Boolean).join('');
        return `<div class="comparison-insurance-list">${itemsHtml}</div>`;
      }
      return escapeHtml(safeStr(p.insurance_notes) || 'Unknown');
    }, isHtml: true },
    { label: 'Accepting New Patients', getValue: (p) => safeStr(p.accepting_new_patients), isHtml: false },
    { label: 'Notes', getValue: (p) => safeStr(p.notes) || '—', isHtml: false }
  ];
  
  let html = '<div class="comparison-table-wrapper"><table class="comparison-table"><thead><tr><th class="comparison-label-header">Field</th>';
  comparisonPrograms.forEach((p) => {
    // Find the program ID from the comparisonSet
    const programId = Array.from(comparisonSet).find(id => programDataMap.get(id) === p);
    html += `<th class="comparison-program-header"><div class="comparison-header"><button type="button" class="remove-compare" data-remove="${escapeHtml(programId)}" aria-label="Remove from comparison">×</button><div class="comparison-header-content"><strong>${escapeHtml(safeStr(p.program_name))}</strong><br><span class="comparison-org">${escapeHtml(safeStr(p.organization))}</span></div></div></th>`;
  });
  html += '</tr></thead><tbody>';
  
  fields.forEach(field => {
    html += '<tr><td class="comparison-label">' + escapeHtml(field.label) + '</td>';
    comparisonPrograms.forEach(p => {
      const value = field.getValue(p);
      html += '<td class="comparison-value">' + (field.isHtml ? value : escapeHtml(value)) + '</td>';
    });
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  els.comparisonList.innerHTML = html;
  
  // Add remove handlers
  els.comparisonList.querySelectorAll('.remove-compare').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.remove;
      toggleComparison(id);
      renderComparison();
    });
  });
}

async function saveFavorites() {
  await saveEncryptedData('favorites', Array.from(favorites));
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
    showToast('Removed from saved programs', 'success');
  } else {
    favorites.add(sanitizedId);
    showToast('Saved to your programs', 'success');
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
  await saveEncryptedData('programNotes', programNotes);
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
    await saveEncryptedData('programTags', programTags);
  }
}

async function removeProgramTag(programId, tag) {
  if (programTags[programId]) {
    programTags[programId] = programTags[programId].filter(t => t !== tag);
    if (programTags[programId].length === 0) {
      delete programTags[programId];
    }
    await saveEncryptedData('programTags', programTags);
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
    await saveEncryptedData('customLists', customLists);
    return sanitizedName;
  }
  return null;
}

async function addToCustomList(listName, programId) {
  if (customLists[listName] && !customLists[listName].includes(programId)) {
    customLists[listName].push(programId);
    await saveEncryptedData('customLists', customLists);
  }
}

async function removeFromCustomList(listName, programId) {
  if (customLists[listName]) {
    customLists[listName] = customLists[listName].filter(id => id !== programId);
    await saveEncryptedData('customLists', customLists);
  }
}

function isInCustomList(listName, programId) {
  return customLists[listName] && customLists[listName].includes(programId);
}

function showToast(message, type = 'success') {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = `toast ${type} show`;
  setTimeout(() => {
    els.toast.classList.remove('show');
  }, type === 'error' ? 5000 : 3000);
}

// Make showToast globally available for security.js
window.showToast = showToast;

function showModal(modalEl) {
  modalEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function hideModal(modalEl) {
  modalEl.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function sortPrograms(list) {
  const sorted = [...list];
  
  switch(currentSort) {
    case 'name':
      sorted.sort((a, b) => {
        const nameA = safeStr(a.program_name || a.organization).toLowerCase();
        const nameB = safeStr(b.program_name || b.organization).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      break;
    case 'verified':
      sorted.sort((a, b) => {
        const dateA = a.last_verified ? new Date(a.last_verified) : new Date(0);
        const dateB = b.last_verified ? new Date(b.last_verified) : new Date(0);
        return dateB - dateA;
      });
      break;
    case 'location':
      sorted.sort((a, b) => {
        const locA = locLabel(a);
        const locB = locLabel(b);
        return locA.localeCompare(locB);
      });
      break;
    case 'distance':
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
      btn.addEventListener('click', () => hideModal(modal));
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal(modal);
    });
  }
  
  const body = document.getElementById('shareModalBody');
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  
  body.innerHTML = `
    <div style="text-align: center;">
      <p style="margin-bottom: 20px; color: var(--muted);">${escapeHtml(title)}</p>
      <div style="margin: 20px 0;">
        <img src="${qrCodeUrl}" alt="QR Code" style="border: 1px solid var(--stroke); border-radius: 8px; padding: 8px; background: white;" />
      </div>
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <input type="text" id="shareUrlInput" value="${escapeHtml(url)}" readonly style="flex: 1; padding: 10px; border: 1px solid var(--stroke); border-radius: 8px; font-size: 13px;" />
        <button type="button" class="btn-primary" onclick="copyShareUrl()" style="white-space: nowrap;">Copy Link</button>
      </div>
      ${navigator.share ? `
        <button type="button" class="btn-primary" onclick="nativeShare('${escapeHtml(url)}', '${escapeHtml(title)}')" style="width: 100%; margin-top: 12px;">
          Share via...
        </button>
      ` : ''}
    </div>
  `;
  
  showModal(modal);
}

function copyShareUrl() {
  const input = document.getElementById('shareUrlInput');
  if (input) {
    input.select();
    document.execCommand('copy');
    showToast('Link copied to clipboard', 'success');
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
  // Clear current filters
  els.q.value = "";
  // Clear dataset attributes
  delete els.q.dataset.exactMatch;
  delete els.q.dataset.matchType;
  els.loc.value = "";
  els.age.value = "";
  if (window.__ageDropdownSync) window.__ageDropdownSync();
  els.care.value = "";
  if (els.insurance) els.insurance.value = "";
  els.onlyVirtual.checked = false;
  els.showCrisis.checked = false;
  
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
  }
  
  syncTopToggles();
  render();
  updateURLState();
  
  const t = document.getElementById("treatmentSection");
  if (t) window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
}

// Make functions globally available for onclick handlers
window.copyShareUrl = copyShareUrl;
window.nativeShare = nativeShare;

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Link copied to clipboard', 'success');
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
    showToast('Link copied to clipboard', 'success');
  } catch (err) {
    showToast('Could not copy link', 'error');
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
  await saveEncryptedData('recentSearches', recentSearches);
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
  
  els.favoritesList.innerHTML = '<div class="grid"></div>';
  const grid = els.favoritesList.querySelector('.grid');
  
  favoritePrograms.forEach((p, idx) => {
    const card = createCard(p, idx);
    grid.appendChild(card);
  });
  
  // Setup event delegation for favorites grid
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
    showToast('No saved programs to export', 'error');
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
  
  toDisplay.forEach((p, idx) => {
    const realIdx = isCrisisList ? (idx + 10000) : idx;
    const card = createCard(p, realIdx);
    card.style.animationDelay = `${Math.min(idx, 18) * 18}ms`;
    els.treatmentGrid.appendChild(card);
  });
  
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
        renderProgressive(activeList);
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

  const filtered = programs.filter(p => matchesFilters(p));

  const treatment = filtered.filter(p => !isCrisis(p));
  const crisis = filtered.filter(p => isCrisis(p));

  let activeList = showCrisis ? crisis : treatment;
  const activeLabel = showCrisis ? "Crisis Resources" : "Treatment Programs";

  // Calculate relevance scores for all results
  const query = safeStr(els.q?.value || '').trim();
  if (query) {
    // Map programs with their relevance scores
    const scoredPrograms = activeList.map(p => ({
      program: p,
      score: calculateRelevanceScore(p, query)
    }));
    
    // Sort by relevance score (highest first) when sort is "relevance"
    if (currentSort === 'relevance') {
      scoredPrograms.sort((a, b) => b.score - a.score);
      activeList = scoredPrograms.map(sp => sp.program);
    } else {
      // For other sorts, apply the selected sort but relevance is still calculated
      activeList = sortPrograms(activeList);
    }
  } else {
    // No query - just apply normal sorting
    activeList = sortPrograms(activeList);
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
      activeList.forEach((p, idx) => {
        const realIdx = showCrisis ? (idx + 10000) : idx;
        const card = createCard(p, realIdx);
        card.style.animationDelay = `${Math.min(idx, 18) * 18}ms`;
        els.treatmentGrid.appendChild(card);
      });
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
        } else if (fuzzyMatch(q, programName, 0.6) && !seen.has(programName)) {
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
        } else if (fuzzyMatch(q, orgName, 0.6) && !seen.has(orgName)) {
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
    if (fuzzyMatch(q, city.toLowerCase(), 0.7) && !seen.has(city)) {
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
}

function bind(){
  const on = (el, ev, fn) => {
    if (!el) return;
    el.addEventListener(ev, fn);
  };

  let raf = null;
  function scheduleRender(){
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      openId = null;
      render();
      updateURLState(); // Update URL after rendering
    });
  }
  
  // Make scheduleRender accessible globally
  scheduleRenderFn = scheduleRender;

  // Debounced search with autocomplete
  let searchDebounce = null;
  let autocompleteDebounce = null;
  
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
      if (ready) {
        const suggestions = generateAutocompleteSuggestions(query);
        renderAutocomplete(suggestions);
      }
    }, 150);
    
    // Debounced search
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      addRecentSearch(query);
      scheduleRender();
    }, 300);
  });
  
  on(els.q, "change", () => {
    hideAutocomplete();
    addRecentSearch(els.q.value);
    scheduleRender();
  });
  
  // Keyboard navigation for autocomplete
  on(els.q, "keydown", (e) => {
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
      setSelectedSuggestion(nextIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = autocompleteSelectedIndex > 0 
        ? autocompleteSelectedIndex - 1 
        : autocompleteSuggestions.length - 1;
      setSelectedSuggestion(prevIndex);
    } else if (e.key === "Enter" && autocompleteSelectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(autocompleteSelectedIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      hideAutocomplete();
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
      hideAutocomplete();
    }
  });
  
  on(els.loc, "change", scheduleRender);
  on(els.age, "change", scheduleRender);
  on(els.care, "change", scheduleRender);
  if (els.insurance) {
    on(els.insurance, "change", scheduleRender);
  }
  
  // Sort functionality
  on(els.sortSelect, "change", (e) => {
    currentSort = e.target.value;
    // If switching to distance, always prompt for location (privacy-first: ask every time)
    if (currentSort === 'distance') {
      // Clear any previous location to ensure fresh consent
      userLocation = null;
      handleNearMeClick();
      // Reset sort if user cancels
      setTimeout(() => {
        if (!userLocation && els.sortSelect) {
          els.sortSelect.value = 'relevance';
          currentSort = 'relevance';
        }
      }, 100);
    }
    scheduleRender();
    updateURLState();
  });
  
  // Near Me button
  if (els.nearMeBtn) {
    on(els.nearMeBtn, "click", handleNearMeClick);
  }
  
  // Stop sharing location button (TDPSA compliance: right to opt-out)
  if (els.stopLocationBtn) {
    on(els.stopLocationBtn, "click", handleStopLocationSharing);
  }
  
  // Location consent modal handlers
  if (els.locationConsentAllow) {
    on(els.locationConsentAllow, "click", handleLocationConsentAllow);
  }
  if (els.locationConsentCancel) {
    on(els.locationConsentCancel, "click", handleLocationConsentCancel);
  }
  
  // Close location consent modal with close button
  if (els.locationConsentModal) {
    const closeBtn = els.locationConsentModal.querySelector('.modal-close');
    if (closeBtn) {
      on(closeBtn, "click", handleLocationConsentCancel);
    }
  }
  
  // Handle browser back/forward buttons
  window.addEventListener('popstate', (e) => {
    if (ready) {
      loadURLState();
      render();
    }
  });

  on(els.showCrisisTop, "change", () => {
    els.showCrisis.checked = els.showCrisisTop.checked;
    scheduleRender();
    syncTopToggles();
    const t = document.getElementById("treatmentSection");
    window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  });
  on(els.onlyVirtualTop, "change", () => { els.onlyVirtual.checked = els.onlyVirtualTop.checked; scheduleRender(); syncTopToggles(); });

  function resetFilters() {
    els.q.value = "";
    // Clear dataset attributes
    delete els.q.dataset.exactMatch;
    delete els.q.dataset.matchType;
    els.loc.value = "";
    els.age.value = "";
    if (window.__ageDropdownSync) window.__ageDropdownSync();
    els.care.value = "";
    if (els.insurance) els.insurance.value = "";
    els.onlyVirtual.checked = false;
    els.showCrisis.checked = false;
    openId = null;
    syncTopToggles();
    updateURLState();
    render();
  }
  
  on(els.reset, "click", resetFilters);
  if (els.resetTop) {
    on(els.resetTop, "click", resetFilters);
  }

  on(els.viewAll, "click", () => {
    els.q.value = "";
    // Clear dataset attributes
    delete els.q.dataset.exactMatch;
    delete els.q.dataset.matchType;
    els.loc.value = "";
    els.age.value = "";
    if (window.__ageDropdownSync) window.__ageDropdownSync();
    els.care.value = "";
    els.insurance.value = "";
    els.onlyVirtual.checked = false;
    els.showCrisis.checked = false;
    openId = null;
    syncTopToggles();
    render();
    const t = document.getElementById("treatmentSection");
    window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  });

  // Smart search
  on(els.smartSearchBtn, "click", () => {
    const query = els.q.value;
    const parsed = parseSmartSearch(query);
    
    if(parsed.loc) els.loc.value = parsed.loc;
    if(parsed.age) {
      els.age.value = parsed.age;
      if(window.__ageDropdownSync) window.__ageDropdownSync();
    }
    if(parsed.care) els.care.value = parsed.care;
    els.showCrisis.checked = parsed.showCrisis;
    
    syncTopToggles();
    render();
    
    const t = document.getElementById("treatmentSection");
    window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  });

  // Advanced filters toggle
  on(els.showAdvanced, "click", () => {
    const isHidden = els.advancedFilters.style.display === "none";
    els.advancedFilters.style.display = isHidden ? "block" : "none";
    const lastSpan = els.showAdvanced.querySelector('span:last-child');
    if (lastSpan) {
      lastSpan.textContent = isHidden ? "Hide Filters" : "Advanced Filters";
    }
  });

  // Triage buttons
  on(els.viewCrisisResources, "click", () => {
    els.showCrisis.checked = true;
    syncTopToggles();
    render();
    const t = document.getElementById("treatmentSection");
    window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  });

  on(els.viewTreatmentOptions, "click", () => {
    els.showCrisis.checked = false;
    syncTopToggles();
    render();
    const t = document.getElementById("treatmentSection");
    window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  });

  document.addEventListener("keydown", (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      // Allow Escape to work in inputs
      if (e.key === "Escape") {
        if (autocompleteVisible) {
          hideAutocomplete();
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
        showModal(els.helpModal);
      }
    } else if (e.key === "Escape") {
      // Close expanded cards
      if (openId) {
      const cur = document.querySelector(`.card[data-id="${CSS.escape(openId)}"]`);
      if (cur) setCardOpen(cur, false);
      openId = null;
    }
      // Close modals
      if (els.favoritesModal && els.favoritesModal.getAttribute('aria-hidden') === 'false') {
        hideModal(els.favoritesModal);
      }
      if (els.historyModal && els.historyModal.getAttribute('aria-hidden') === 'false') {
        hideModal(els.historyModal);
      }
      if (els.comparisonModal && els.comparisonModal.getAttribute('aria-hidden') === 'false') {
        hideModal(els.comparisonModal);
      }
      if (els.helpModal && els.helpModal.getAttribute('aria-hidden') === 'false') {
        hideModal(els.helpModal);
      }
      if (els.locationConsentModal && els.locationConsentModal.getAttribute('aria-hidden') === 'false') {
        handleLocationConsentCancel();
      }
    }
  });

  // Favorites modal
  on(els.viewFavorites, "click", () => {
    renderFavorites();
    showModal(els.favoritesModal);
  });
  
  // Export/print favorites
  const exportFavoritesBtn = document.getElementById('exportFavorites');
  if (exportFavoritesBtn) {
    on(exportFavoritesBtn, "click", exportFavorites);
  }

  // Call history modal
  on(els.viewHistory, "click", () => {
    renderCallHistory();
    showModal(els.historyModal);
  });

  // Comparison modal
  on(els.viewComparison, "click", () => {
    renderComparison();
    showModal(els.comparisonModal);
  });
  
  // Share filters
  if (els.shareFilters) {
    on(els.shareFilters, "click", () => {
      shareCurrentFilters();
    });
  }
  
  // Filter presets
  document.querySelectorAll('.filter-preset-btn').forEach(btn => {
    on(btn, "click", () => {
      const preset = btn.dataset.preset;
      applyFilterPreset(preset);
    });
  });

  // Modal close buttons
  els.favoritesModal.querySelectorAll('.modal-close').forEach(btn => {
    on(btn, "click", () => hideModal(els.favoritesModal));
  });
  els.historyModal.querySelectorAll('.modal-close').forEach(btn => {
    on(btn, "click", () => hideModal(els.historyModal));
  });
  els.comparisonModal.querySelectorAll('.modal-close').forEach(btn => {
    on(btn, "click", () => hideModal(els.comparisonModal));
  });
  
  // Clear comparison
  const clearComparisonBtn = document.getElementById('clearComparison');
  if (clearComparisonBtn) {
    on(clearComparisonBtn, "click", () => {
      comparisonSet.clear();
      saveComparison();
      renderComparison();
      render();
    });
  }

  // Close modals when clicking outside
  on(els.favoritesModal, "click", (e) => {
    if (e.target === els.favoritesModal) hideModal(els.favoritesModal);
  });
  on(els.historyModal, "click", (e) => {
    if (e.target === els.historyModal) hideModal(els.historyModal);
  });
  on(els.comparisonModal, "click", (e) => {
    if (e.target === els.comparisonModal) hideModal(els.comparisonModal);
  });
  
  // Help modal
  if (els.helpModal) {
    els.helpModal.querySelectorAll('.modal-close').forEach(btn => {
      on(btn, "click", () => hideModal(els.helpModal));
    });
    on(els.helpModal, "click", (e) => {
      if (e.target === els.helpModal) hideModal(els.helpModal);
    });
  }

  syncTopToggles();
  
  // Privacy controls
  setupPrivacyControls();
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
        renderComparison();
        render();
        
        showToast('All data cleared', 'success');
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
      
      showToast('Data exported', 'success');
    });
  }
  
  if (trackingToggle) {
    trackingToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        // Use sessionStorage instead of localStorage for sensitive data
        localStorage.setItem('disableTracking', 'true');
        showToast('Tracking disabled - data will clear when browser closes', 'success');
      } else {
        localStorage.removeItem('disableTracking');
        showToast('Tracking enabled', 'success');
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
  showModal(els.locationConsentModal);
}

function hideLocationConsent() {
  if (!els.locationConsentModal) return;
  hideModal(els.locationConsentModal);
}

async function handleNearMeClick() {
  // Always clear previous location to ensure fresh consent every time
  userLocation = null;
  
  // Always show consent modal first (privacy-first approach)
  if (!els.locationConsentModal) {
    showToast('Location feature not available', 'error');
    return;
  }
  showLocationConsent();
}

async function handleLocationConsentAllow() {
  hideLocationConsent();
  
  try {
    // Check if distance module is loaded
    if (typeof window.calculateProgramDistance !== 'function') {
      showToast('Distance calculation not available. Please refresh the page.', 'error');
      console.error('Distance module not loaded');
      return;
    }
    
    // Request location
    userLocation = await requestUserLocation();
    
    if (!userLocation) {
      showToast('Failed to get location', 'error');
      return;
    }
    
    // Set sort to distance
    currentSort = 'distance';
    if (els.sortSelect) {
      els.sortSelect.value = 'distance';
    }
    
    // Re-render with distance sorting
    if (typeof scheduleRenderFn === 'function') {
      scheduleRenderFn();
    } else {
      render();
    }
    
    // Update button visibility (show stop button, hide near me button)
    updateLocationButtonVisibility();
    
    showToast('Location found. Results sorted by distance.', 'success');
  } catch (error) {
    console.error('Location error:', error);
    showToast(error.message || 'Failed to get location', 'error');
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
  if (currentSort === 'distance') {
    currentSort = 'relevance';
    if (els.sortSelect) {
      els.sortSelect.value = 'relevance';
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
  showToast('Location sharing stopped. Your location has been cleared.', 'success');
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
  // Only run in dev environments (localhost, pages.dev, or 127.0.0.1)
  const isDev = typeof window !== 'undefined' && (
    window.location.hostname.includes('localhost') ||
    window.location.hostname.endsWith('.pages.dev') ||
    window.location.hostname.includes('127.0.0.1')
  );
  
  if (!isDev || didWarnDisplayGrid || !els.treatmentGrid) {
    return;
  }
  
  const computedDisplay = window.getComputedStyle(els.treatmentGrid).display;
  if (computedDisplay === 'grid') {
    didWarnDisplayGrid = true;
    console.warn(
      '⚠️ WARNING: treatmentGrid computed display is "grid" (expected "flex"). ' +
      'Inline style or CSS regression may break multi-column layout. ' +
      'The .grid class should use display:flex, not display:grid.'
    );
  }
}

async function loadPrograms(retryCount = 0){
  const maxRetries = 3;
  const retryDelay = 1000 * (retryCount + 1); // Exponential backoff
  
  els.loadWarn.classList.remove("show");
  els.loadWarn.textContent = "";
  renderSkeletons();

  try{
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    // Allow browser caching (with revalidation) for faster repeat visits.
    // "no-store" forces a full network fetch every time and defeats SW caching.
    const res = await fetch("programs.json", {
      cache: "no-cache",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if(!res.ok) {
      throw new Error(`Unable to load programs data (HTTP ${res.status}). Please try refreshing the page.`);
    }
    const jsonText = await res.text();
    
    // Parse JSON - use validation if available, but always allow fallback
    let data;
    try {
      // Try to parse directly first (most reliable)
      data = JSON.parse(jsonText);
      
      // Store metadata for display
      if (data.metadata) {
        programsMetadata = data.metadata;
      }
      
      // If validation is available, run it but don't block on failure
      if (typeof window.validateJSON === 'function') {
        const jsonValidation = window.validateJSON(jsonText);
        if (!jsonValidation.valid) {
          // Log warning but don't fail - validation might be too strict
          console.warn('JSON validation warning (non-blocking):', jsonValidation.error);
          if (typeof window.logSecurityEvent === 'function') {
            window.logSecurityEvent('json_validation_warning', { error: jsonValidation.error });
          }
          // Continue with parsed data anyway
        }
      }
    } catch (parseError) {
      if (typeof window.logSecurityEvent === 'function') {
        window.logSecurityEvent('json_parse_error', { error: parseError.message });
      }
      throw new Error(`Failed to parse programs.json: ${parseError.message}`);
    }
    if(!data || !Array.isArray(data.programs)) throw new Error("programs.json loaded but missing a top-level `programs` array.");
    
    // Comprehensive data validation
    if (typeof window.validateProgramsData === 'function') {
      const validationResults = window.validateProgramsData(data);
      
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
        console.warn(`Found ${validationResults.duplicates.length} potential duplicate program(s)`);
      }
    }
    
    // Legacy validation (keep for backward compatibility)
    if (typeof window.validateProgramStructure === 'function') {
      const invalidPrograms = [];
      data.programs.forEach((p, idx) => {
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
    
    let loadedPrograms = data.programs.map(p => {
      // Normalize locations and migrate lat/lng to geo structure
      const normalizedLocations = Array.isArray(p.locations) ? p.locations.map(loc => {
        const normalized = {
          ...loc,
          city: loc.city ? normalizeCity(loc.city) : loc.city
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
      
      // Determine service_domains based on SUD tags or default to mental_health
      let service_domains = p.service_domains;
      if (!service_domains || !Array.isArray(service_domains) || service_domains.length === 0) {
        // Check for SUD indicators in existing fields
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
      phone: p.phone || "",
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
      // New statewide-ready fields (all optional)
      primary_county: p.primary_county || undefined,
      service_area: p.service_area || undefined,
      geo: p.geo || undefined, // Program-level geo (if different from location-level)
      verification: verification || undefined,
      service_domains: service_domains,
      sud_services: p.sud_services || undefined
      };
    });
    
    // Set programs first (before async geocoded data merge)
    programs = loadedPrograms;
    programDataMap.clear();
    programs.forEach(p => programDataMap.set(p.program_id, p));
    
    // Update available filters after programs are loaded
    availableFilters = computeAvailableFilters(programs);
    updateFilterVisibility();

    // Build autocomplete indexes to avoid O(n^2) behavior
    buildAutocompleteIndexes(programs);

    buildLocationOptions(programs);
    buildInsuranceOptions(programs);
    updateStats();
    updateComparisonCount();
    ready = true;
    openId = null;
    
    // Initialize button visibility (TDPSA: ensure opt-out is visible when needed)
    if (typeof updateLocationButtonVisibility === 'function') {
      updateLocationButtonVisibility();
    }
    
    // Display last updated date if available
    updateLastUpdatedDisplay();
    
    render();
    
    // Dev-only: Check for display regression after initial render
    checkTreatmentGridDisplayRegression();
    
    // Try to load and merge geocoded data (non-blocking, after initial render)
    loadGeocodedData().then(() => {
      if (geocodedPrograms && geocodedPrograms.size > 0) {
        programs = mergeGeocodedData(programs);
        programDataMap.clear();
        programs.forEach(p => programDataMap.set(p.program_id, p));
        // Rebuild autocomplete indexes after merge
        buildAutocompleteIndexes(programs);
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
    render();
  }
}

// Service Worker Registration
if('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silent fail - service worker is optional enhancement
    });
  });
}
// Handle call tracking via event delegation
document.addEventListener('click', (e) => {
  const callBtn = e.target.closest('[data-program-id]');
  if (callBtn && callBtn.href && callBtn.href.startsWith('tel:')) {
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
  if (currentSort && currentSort !== 'relevance') {
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
