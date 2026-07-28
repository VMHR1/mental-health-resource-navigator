// ========== Navigator Mode (Phase 8) ==========
// Adds a professional toolbar, transparent match explainers, and operational
// friction flags on top of the existing family search results.
// Does NOT modify search order or filter logic.

const VMHRNavigatorMode = (function () {
  if (typeof window === 'undefined') return undefined;

  const SESSION_KEY = 'vmhr_navigator_mode_v1';
  const MODE_ON_CLASS = 'navigator-mode-on';
  let cardObserver = null;

  function safe(x) {
    return (x == null ? '' : String(x)).trim();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function record(name, props) {
    if (window.VMHRProEvents && typeof window.VMHRProEvents.record === 'function') {
      window.VMHRProEvents.record(name, props || {});
    }
  }

  function isNavigatorRequested() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'navigator') return true;
    } catch (_) { /* ignore */ }
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1') {
        return true;
      }
    } catch (_) { /* ignore */ }
    return false;
  }

  function setSessionFlag(on) {
    try {
      if (on) {
        sessionStorage.setItem(SESSION_KEY, '1');
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch (_) { /* ignore */ }
  }

  function isOn() {
    return document.body.classList.contains(MODE_ON_CLASS);
  }

  function decorateCard(card) {
    if (!card || !card.classList || !card.classList.contains('card')) return;
    if (card.dataset.navigatorDecorated === 'true') return;
    const id = card.getAttribute('data-id');
    if (!id) return;

    const programDataMap = window.programDataMap || (window.__vmhr && window.__vmhr.programDataMap) || null;
    let program = null;
    if (programDataMap && typeof programDataMap.get === 'function') {
      program = programDataMap.get(id);
    }
    if (!program) return;

    const filters = window.VMHRMatchExplain && window.VMHRMatchExplain.readFilterSnapshot
      ? window.VMHRMatchExplain.readFilterSnapshot()
      : null;

    // Friction flags row — append after .card-summary or after .badgeRow
    if (window.VMHRFrictionFlags && typeof window.VMHRFrictionFlags.renderFlagBadgesHtml === 'function') {
      const html = window.VMHRFrictionFlags.renderFlagBadgesHtml(program, filters);
      if (html) {
        const host = card.querySelector('.card-summary') || card;
        const wrapper = document.createElement('div');
        wrapper.className = 'navigator-overlay navigator-overlay--friction';
        wrapper.innerHTML = html;
        host.appendChild(wrapper);
        // Record once per render
        const flagEls = wrapper.querySelectorAll('.friction-flag');
        const flagIds = Array.from(flagEls).map((el) => el.getAttribute('data-flag-id')).filter(Boolean);
        if (flagIds.length) {
          record('friction_flag_shown', { flag_ids: flagIds });
        }
      }
    }

    // Match explainer block — appended inside .card-summary (collapsible)
    if (window.VMHRMatchExplain && typeof window.VMHRMatchExplain.renderMatchExplainHtml === 'function') {
      const html = window.VMHRMatchExplain.renderMatchExplainHtml(program, filters);
      if (html) {
        const wrapper = document.createElement('details');
        wrapper.className = 'navigator-overlay navigator-overlay--match';
        wrapper.innerHTML = `<summary class="match-why__toggle">Why this result appears</summary>${html}`;
        wrapper.addEventListener('toggle', () => {
          if (wrapper.open) {
            record('match_explainer_expand', { program_id: id });
          }
        });
        const host = card.querySelector('.card-summary') || card;
        host.appendChild(wrapper);
      }
    }

    card.dataset.navigatorDecorated = 'true';
  }

  function decorateExistingCards() {
    document.querySelectorAll('.card[data-id]').forEach(decorateCard);
  }

  function clearDecorations() {
    document.querySelectorAll('.navigator-overlay').forEach((el) => el.remove());
    document.querySelectorAll('.card[data-navigator-decorated]').forEach((el) => {
      delete el.dataset.navigatorDecorated;
    });
  }

  function startObserver() {
    if (cardObserver) return;
    cardObserver = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes && m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.classList && node.classList.contains('card')) {
            decorateCard(node);
          } else {
            const inner = node.querySelectorAll ? node.querySelectorAll('.card[data-id]') : [];
            inner.forEach(decorateCard);
          }
        });
      });
    });
    const grid = document.getElementById('treatmentGrid');
    if (grid) cardObserver.observe(grid, { childList: true, subtree: false });
    const favorites = document.getElementById('favoritesList');
    if (favorites) cardObserver.observe(favorites, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (cardObserver) {
      cardObserver.disconnect();
      cardObserver = null;
    }
  }

  function buildToolbarHtml() {
    const presets = window.NAVIGATOR_PRESETS || {};
    const chips = Object.entries(presets).map(([id, p]) => {
      const label = escapeHtml(p.label || id);
      const desc = escapeHtml(p.description || '');
      return `<button type="button" class="nav-preset-chip" data-navigator-preset="${escapeHtml(id)}" title="${desc}">${label}</button>`;
    }).join('');

    return `
      <div class="navigator-toolbar" role="region" aria-label="Professional navigator tools">
        <div class="navigator-toolbar__row">
          <div class="navigator-toolbar__title">
            <strong>Navigator view</strong>
            <span class="navigator-toolbar__badge">Pro</span>
          </div>
          <div class="navigator-toolbar__actions">
            <a class="btnlike" href="boards.html">Boards</a>
            <a class="btnlike" href="report-outdated.html" id="navToolbarReport">Report outdated</a>
            <button type="button" class="btnlike" id="navOpenCompareHandoff" aria-label="Open compare panel and prepare handoff packet">Compare &amp; handoff</button>
            <button type="button" class="btnlike btn-ghost" id="navToolbarExit">Exit navigator</button>
          </div>
        </div>
        <p class="navigator-toolbar__note">Search order, filters, and ranking are identical to the family view. Navigator mode adds transparency and operational caveats only.</p>
        <div class="navigator-toolbar__presets" role="group" aria-label="Quick presets">
          <span class="navigator-toolbar__presets-label">Quick presets:</span>
          ${chips}
        </div>
      </div>
    `;
  }

  function mountToolbar() {
    if (document.getElementById('navigatorToolbar')) return;
    const container = document.querySelector('main') || document.querySelector('.container') || document.body;
    const anchor = document.getElementById('treatmentSection')
      || document.getElementById('searchSection')
      || container;
    const wrapper = document.createElement('div');
    wrapper.id = 'navigatorToolbar';
    wrapper.innerHTML = buildToolbarHtml();
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(wrapper, anchor);
    } else {
      container.insertBefore(wrapper, container.firstChild);
    }

    wrapper.addEventListener('click', (e) => {
      const presetBtn = e.target.closest('[data-navigator-preset]');
      if (presetBtn) {
        const presetId = presetBtn.getAttribute('data-navigator-preset');
        applyNavigatorPreset(presetId);
        return;
      }
      const exitBtn = e.target.closest('#navToolbarExit');
      if (exitBtn) {
        e.preventDefault();
        deactivate({ source: 'toolbar' });
      }
      const reportBtn = e.target.closest('#navToolbarReport');
      if (reportBtn) {
        record('report_outdated_open', { source: 'navigator_toolbar' });
      }
      const handoffBtn = e.target.closest('#navOpenCompareHandoff');
      if (handoffBtn) {
        e.preventDefault();
        openCompareModal();
      }
    });
  }

  function unmountToolbar() {
    const toolbar = document.getElementById('navigatorToolbar');
    if (toolbar) toolbar.remove();
  }

  function openCompareModal() {
    const modal = document.getElementById('comparisonModal');
    if (!modal) return;
    if (window.__vmhr && typeof window.__vmhr.renderComparison === 'function') {
      window.__vmhr.renderComparison();
    } else if (typeof window.renderComparison === 'function') {
      const programDataMap = window.programDataMap || (window.__vmhr && window.__vmhr.programDataMap);
      const comparisonSet = window.comparisonSet || (window.__vmhr && window.__vmhr.comparisonSet);
      window.renderComparison({
        els: { comparisonList: document.getElementById('comparisonList') },
        comparisonSet,
        programDataMap,
      });
    }
    if (typeof window.showModal === 'function') {
      window.showModal(modal);
    }
  }

  function applyNavigatorPreset(presetId) {
    const presets = window.NAVIGATOR_PRESETS || {};
    const preset = presets[presetId];
    if (!preset) return;
    record('navigator_preset_used', { preset_id: presetId });

    // Reuse the existing FILTER_PRESETS pipeline by stashing the config under a known key
    const filterPresets = window.FILTER_PRESETS || {};
    const slot = '_navigator_active';
    filterPresets[slot] = preset.config || {};
    window.FILTER_PRESETS = filterPresets;

    if (window.__vmhr && typeof window.__vmhr.applyFilterPreset === 'function') {
      window.__vmhr.applyFilterPreset(slot);
    } else if (typeof window.applyFilterPreset === 'function') {
      window.applyFilterPreset(slot);
    }
  }

  function applyPresetFromUrlIfAny() {
    let presetId = '';
    try {
      presetId = new URLSearchParams(window.location.search).get('preset') || '';
    } catch (_) { /* ignore */ }
    if (!presetId) return;
    // Prefer navigator presets, fall back to FILTER_PRESETS
    const navigatorPresets = window.NAVIGATOR_PRESETS || {};
    if (navigatorPresets[presetId]) {
      applyNavigatorPreset(presetId);
      return;
    }
    if (window.FILTER_PRESETS && window.FILTER_PRESETS[presetId]) {
      if (window.__vmhr && typeof window.__vmhr.applyFilterPreset === 'function') {
        window.__vmhr.applyFilterPreset(presetId);
      } else if (typeof window.applyFilterPreset === 'function') {
        window.applyFilterPreset(presetId);
      }
    }
  }

  function activate(options) {
    options = options || {};
    if (isOn()) return;
    document.body.classList.add(MODE_ON_CLASS);
    setSessionFlag(true);
    mountToolbar();
    startObserver();
    decorateExistingCards();
    record('navigator_mode_on', { source: options.source || 'unknown' });
  }

  function deactivate(options) {
    options = options || {};
    if (!isOn()) return;
    document.body.classList.remove(MODE_ON_CLASS);
    setSessionFlag(false);
    stopObserver();
    clearDecorations();
    unmountToolbar();
    record('navigator_mode_off', { source: options.source || 'unknown' });
    // Drop ?mode=navigator from URL on explicit exit so refresh reverts
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('mode')) {
        url.searchParams.delete('mode');
        history.replaceState({}, '', url.toString());
      }
    } catch (_) { /* ignore */ }
  }

  function refreshDecorations() {
    if (!isOn()) return;
    clearDecorations();
    decorateExistingCards();
  }

  async function startNavigatorIfAllowed() {
    if (!isNavigatorRequested()) return;
    const gate = window.VMHRProGate;
    if (gate && typeof gate.ensureAccess === 'function') {
      const ok = await gate.ensureAccess({ reason: 'navigator' });
      if (!ok) return;
    }
    activate({ source: 'url' });
    setTimeout(applyPresetFromUrlIfAny, 0);
  }

  function init() {
    // Only relevant on pages with a treatment grid
    if (!document.getElementById('treatmentGrid')) return;

    // Listen for filter / render events so decorations stay accurate.
    // Search re-renders create new cards; the observer catches those, but
    // we also need to refresh existing cards when filters change.
    const filterControls = ['q', 'loc', 'age', 'care', 'insurance', 'onlyVirtual', 'showCrisis', 'serviceDomain', 'verificationRecency'];
    filterControls.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        // Defer to next tick to let app's render finish
        setTimeout(refreshDecorations, 60);
      });
    });

    // After app render dispatches activity, refresh decorations.
    document.addEventListener('vmhr:rendered', refreshDecorations);

    startNavigatorIfAllowed();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  return {
    activate,
    deactivate,
    isOn,
    refresh: refreshDecorations,
    applyPreset: applyNavigatorPreset,
  };
})();

export { VMHRNavigatorMode };

// For classic-script (non-module) consumers not yet converted
if (typeof window !== 'undefined') {
  window.VMHRNavigatorMode = VMHRNavigatorMode;
}
