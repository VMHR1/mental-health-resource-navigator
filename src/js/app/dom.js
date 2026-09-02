// DOM element references and helpers extracted from app.js (Task 5.4).

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

/** Live DOM refs — re-query when disconnected (e.g. hot reload) so filters match visible inputs. */
function refreshEls() {
  const ids = [
    'q', 'loc', 'age', 'care', 'showCrisis', 'onlyVirtual', 'showCrisisTop', 'onlyVirtualTop',
    'reset', 'resetTop', 'viewAll', 'treatmentSection', 'treatmentGrid', 'treatmentCount',
    'totalCount', 'resultsLabel', 'sectionTitle', 'treatmentEmpty', 'loadWarn', 'smartSearchBtn',
    'showAdvanced', 'advancedFilters', 'viewCrisisResources', 'viewTreatmentOptions',
    'programCount', 'sortSelect', 'viewFavorites', 'viewHistory', 'favoritesCount',
    'favoritesModal', 'historyModal', 'favoritesList', 'historyList', 'insurance', 'county',
    'serviceDomain', 'sudServices', 'verificationRecency',
  ];
  ids.forEach((id) => {
    const live = document.getElementById(id);
    if (live) els[id] = live;
  });
}

function readSearchQuery() {
  refreshEls();
  const qEl = els.q || document.getElementById('q');
  return window.safeStr(qEl?.value || '').trim();
}

export { els, refreshEls, readSearchQuery };
