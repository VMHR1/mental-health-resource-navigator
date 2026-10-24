import { state, URL_FILTER_PARAM_KEYS } from './state.js?v=1';
import { els, refreshEls } from './dom.js?v=1';
import { render } from './render-hook.js?v=1';
import { clearAllFilters } from './app-empty-state.js?v=1';
import { updateActiveFilterChips } from './filter-visibility.js?v=1';

function hasURLFilterParams() {
  const params = new URLSearchParams(window.location.search);
  return URL_FILTER_PARAM_KEYS.some((key) => params.has(key));
}

function isResultsUnlocked() {
  return state.resultsUnlocked;
}

function unlockResults() {
  if (state.resultsUnlocked) return;
  state.resultsUnlocked = true;
  updateResultsVisibility();
}

function lockResults() {
  if (!state.resultsUnlocked) return;
  state.resultsUnlocked = false;
  updateResultsVisibility();
}

function updateResultsVisibility() {
  document.body.classList.toggle('is-results-unlocked', state.resultsUnlocked);
  const awaiting = document.getElementById('resultsAwaiting');
  if (awaiting) awaiting.hidden = state.resultsUnlocked;
}

function getDirectoryProgramCount() {
  if (!state.ready || !state.programs.length) return null;
  return state.programs.filter((p) => !isCrisis(p)).length;
}

function updateResultsAwaitingCopy() {
  const title = document.getElementById('awaitingTitle');
  const lead = document.getElementById('awaitingLead');
  if (!title || !lead) return;

  const intent = document.body.dataset.intent || '';
  const copyByIntent = {
    treatment: {
      title: 'Search to see programs that fit',
      lead: 'Enter a city, care level, or age in the search box, then click Find Programs. Or use Browse all to see every listing.',
    },
    guidance: {
      title: 'Answer a few questions, then search',
      lead: 'Use the guided fields in search, then click Find Programs. Browse all shows the full directory without filters.',
    },
    crisis: {
      title: 'Search crisis resources when you are ready',
      lead: 'For immediate help, use 911 or 988 above. To browse crisis programs here, search and click Find Programs, or browse all.',
    },
  };

  const copy = copyByIntent[intent] || {
    title: 'Programs appear after you search',
    lead: 'Click Find Programs after you set filters, use Browse all for the full list, or pick a specialized program type below to see matches right away.',
  };

  title.textContent = copy.title;
  lead.textContent = copy.lead;
}

function updateResultsAwaitingPanel() {
  updateResultsAwaitingCopy();
  const countEl = document.getElementById('awaitingProgramCount');
  if (!countEl) return;

  if (!state.ready) {
    countEl.textContent = '…';
    return;
  }

  const count = getDirectoryProgramCount();
  countEl.textContent = count != null ? String(count) : '—';
}

function renderResultsLocked() {
  refreshEls();
  updateResultsAwaitingPanel();
  updateActiveFilterChips();

  if (els.treatmentGrid) {
    els.treatmentGrid.innerHTML = '';
    els.treatmentGrid.dataset.state = state.ready ? 'idle' : 'loading';
    els.treatmentGrid.style.display = '';
  }

  if (els.treatmentEmpty) {
    els.treatmentEmpty.style.display = 'none';
  }

  if (els.treatmentCount) {
    els.treatmentCount.textContent = '—';
  }

  const resultsIntro = document.getElementById('resultsIntro');
  if (resultsIntro) {
    resultsIntro.textContent = state.ready
      ? 'Search or browse all to see program matches.'
      : 'Loading programs…';
  }

  if (window.flowMotion) {
    window.flowMotion.setTreatmentGridState(0);
  }
}

function browseAllPrograms() {
  clearAllFilters({ updateUrl: true, closeCards: true });
  unlockResults();
  render();
  const grid = document.getElementById('treatmentGrid');
  if (grid) {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    grid.scrollIntoView({ behavior: motion, block: 'start' });
  }
}

export { hasURLFilterParams, isResultsUnlocked, unlockResults, lockResults, updateResultsVisibility, getDirectoryProgramCount, updateResultsAwaitingCopy, updateResultsAwaitingPanel, renderResultsLocked, browseAllPrograms };
