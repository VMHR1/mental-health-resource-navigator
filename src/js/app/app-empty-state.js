import { state, stateManager, syncStateToManager } from './state.js?v=1';
import { els, refreshEls, readSearchQuery } from './dom.js?v=1';
import { syncTopToggles, syncChipsToSelect } from './filter-sync.js?v=1';
import { updateURLState } from './url-state.js?v=1';

/**
 * Single source of truth for clearing every filter, toggle, and search state.
 * @param {{ updateUrl?: boolean, closeCards?: boolean }} options
 */
function clearAllFilters(options = {}) {
  const { updateUrl = true, closeCards = true } = options;
  refreshEls();

  const qEl = els.q || document.getElementById('q');
  if (qEl) {
    qEl.value = '';
    delete qEl.dataset.exactMatch;
    delete qEl.dataset.matchType;
  }
  if (els.loc) els.loc.value = '';
  if (els.age) {
    els.age.value = '';
  }
  if (els.care) els.care.value = '';
  if (els.insurance) els.insurance.value = '';
  if (els.onlyVirtual) els.onlyVirtual.checked = false;
  if (els.showCrisis) els.showCrisis.checked = false;
  if (els.onlyVirtualTop) els.onlyVirtualTop.checked = false;
  if (els.showCrisisTop) els.showCrisisTop.checked = false;

  if (els.serviceDomain) els.serviceDomain.value = '';
  state.selectedServiceDomains = [];
  if (els.sudServices) {
    Array.from(els.sudServices.options).forEach((opt) => {
      opt.selected = false;
    });
    if (typeof syncChipsToSelect === 'function') syncChipsToSelect('sudServices');
  }
  state.selectedSudServices = [];
  if (els.county) els.county.value = '';
  state.selectedCounty = null;
  if (els.verificationRecency) els.verificationRecency.value = '';
  state.verificationRecencyDays = null;

  if (stateManager) {
    stateManager.setState({
      selectedCounty: null,
      selectedServiceDomains: [],
      selectedSudServices: [],
      verificationRecencyDays: null,
      openId: closeCards ? null : state.openId,
    });
  }
  if (closeCards) {
    state.openId = null;
  }

  syncStateToManager();
  syncTopToggles();

  if (updateUrl && typeof updateURLState === 'function') {
    updateURLState();
  }
}

function getFilterContextForEmptyState() {
  const query = readSearchQuery();
  const parsed =
    typeof window.parseSmartSearch === 'function'
      ? window.parseSmartSearch(query)
      : {};
  const dropdowns = {
    location: els.loc?.value || '',
    age: els.age?.value || '',
    care: els.care?.value || '',
    insurance: els.insurance?.value || '',
    onlyVirtual: els.onlyVirtual?.checked || false,
    showCrisis: els.showCrisis?.checked || false,
  };
  let chips = [];
  if (typeof window.getEffectiveSearchFilters === 'function') {
    ({ chips } = window.getEffectiveSearchFilters(query, dropdowns, {
      parseSmartSearch: window.parseSmartSearch,
      getTextSearchTerms: window.getTextSearchTerms,
      safeStr,
    }));
  }

  const flags = window.FEATURE_FLAGS || {};
  const extras = {};
  if (flags.STATEWIDE_MODE && els.county?.value) {
    extras.county = `County: ${els.county.options[els.county.selectedIndex]?.text || els.county.value}`;
  }
  if (flags.SHOW_SUD_FILTERS && els.serviceDomain?.value) {
    const domainLabels = {
      mental_health: 'Mental Health',
      substance_use: 'Substance Use',
      co_occurring: 'Co-occurring',
      eating_disorders: 'Eating Disorders',
    };
    extras.serviceDomain = `Service Type: ${domainLabels[els.serviceDomain.value] || els.serviceDomain.value}`;
  }
  if (flags.SHOW_SUD_FILTERS && els.sudServices) {
    const selected = Array.from(els.sudServices.selectedOptions);
    if (selected.length > 0) {
      extras.sudServices = `Substance Use Services: ${selected.map((o) => o.text).join(', ')}`;
    }
  }
  if (flags.SHOW_VERIFICATION_FILTERS && els.verificationRecency?.value) {
    const recencyLabels = { 30: 'Last 30 days', 90: 'Last 90 days', 180: 'Last 180 days' };
    extras.verificationRecency = `Verified: ${recencyLabels[els.verificationRecency.value] || els.verificationRecency.value}`;
  }

  return { query, parsed, dropdowns, chips, extras };
}

