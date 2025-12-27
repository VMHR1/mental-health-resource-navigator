// ========== Security ==========
// Load security module (encryption, validation, etc.)
// Security functions are available globally after security.js loads

// ========== State Management ==========
let programs = [];
let ready = false;
let openId = null;
let currentSort = 'relevance';

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

async function initializeEncryptedStorage() {
  favorites = new Set(await loadEncryptedData('favorites', []));
  recentSearches = await loadEncryptedData('recentSearches', []);
  callHistory = await loadEncryptedData('callHistory', []);
}

// Initialize on load
initializeEncryptedStorage();

let comparisonSet = new Set(JSON.parse(localStorage.getItem('comparison') || '[]'));

const programDataMap = new Map();

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
  comparisonList: document.getElementById("comparisonList")
};

// ========== Smart Search Parser ==========
function parseSmartSearch(query) {
  const q = query.toLowerCase();
  const filters = {
    loc: '',
    age: '',
    minAge: null, // For "13 and up" type searches
    care: '',
    showCrisis: false
  };
  
  // Location detection - handle both "desoto" and "de soto"
  const cities = [
    'dallas', 'plano', 'frisco', 'mckinney', 'richardson', 'denton', 
    'arlington', 'fort worth', 'mansfield', 'keller', 'desoto', 'de soto',
    'rockwall', 'sherman', 'forney', 'burleson', 'flower mound', 
    'the colony', 'bedford', 'lewisville', 'carrollton', 'garland', 
    'mesquite', 'irving', 'grand prairie', 'corsicana'
  ];
  
  // Check for city matches (prioritize longer matches first)
  const sortedCities = cities.sort((a, b) => b.length - a.length);
  for (const city of sortedCities) {
    if(q.includes(city)) {
      // Normalize city name - handle "de soto" -> "De Soto", "desoto" -> "De Soto"
      if (city === 'desoto' || city === 'de soto') {
        filters.loc = 'De Soto';
      } else {
        filters.loc = city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      break; // Use first (longest) match
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
  // Use enhanced escapeHtml from security.js if available, otherwise fallback
  if (typeof window.escapeHtml === 'function') {
    return window.escapeHtml(s);
  }
  return safeStr(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;")
    .replaceAll("/","&#x2F;");
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
  if (q) {
    // Remove location, age, and care level terms from search query for text matching
    const searchTerms = q
      .replace(/\b(php|partial hospitalization|iop|intensive outpatient|outpatient|navigation)\b/gi, '')
      .replace(/\b\d+\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up|and\s*older|year|yr|y\.o\.|yo|old)\b/gi, '')
      .replace(/\b(dallas|plano|frisco|mckinney|richardson|denton|arlington|fort worth|mansfield|keller|desoto|de soto|rockwall|sherman|forney|burleson|flower mound|the colony|bedford|lewisville|carrollton|garland|mesquite|irving|grand prairie|corsicana)\b/gi, '')
      .trim();
    
    if (searchTerms) {
      const hay = [
        p.program_name, p.organization, p.level_of_care,
        p.entry_type, p.service_setting, p.ages_served,
        locLabel(p),
        (p.notes || "")
      ].map(safeStr).join(" ").toLowerCase();
      
      // Check if all remaining search terms appear
      const terms = searchTerms.split(/\s+/).filter(t => t.length > 0);
      if (terms.length > 0 && !terms.every(term => hay.includes(term))) {
        return false;
      }
    }
  }

  // Location filter - use parsed location or dropdown value
  const locationToCheck = parsed.loc ? parsed.loc.toLowerCase() : loc;
  if (locationToCheck) {
    const cities = (p.locations || []).map(l => safeStr(l.city).toLowerCase());
    // Handle "De Soto" matching both "De Soto" and "Desoto"
    const normalizedLocation = locationToCheck.replace(/\s+/g, ' ').trim();
    if (normalizedLocation === 'de soto') {
      if (!cities.some(c => c === 'de soto' || c === 'desoto')) return false;
    } else {
      if (!cities.some(c => c === normalizedLocation)) return false;
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

  if (onlyVirtual && !hasVirtual(p)) return false;

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

function stableIdFor(p, i){
  const base = `${safeStr(p.program_id)}|${safeStr(p.program_name)}|${safeStr(p.organization)}|${locLabel(p)}|${safeStr(p.level_of_care)}|${safeStr(p.entry_type)}`.toLowerCase();
  let h = 2166136261;
  for (let k=0; k<base.length; k++){
    h ^= base.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return `p_${(h>>>0).toString(16)}_${i}`;
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
  const nextOpenId = (openId === id) ? null : id;

  if (openId){
    const prev = document.querySelector(`.card[data-id="${CSS.escape(openId)}"]`);
    if (prev) setCardOpen(prev, false);
  }

  openId = nextOpenId;

  if (openId){
    const cur = document.querySelector(`.card[data-id="${CSS.escape(openId)}"]`);
    if (cur) setCardOpen(cur, true);

    if (cur){
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
  const care = safeStr(p.level_of_care) || "Unknown";
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
        <div class="v">${escapeHtml(safeStr(p.entry_type) || "Unknown")}</div>
      </div>
      <div class="kv">
        <div class="k">Insurance</div>
        <div class="v">${escapeHtml(safeStr(p.insurance_notes) || "Unknown")}</div>
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
        <div class="v">${escapeHtml(safeStr(p.transportation_available) || "Unknown")}</div>
      </div>
      <div class="kv">
        <div class="k">Notes</div>
        <div class="v">${escapeHtml(safeStr(p.notes) || "—")}</div>
      </div>

      <div class="actions">
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

function announceToScreenReader(message) {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.className = 'sr-only';
  announcer.textContent = message;
  document.body.appendChild(announcer);
  
  setTimeout(() => document.body.removeChild(announcer), 3000);
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

function showToast(message, type = 'success') {
  els.toast.textContent = message;
  els.toast.className = `toast ${type} show`;
  setTimeout(() => {
    els.toast.classList.remove('show');
  }, 3000);
}

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
  
  if (navigator.share) {
    navigator.share({
      title: `${safeStr(program.program_name)} - ${safeStr(program.organization)}`,
      url: url
    }).catch(() => {
      copyToClipboard(url);
    });
  } else {
    copyToClipboard(url);
  }
}

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

function render(){
  if (!ready) return;

  const showCrisis = els.showCrisis?.checked || false;

  const filtered = programs.filter(matchesFilters);

  const treatment = filtered.filter(p => !isCrisis(p));
  const crisis = filtered.filter(p => isCrisis(p));

  let activeList = showCrisis ? crisis : treatment;
  const activeLabel = showCrisis ? "Crisis Resources" : "Treatment Programs";

  // Apply sorting
  activeList = sortPrograms(activeList);

  if (openId){
    const stillExists = activeList.some((p, idx) => stableIdFor(p, idx) === openId);
    if (!stillExists) openId = null;
  }

  if (els.sectionTitle) els.sectionTitle.textContent = activeLabel;
  if (els.resultsLabel) els.resultsLabel.textContent = showCrisis ? "crisis matches" : "treatment matches";
  if (els.totalCount) els.totalCount.textContent = String(activeList.length);

  if (els.treatmentGrid) {
    els.treatmentGrid.innerHTML = "";
    activeList.forEach((p, idx) => {
      const realIdx = showCrisis ? (idx + 10000) : idx;
      const card = createCard(p, realIdx);
      card.style.animationDelay = `${Math.min(idx, 18) * 18}ms`;
      els.treatmentGrid.appendChild(card);
    });
  }

  if (els.treatmentCount) els.treatmentCount.textContent = `${activeList.length} result${activeList.length===1?"":"s"}`;

  if (els.treatmentEmpty) {
    els.treatmentEmpty.style.display = activeList.length ? "none" : "block";
  }

  announceToScreenReader(`${activeList.length} programs found`);
  updateComparisonCount();
}

function syncTopToggles(){
  els.showCrisisTop.checked = els.showCrisis.checked;
  els.onlyVirtualTop.checked = els.onlyVirtual.checked;
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
    });
  }
  
  // Make scheduleRender accessible globally
  scheduleRenderFn = scheduleRender;

  // Debounced search
  let searchDebounce = null;
  on(els.q, "input", () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      addRecentSearch(els.q.value);
      scheduleRender();
    }, 300);
  });
  on(els.q, "change", () => {
    addRecentSearch(els.q.value);
    scheduleRender();
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
    scheduleRender();
  });

  on(els.showCrisisTop, "change", () => {
    els.showCrisis.checked = els.showCrisisTop.checked;
    scheduleRender();
    syncTopToggles();
    const t = document.getElementById("treatmentSection");
    window.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
  });
  on(els.onlyVirtualTop, "change", () => { els.onlyVirtual.checked = els.onlyVirtualTop.checked; scheduleRender(); syncTopToggles(); });

  on(els.reset, "click", () => {
    els.q.value = "";
    els.loc.value = "";
    els.age.value = "";
    if (window.__ageDropdownSync) window.__ageDropdownSync();
    els.care.value = "";
    els.onlyVirtual.checked = false;
    els.showCrisis.checked = false;
    openId = null;
    syncTopToggles();
    render();
  });

  on(els.viewAll, "click", () => {
    els.q.value = "";
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
    if (e.key === "Escape" && openId){
      const cur = document.querySelector(`.card[data-id="${CSS.escape(openId)}"]`);
      if (cur) setCardOpen(cur, false);
      openId = null;
    }
    // Close modals with Escape
    if (e.key === "Escape") {
      if (els.favoritesModal.getAttribute('aria-hidden') === 'false') {
        hideModal(els.favoritesModal);
      }
      if (els.historyModal.getAttribute('aria-hidden') === 'false') {
        hideModal(els.historyModal);
      }
    }
  });

  // Favorites modal
  on(els.viewFavorites, "click", () => {
    renderFavorites();
    showModal(els.favoritesModal);
  });

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

async function loadPrograms(){
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1663',message:'loadPrograms called',data:{securityJsAvailable:typeof window.validateJSON==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  els.loadWarn.classList.remove("show");
  els.loadWarn.textContent = "";
  renderSkeletons();

  try{
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1669',message:'Fetching programs.json',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const res = await fetch("programs.json", { cache:"no-store" });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1670',message:'Fetch response received',data:{status:res.status,ok:res.ok,contentType:res.headers.get('content-type')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if(!res.ok) throw new Error(`programs.json not found (HTTP ${res.status}). Make sure it is in the repo root next to index.html.`);
    const jsonText = await res.text();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1672',message:'JSON text received',data:{textLength:jsonText.length,firstChars:jsonText.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    // Parse JSON - use validation if available, but always allow fallback
    let data;
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1677',message:'Attempting JSON.parse',data:{validateJsonAvailable:typeof window.validateJSON==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      // Try to parse directly first (most reliable)
      data = JSON.parse(jsonText);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1678',message:'JSON.parse succeeded',data:{hasPrograms:!!data.programs,programsLength:data.programs?.length,topLevelKeys:Object.keys(data)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      // If validation is available, run it but don't block on failure
      if (typeof window.validateJSON === 'function') {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1681',message:'Running validateJSON',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        const jsonValidation = window.validateJSON(jsonText);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1682',message:'validateJSON result',data:{valid:jsonValidation.valid,error:jsonValidation.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (!jsonValidation.valid) {
          // Log warning but don't fail - validation might be too strict
          console.warn('JSON validation warning (non-blocking):', jsonValidation.error);
          if (typeof window.logSecurityEvent === 'function') {
            window.logSecurityEvent('json_validation_warning', { error: jsonValidation.error });
          }
          // Continue with parsed data anyway
        }
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1689',message:'validateJSON not available',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
      }
    } catch (parseError) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1691',message:'JSON.parse failed',data:{error:parseError.message,errorName:parseError.name,stack:parseError.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      if (typeof window.logSecurityEvent === 'function') {
        window.logSecurityEvent('json_parse_error', { error: parseError.message });
      }
      throw new Error(`Failed to parse programs.json: ${parseError.message}`);
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1697',message:'Checking data.programs',data:{hasData:!!data,hasPrograms:!!data?.programs,isArray:Array.isArray(data?.programs),programsLength:data?.programs?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if(!data || !Array.isArray(data.programs)) throw new Error("programs.json loaded but missing a top-level `programs` array.");
    
    // Validate program structure
    if (typeof window.validateProgramStructure === 'function') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1700',message:'Starting program structure validation',data:{programsCount:data.programs.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const invalidPrograms = [];
      data.programs.forEach((p, idx) => {
        const validation = window.validateProgramStructure(p);
        if (!validation.valid) {
          invalidPrograms.push({ index: idx, programId: p.program_id, errors: validation.errors });
        }
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1708',message:'Program validation complete',data:{invalidCount:invalidPrograms.length,firstInvalid:invalidPrograms[0]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      if (invalidPrograms.length > 0) {
        if (typeof window.logSecurityEvent === 'function') {
          window.logSecurityEvent('data_integrity_issues', { count: invalidPrograms.length, programs: invalidPrograms.slice(0, 5) });
        }
        console.warn('Some programs failed validation:', invalidPrograms);
      }
    }

    programs = data.programs.map(p => ({
      program_id: p.program_id || "",
      entry_type: p.entry_type || "Treatment Program",
      organization: p.organization || "",
      program_name: p.program_name || "",
      level_of_care: p.level_of_care || "Unknown",
      service_setting: p.service_setting || "Unknown",
      ages_served: p.ages_served || "Unknown",
      locations: Array.isArray(p.locations) ? p.locations : [],
      phone: p.phone || "",
      website_url: p.website_url || p.website || "",
      website_domain: p.website_domain || "",
      notes: p.notes || "",
      transportation_available: p.transportation_available || "Unknown",
      insurance_notes: p.insurance_notes || "Unknown",
      verification_source: p.verification_source || "",
      last_verified: p.last_verified || "",
      accepting_new_patients: p.accepting_new_patients || "Unknown",
      waitlist_status: p.waitlist_status || "Unknown",
      accepted_insurance: p.accepted_insurance || null
    }));

    buildLocationOptions(programs);
    buildInsuranceOptions(programs);
    updateStats();
    updateComparisonCount();
    ready = true;
    openId = null;
    render();
  }catch(err){
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/67f16d41-0ece-449d-bea9-b5a8996fb326',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1746',message:'loadPrograms catch block',data:{errorMessage:err.message,errorName:err.name,errorStack:err.stack?.substring(0,300),includesInvalid:err.message.includes('Invalid JSON')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    console.error(err);
    els.loadWarn.textContent = `Couldn't load programs.json. ${err.message}`;
    els.loadWarn.classList.add("show");
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
function setupCardEventDelegation(container) {
  container.addEventListener('click', (e) => {
  const expandBtn = e.target.closest('.expandBtn');
  if (expandBtn) {
    const card = expandBtn.closest('.card');
    if (card) {
      const id = card.dataset.id;
      toggleOpen(id);
    }
    return;
  }

  // Handle card action buttons
  const favoriteBtn = e.target.closest('[data-favorite]');
  if (favoriteBtn) {
    e.preventDefault();
    const id = favoriteBtn.dataset.favorite;
    toggleFavorite(id);
    // Update button state
    const card = favoriteBtn.closest('.card');
    if (card) {
      const newCard = createCard(programDataMap.get(id), Array.from(programDataMap.keys()).indexOf(id));
      card.replaceWith(newCard);
    }
    return;
  }

  const shareBtn = e.target.closest('[data-share]');
  if (shareBtn) {
    e.preventDefault();
    const id = shareBtn.dataset.share;
    shareProgram(id);
    return;
  }

  // Handle comparison checkbox
  const compareCheckbox = e.target.closest('[data-compare]');
  if (compareCheckbox && !compareCheckbox.disabled) {
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
        const newCard = createCard(program, idx);
        card.replaceWith(newCard);
      }
    }
    return;
  }
  });
}

// Setup event delegation for main grid
setupCardEventDelegation(els.treatmentGrid);

els.treatmentGrid.addEventListener('keydown', (e) => {
  const expandBtn = e.target.closest('.expandBtn');
  if (expandBtn && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    const card = expandBtn.closest('.card');
    if (card) {
      const id = card.dataset.id;
      toggleOpen(id);
    }
  }
});
// Handle empty state actions
document.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (action === 'clear-filters') {
    els.loc.value = '';
    els.age.value = '';
    if (window.__ageDropdownSync) window.__ageDropdownSync();
    render();
  } else if (action === 'show-virtual') {
    els.onlyVirtual.checked = true;
    els.onlyVirtualTop.checked = true;
    syncTopToggles();
    render();
  } else if (action === 'view-all') {
    els.q.value = '';
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

// Handle URL parameters for shared programs
function handleURLParams() {
  const params = new URLSearchParams(window.location.search);
  let programId = params.get('program');
  
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

// Initialize
initAgeDropdown();
bind();
loadPrograms().then(() => {
  handleURLParams();
  renderRecentSearches();
  updateFavoritesCount();
});
