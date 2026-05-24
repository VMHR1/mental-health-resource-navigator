/**
 * Phase 3 — Input-responsive motion (query chips, filter chip transitions, grid state)
 */

(function () {
  'use strict';

  const PRESS_MS = 150;
  const CHIP_EXIT_MS = 200;

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildQueryPreviewChips(query) {
    const q = (query || '').trim();
    if (!q || typeof window.parseSmartSearch !== 'function') return [];

    const parsed = window.parseSmartSearch(q);
    const chips = [];

    if (parsed.locs && parsed.locs.length > 1) {
      const label = parsed.locs
        .map((c) => (window.formatCityLabel ? window.formatCityLabel(c) : c))
        .join(' or ');
      chips.push({ key: 'location', label });
    } else if (parsed.loc) {
      chips.push({
        key: 'location',
        label: window.formatCityLabel ? window.formatCityLabel(parsed.loc) : parsed.loc,
      });
    }

    if (parsed.age) {
      chips.push({
        key: 'age',
        label: parsed.minAge != null ? `Age ${parsed.age}+` : `Age ${parsed.age}`,
      });
    }

    if (parsed.care) {
      chips.push({ key: 'care', label: parsed.care });
    }

    if (parsed.insurance) {
      const ins = parsed.insurance;
      if (ins.startsWith('plan:')) {
        chips.push({ key: 'insurance', label: ins.replace('plan:', '') });
      } else if (ins.startsWith('bucket:')) {
        const buckets = window.INSURANCE_BUCKETS || {};
        chips.push({ key: 'insurance', label: buckets[ins]?.label || ins.replace('bucket:', '') });
      } else {
        chips.push({ key: 'insurance', label: ins });
      }
    }

    if (parsed.serviceDomain) {
      const labels = { eating_disorders: 'Eating disorders', substance_use: 'Substance use' };
      chips.push({ key: 'focus', label: labels[parsed.serviceDomain] || parsed.serviceDomain });
    }

    if (parsed.showCrisis) {
      chips.push({ key: 'crisis', label: 'Crisis resources' });
    }

    if (typeof window.getTextSearchTerms === 'function') {
      const residual = window.getTextSearchTerms(q).trim();
      if (residual) {
        chips.push({
          key: 'text',
          label: residual.length > 36 ? `${residual.slice(0, 36)}…` : residual,
        });
      }
    }

    return chips;
  }

  function setSearchActive(active) {
    document.body.toggleAttribute('data-search-active', active);
    document.body.dataset.searchActive = active ? 'true' : 'false';
    const input = document.getElementById('q');
    if (input) input.classList.toggle('is-search-active', active);
  }

  function renderSearchQueryChips() {
    const container = document.getElementById('searchQueryChips');
    const input = document.getElementById('q');
    if (!container || !input) return;

    const query = input.value || '';
    const chips = buildQueryPreviewChips(query);
    const hasQuery = query.trim().length > 0;

    setSearchActive(hasQuery);

    if (chips.length === 0) {
      container.innerHTML = '';
      container.hidden = true;
      return;
    }

    container.hidden = false;
    container.innerHTML = chips
      .map(
        (chip, i) =>
          `<span class="search-query-chip" data-chip-key="${escapeHtml(chip.key)}" style="--chip-i: ${i}">${escapeHtml(chip.label)}</span>`
      )
      .join('');
  }

  function flashPress(el) {
    if (!el || prefersReducedMotion()) return;
    el.classList.add('is-pressed');
    window.setTimeout(() => el.classList.remove('is-pressed'), PRESS_MS);
  }

  function bindPressFeedback() {
    const selector =
      '.filter-preset-btn, .search-quick-start-btn, .search-example-chip, .toggle-chip, .btn-smart-search';

    document.addEventListener(
      'click',
      (e) => {
        const target = e.target.closest(selector);
        if (target) flashPress(target);
      },
      true
    );
  }

  function updateResultsStatusBadge() {
    const badge = document.getElementById('resultsStatusBadge');
    if (!badge) return;

    const showCrisis =
      document.getElementById('showCrisisTop')?.checked ||
      document.getElementById('showCrisis')?.checked;

    badge.hidden = !showCrisis;
    badge.classList.toggle('is-visible', !!showCrisis);
  }

  function setTreatmentGridState(resultCount) {
    const grid = document.getElementById('treatmentGrid');
    if (!grid) return;

    const ready = typeof window.getAppReady === 'function' ? window.getAppReady() : true;
    if (!ready) {
      grid.dataset.state = 'loading';
      return;
    }

    grid.dataset.state = resultCount > 0 ? 'results' : 'empty';
  }

  function flashResultsCount() {
    const el = document.getElementById('totalCount');
    if (!el || prefersReducedMotion()) return;

    el.classList.remove('is-count-updated');
    void el.offsetWidth;
    el.classList.add('is-count-updated');
    window.setTimeout(() => el.classList.remove('is-count-updated'), 320);
  }

  function animateNewFilterChips(chipsContainer) {
    if (!chipsContainer || prefersReducedMotion()) return;
    chipsContainer.querySelectorAll('.active-filter-chip').forEach((chip, i) => {
      chip.style.setProperty('--chip-i', String(i));
      chip.classList.add('is-entering');
      window.setTimeout(() => chip.classList.remove('is-entering'), 280);
    });
  }

  /**
   * Wrap active filter chip DOM rebuild with exit animation for removed chips.
   * @param {HTMLElement} chipsContainer
   * @param {Array<{type: string}>} activeFilters
   * @param {() => void} renderFn - rebuilds chip HTML and binds listeners
   */
  function updateActiveFilterChipsWithMotion(chipsContainer, activeFilters, renderFn) {
    if (!chipsContainer || typeof renderFn !== 'function') {
      renderFn?.();
      return;
    }

    const nextTypes = new Set(activeFilters.map((f) => f.type));
    const existingChips = [...chipsContainer.querySelectorAll('.active-filter-chip')];
    const removing = existingChips.filter((chip) => {
      const btn = chip.querySelector('.active-filter-chip-remove');
      const type = btn?.dataset.filterType;
      return type && !nextTypes.has(type);
    });

    const finish = () => {
      renderFn();
      animateNewFilterChips(chipsContainer);
    };

    if (removing.length === 0 || prefersReducedMotion()) {
      finish();
      return;
    }

    removing.forEach((chip) => chip.classList.add('is-exiting'));
    window.setTimeout(finish, CHIP_EXIT_MS);
  }

  function bindSearchInput() {
    const input = document.getElementById('q');
    if (!input) return;

    input.addEventListener('input', () => {
      renderSearchQueryChips();
    });

    renderSearchQueryChips();
  }

  function bindStatusToggles() {
    ['showCrisisTop', 'showCrisis', 'onlyVirtualTop', 'onlyVirtual'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', updateResultsStatusBadge);
    });
    updateResultsStatusBadge();
  }

  function init() {
    bindPressFeedback();
    bindSearchInput();
    bindStatusToggles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.flowMotion = {
    renderSearchQueryChips,
    updateResultsStatusBadge,
    setTreatmentGridState,
    flashResultsCount,
    updateActiveFilterChipsWithMotion,
  };
})();