function updateEmptyStateDisplay() {
  if (!els.treatmentEmpty) return;

  const titleEl = document.getElementById('emptyStateTitle');
  const bodyEl = document.getElementById('emptyStateBody');
  const tipEl = document.getElementById('emptyStateTip');
  const broadenBtn = els.treatmentEmpty.querySelector('[data-action="broaden-search"]');

  const { query, parsed, dropdowns, chips, extras } = getFilterContextForEmptyState();
  const copy =
    typeof window.getEmptyStateCopy === 'function'
      ? window.getEmptyStateCopy(chips, extras)
      : {
          title: 'No programs match these filters',
          body: 'Try one of the options below.',
          tip: 'Tip: Try a nearby city or remove age or location filters.',
          broadenLabel: 'Broaden search',
        };

  if (titleEl) titleEl.textContent = copy.title;
  if (bodyEl) bodyEl.textContent = copy.body;
  if (tipEl) tipEl.textContent = copy.tip;
  if (broadenBtn) broadenBtn.textContent = copy.broadenLabel;

  const removalPlan =
    typeof window.getBroadenSearchRemovalPlan === 'function'
      ? window.getBroadenSearchRemovalPlan({
          insuranceDropdown: dropdowns.insurance,
          parsedInsurance: parsed.insurance || '',
          careDropdown: dropdowns.care,
          parsedCare: parsed.care || '',
          locDropdown: dropdowns.location,
          parsedLoc: parsed.loc || (parsed.locs && parsed.locs.length ? parsed.locs.join(' ') : ''),
          ageDropdown: dropdowns.age,
          parsedAge: parsed.age || '',
          onlyVirtual: dropdowns.onlyVirtual,
          verificationRecency: els.verificationRecency?.value || '',
          sudSelected: els.sudServices && els.sudServices.selectedOptions.length > 0,
          serviceDomain: els.serviceDomain?.value || '',
          county: els.county?.value || '',
          query: query.trim(),
        })
      : null;

  if (broadenBtn) {
    broadenBtn.disabled = !removalPlan;
    broadenBtn.setAttribute('aria-disabled', removalPlan ? 'false' : 'true');
  }
}

/**
 * Remove the tightest active filter (insurance → care → location → age → …).
 * @returns {string|null} key removed
 */
function broadenSearchOneStep() {
  refreshEls();
  const { query, parsed, dropdowns } = getFilterContextForEmptyState();
  const plan =
    typeof window.getBroadenSearchRemovalPlan === 'function'
      ? window.getBroadenSearchRemovalPlan({
          insuranceDropdown: dropdowns.insurance,
          parsedInsurance: parsed.insurance || '',
          careDropdown: dropdowns.care,
          parsedCare: parsed.care || '',
          locDropdown: dropdowns.location,
          parsedLoc: parsed.loc || (parsed.locs && parsed.locs.length ? parsed.locs.join(' ') : ''),
          ageDropdown: dropdowns.age,
          parsedAge: parsed.age || '',
          onlyVirtual: dropdowns.onlyVirtual,
          verificationRecency: els.verificationRecency?.value || '',
          sudSelected: els.sudServices && els.sudServices.selectedOptions.length > 0,
          serviceDomain: els.serviceDomain?.value || '',
          county: els.county?.value || '',
          query: query.trim(),
        })
      : null;

  if (!plan) return null;

  const rebuild =
    typeof window.rebuildQueryFromParsed === 'function'
      ? window.rebuildQueryFromParsed
      : () => '';

  switch (plan.key) {
    case 'insurance':
      if (els.insurance) els.insurance.value = '';
      if (els.q) {
        const nextParsed = { ...parsed, insurance: '' };
        els.q.value = rebuild(nextParsed);
        delete els.q.dataset.exactMatch;
        delete els.q.dataset.matchType;
      }
      break;
    case 'care':
      if (els.care) els.care.value = '';
      if (els.q) {
        els.q.value = rebuild({ ...parsed, care: '' });
      }
      break;
    case 'location':
      if (els.loc) els.loc.value = '';
      if (els.q) {
        els.q.value = rebuild({ ...parsed, loc: '', locs: [] });
      }
      break;
    case 'age':
      if (els.age) {
        els.age.value = '';
      }
      if (els.q) {
        els.q.value = rebuild({ ...parsed, age: '', minAge: null });
      }
      break;
    case 'virtual':
      if (els.onlyVirtual) els.onlyVirtual.checked = false;
      break;
    case 'verificationRecency':
      if (els.verificationRecency) els.verificationRecency.value = '';
      state.verificationRecencyDays = null;
      if (stateManager) stateManager.setState({ verificationRecencyDays: null });
      syncStateToManager();
      break;
    case 'sudServices':
      if (els.sudServices) {
        Array.from(els.sudServices.options).forEach((opt) => {
          opt.selected = false;
        });
        state.selectedSudServices = [];
        if (typeof syncChipsToSelect === 'function') syncChipsToSelect('sudServices');
        if (stateManager) stateManager.setState({ selectedSudServices: [] });
        syncStateToManager();
      }
      break;
    case 'serviceDomain':
      if (els.serviceDomain) els.serviceDomain.value = '';
      state.selectedServiceDomains = [];
      if (stateManager) stateManager.setState({ selectedServiceDomains: [] });
      syncStateToManager();
      break;
    case 'county':
      if (els.county) els.county.value = '';
      state.selectedCounty = null;
      if (stateManager) stateManager.setState({ selectedCounty: null });
      syncStateToManager();
      break;
    case 'query':
      if (els.q) {
        els.q.value = '';
        delete els.q.dataset.exactMatch;
        delete els.q.dataset.matchType;
      }
      break;
    default:
      break;
  }

  syncTopToggles();
  updateURLState();
  return plan.key;
}

export { clearAllFilters, getFilterContextForEmptyState, updateEmptyStateDisplay, broadenSearchOneStep };
