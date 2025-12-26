// ========== State Management ==========
let programs = [];
let ready = false;
let openId = null;

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
  programCount: document.getElementById("programCount")
};

// ========== Smart Search Parser ==========
function parseSmartSearch(query) {
  const q = query.toLowerCase();
  const filters = {
    loc: '',
    age: '',
    care: '',
    showCrisis: false
  };
  
  // Location detection
  const cities = ['dallas', 'plano', 'frisco', 'mckinney', 'richardson', 'denton', 'arlington', 'fort worth', 'mansfield', 'keller', 'desoto', 'rockwall', 'sherman', 'forney', 'burleson', 'flower mound', 'the colony', 'bedford'];
  cities.forEach(city => {
    if(q.includes(city)) {
      filters.loc = city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  });
  
  // Age detection
  const ageMatch = q.match(/\b(\d{1,2})\s*(?:year|yr|y\.o\.|yo)?\s*(?:old)?\b/);
  if(ageMatch) filters.age = ageMatch[1];
  
  // Level of care detection
  if(q.includes('php') || q.includes('partial')) filters.care = 'Partial Hospitalization (PHP)';
  if(q.includes('iop') || q.includes('intensive out')) filters.care = 'Intensive Outpatient (IOP)';
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
  return safeStr(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}


function safeUrl(u){
  const s = safeStr(u);
  if (!s) return "";
  try{
    const parsed = new URL(s, window.location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  }catch(_){}
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

function matchesFilters(p){
  const q = safeStr(els.q.value).toLowerCase();
  const loc = safeStr(els.loc.value).toLowerCase();
  const ageVal = safeStr(els.age.value);
  const care = safeStr(els.care.value).toLowerCase();
  const onlyVirtual = els.onlyVirtual.checked;

  const hay = [
    p.program_name, p.organization, p.level_of_care,
    p.entry_type, p.service_setting, p.ages_served,
    locLabel(p),
    (p.notes || "")
  ].map(safeStr).join(" ").toLowerCase();

  if (q && !hay.includes(q)) return false;

  if (loc){
    const cities = (p.locations || []).map(l => safeStr(l.city).toLowerCase());
    if (!cities.some(c => c === loc)) return false;
  }

  if (care){
    if (safeStr(p.level_of_care).toLowerCase() !== care) return false;
  }

  if (ageVal){
    const age = Number(ageVal);
    if (!Number.isFinite(age) || !programServesAge(p, age)) return false;
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
function trackCallAttempt(program) {
  const calls = JSON.parse(localStorage.getItem('callHistory') || '[]');
  calls.unshift({
    program: program.program_name,
    org: program.organization,
    timestamp: new Date().toISOString()
  });
  localStorage.setItem('callHistory', JSON.stringify(calls.slice(0, 20)));
  
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
        ${website ? `<a class="linkBtn site" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : ``}
        ${(!tel && !maps && !website) ? `<span style="color:var(--muted);font-size:13px;font-weight:700;">No quick actions available for this listing.</span>` : ``}
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
}

function render(){
  if (!ready) return;

  const showCrisis = els.showCrisis.checked;

  const filtered = programs.filter(matchesFilters);

  const treatment = filtered.filter(p => !isCrisis(p));
  const crisis = filtered.filter(p => isCrisis(p));

  const activeList = showCrisis ? crisis : treatment;
  const activeLabel = showCrisis ? "Crisis Resources" : "Treatment Programs";

  if (openId){
    const stillExists = activeList.some((p, idx) => stableIdFor(p, idx) === openId);
    if (!stillExists) openId = null;
  }

  els.sectionTitle.textContent = activeLabel;
  els.resultsLabel.textContent = showCrisis ? "crisis matches" : "treatment matches";
  els.totalCount.textContent = String(activeList.length);

  els.treatmentGrid.innerHTML = "";
  activeList.forEach((p, idx) => {
    const realIdx = showCrisis ? (idx + 10000) : idx;
    const card = createCard(p, realIdx);
    card.style.animationDelay = `${Math.min(idx, 18) * 18}ms`;
    els.treatmentGrid.appendChild(card);
  });

  els.treatmentCount.textContent = `${activeList.length} result${activeList.length===1?"":"s"}`;

  if (activeList.length){
    els.treatmentEmpty.style.display = "none";
  } else {
    els.treatmentEmpty.style.display = "block";
  }

  announceToScreenReader(`${activeList.length} programs found`);
}

function syncTopToggles(){
  els.showCrisisTop.checked = els.showCrisis.checked;
  els.onlyVirtualTop.checked = els.onlyVirtual.checked;
}

function bind(){
  const on = (el, ev, fn) => el.addEventListener(ev, fn);

  let raf = null;
  function scheduleRender(){
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      openId = null;
      render();
    });
  }

  ["input","change"].forEach(ev => {
    if (ev === "input") {
      let searchDebounce = null;
      on(els.q, ev, () => {
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          scheduleRender();
        }, 300);
      });
    } else {
      on(els.q, ev, scheduleRender);
    }
// Debounced search
  let searchDebounce = null;
  on(els.q, "input", () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(scheduleRender, 300);
  });
  on(els.q, "change", scheduleRender);
  
  on(els.loc, "change", scheduleRender);
  on(els.age, "change", scheduleRender);
  on(els.care, "change", scheduleRender);
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
    els.showAdvanced.querySelector('span:last-child').textContent = isHidden ? "Hide Filters" : "Advanced Filters";
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
  });

  syncTopToggles();
}

async function loadPrograms(){
  els.loadWarn.classList.remove("show");
  els.loadWarn.textContent = "";
  renderSkeletons();

  try{
    const res = await fetch("programs.json", { cache:"no-store" });
    if(!res.ok) throw new Error(`programs.json not found (HTTP ${res.status}). Make sure it is in the repo root next to index.html.`);
    const data = await res.json();
    if(!data || !Array.isArray(data.programs)) throw new Error("programs.json loaded but missing a top-level `programs` array.");

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
      waitlist_status: p.waitlist_status || "Unknown"
    }));

    buildLocationOptions(programs);
    updateStats();
    ready = true;
    openId = null;
    render();
  }catch(err){
    console.error(err);
    els.loadWarn.textContent = `Couldn't load programs.json. ${err.message}`;
    els.loadWarn.classList.add("show");
    ready = true;
    programs = [];
    buildLocationOptions(programs);
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
// Handle expand button clicks via event delegation
els.treatmentGrid.addEventListener('click', (e) => {
  const expandBtn = e.target.closest('.expandBtn');
  if (expandBtn) {
    const card = expandBtn.closest('.card');
    if (card) {
      const id = card.dataset.id;
      toggleOpen(id);
    }
  }
});

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
// Initialize
initAgeDropdown();
bind();
loadPrograms();
