/**
 * ViableMHR Phase 1 — Homepage UX (motion, guided search, care helper, filter tray)
 * Preserves existing filter/search IDs and scheduleRenderFn integration.
 */

(function () {
  'use strict';

  /** Maps guided program-type values to #care filter option values. */
  const GUIDED_CARE_TO_FILTER = {
    unsure: '',
    outpatient: 'Outpatient',
    iop: 'Intensive Outpatient (IOP)',
    php: 'Partial Hospitalization (PHP)',
    navigation: 'Navigation',
  };

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function smoothScrollTo(el, options = {}) {
    if (!el) return;
    const { block = 'center' } = options;
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block,
    });
  }

  function revealSearchSection(options = {}) {
    const { focusSearch = true, scrollTargetId = null } = options;
    const section = document.getElementById('searchSection');
    if (section) section.classList.add('is-revealed');
    const scrollEl = (scrollTargetId && document.getElementById(scrollTargetId)) || section;
    smoothScrollTo(scrollEl, { block: 'center' });
    const q = document.getElementById('q');
    if (focusSearch && q) {
      setTimeout(() => q.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 400);
    }
  }

  function updateGuidedStripVisibility(intent) {
    const strip = document.getElementById('guidedSearchStrip');
    if (!strip) return;
    const show = intent === 'guidance';
    strip.hidden = !show;
    strip.classList.toggle('is-visible', show);
  }

  function updateGuidedUnsureHint() {
    const hint = document.getElementById('guidedUnsureHint');
    const support = document.getElementById('guidedSupport');
    if (!hint || !support) return;
    const show = support.value === 'unsure' || !support.value;
    hint.hidden = !show;
    hint.classList.toggle('is-visible', show);
  }

  function updateGuidedStep() {
    const ids = [
      'guidedDanger',
      'guidedSafeTonight',
      'guidedWho',
      'guidedWhere',
      'guidedConcern',
      'guidedSupport',
    ];
    let completed = 0;
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'guidedDanger' && el.value === 'no') return;
      if (id === 'guidedSafeTonight' && el.value === 'yes') return;
      if (id === 'guidedSupport' && (el.value === 'unsure' || !el.value)) return;
      if (el.value) completed += 1;
    });
    document.body.dataset.guidedStep = String(completed);
  }

  function updateGuidedHelperOutput() {
    const output = document.getElementById('guidedHelperOutput');
    if (!output) return;

    const danger = document.getElementById('guidedDanger')?.value;
    const safe = document.getElementById('guidedSafeTonight')?.value;
    const setting = document.getElementById('guidedSupport')?.value;
    const format = document.getElementById('guidedWhere')?.value;
    const concern = document.getElementById('guidedConcern')?.value;

    let html = '';

    if (danger === 'yes') {
      html += '<div class="care-helper-crisis-box"><strong>Immediate physical danger:</strong> Call <strong>911</strong> now. This directory does not provide emergency services.</div>';
      output.innerHTML = html;
      output.classList.add('is-visible');
      return;
    }

    if (safe === 'no' || safe === 'unsure') {
      html += '<div class="care-helper-crisis-box"><strong>Safety concern tonight:</strong> Consider calling or texting <strong>988</strong> and seeking immediate professional support. Call <strong>911</strong> if there is immediate physical danger.</div>';
    }

    const hasSearchInput = (setting && setting !== 'unsure') || format || concern;
    if (!hasSearchInput) {
      output.innerHTML = html;
      output.classList.toggle('is-visible', html.length > 0);
      return;
    }

    const suggestions = [];
    const settingMap = {
      outpatient: 'outpatient (regular appointments)',
      iop: 'intensive outpatient (IOP)',
      php: 'partial hospitalization / day program (PHP)',
      navigation: 'care navigation',
    };

    if (setting && setting !== 'unsure' && settingMap[setting]) {
      suggestions.push(settingMap[setting]);
    } else if (setting === 'unsure' || !setting) {
      suggestions.push('outpatient, IOP, PHP, or other levels—programs can help determine fit');
    }

    const higherAcuityConcerns = ['substance use', 'eating disorder', 'behavior'];
    if (concern && higherAcuityConcerns.includes(concern)) {
      suggestions.push('programs experienced with higher-acuity concerns (confirm fit at intake)');
    }

    if (format === 'virtual') {
      suggestions.push('virtual or telehealth options');
    } else if (format === 'in-person') {
      suggestions.push('in-person programs near you');
    }

    const unique = [...new Set(suggestions)];
    html += `<h3>You may want to ask programs about</h3><p>${unique.map((s) => `• ${s}`).join('<br>')}</p>`;
    html += '<p>A trained professional can help determine fit during intake. Program structure varies—confirm details directly.</p>';

    output.innerHTML = html;
    output.classList.add('is-visible');
  }

  function setFlowIntent(intent, cardEl) {
    if (!intent) return;
    document.body.dataset.intent = intent;
    document.body.classList.add('flow-intent-chosen');

    document.querySelectorAll('.decision-card').forEach((card) => {
      const matches = card === cardEl || card.dataset.intent === intent;
      card.classList.toggle('is-selected', matches);
    });

    updateGuidedStripVisibility(intent);
    updateGuidedUnsureHint();
    updateGuidedStep();
    window.flowScroll?.updateFlowContextBar?.();
  }

  function scheduleRender() {
    if (typeof window.scheduleRenderFn === 'function') {
      window.scheduleRenderFn();
    } else if (typeof window.refreshEls === 'function') {
      window.refreshEls();
    }
  }

  function applyGuidedSearch() {
    if (typeof window.refreshEls === 'function') window.refreshEls();

    const who = document.getElementById('guidedWho');
    const where = document.getElementById('guidedWhere');
    const support = document.getElementById('guidedSupport');
    const concern = document.getElementById('guidedConcern');
    const age = document.getElementById('age');
    const care = document.getElementById('care');
    const onlyVirtual = document.getElementById('onlyVirtual');
    const onlyVirtualTop = document.getElementById('onlyVirtualTop');
    const q = document.getElementById('q');

    if (who && age) {
      const map = { child: '12', teen: '15', 'young-adult': '18' };
      if (map[who.value]) age.value = map[who.value];
    }

    if (support && care) {
      const filterValue = GUIDED_CARE_TO_FILTER[support.value] ?? '';
      care.value = filterValue;
    }

    if (where) {
      if (where.value === 'virtual') {
        if (onlyVirtual) onlyVirtual.checked = true;
        if (onlyVirtualTop) onlyVirtualTop.checked = true;
      } else if (where.value === 'in-person') {
        if (onlyVirtual) onlyVirtual.checked = false;
        if (onlyVirtualTop) onlyVirtualTop.checked = false;
      } else if (where.value === 'near-me') {
        const nearBtn = document.getElementById('nearMeBtn');
        if (nearBtn) nearBtn.click();
      }
    }

    if (concern && q && concern.value) {
      const existing = (q.value || '').trim();
      const phrase = concern.value;
      if (!existing.toLowerCase().includes(phrase.toLowerCase())) {
        q.value = existing ? `${existing} ${phrase}` : phrase;
      }
    }

    const danger = document.getElementById('guidedDanger');
    if (danger?.value === 'yes') {
      updateGuidedUnsureHint();
      updateGuidedHelperOutput();
      updateGuidedStep();
      return;
    }

    scheduleRender();
    updateGuidedUnsureHint();
    updateGuidedHelperOutput();
    updateGuidedStep();
  }

  function setupGuidedSearch() {
    [
      'guidedDanger',
      'guidedSafeTonight',
      'guidedWho',
      'guidedWhere',
      'guidedConcern',
      'guidedSupport',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', applyGuidedSearch);
    });
  }

  function setupHelpChooseInline() {
    const helpBtn = document.getElementById('heroHelpChoose');
    if (!helpBtn) return;

    helpBtn.addEventListener('click', () => {
      const card = helpBtn.closest('.decision-card');
      setFlowIntent('guidance', card || null);
      revealSearchSection({ focusSearch: false, scrollTargetId: 'guidedSearchStrip' });

      const delay = prefersReducedMotion() ? 0 : 420;
      window.setTimeout(() => {
        const first = document.getElementById('guidedDanger');
        if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
      }, delay);
    });
  }

  function setupDecisionCards() {
    setupHelpChooseInline();

    const useLoc = document.getElementById('searchUseLocationBtn');
    if (useLoc) {
      useLoc.addEventListener('click', () => {
        const nearBtn = document.getElementById('nearMeBtn');
        if (nearBtn) nearBtn.click();
        else {
          const modal = document.getElementById('locationConsentModal');
          if (modal && typeof window.showModal === 'function') window.showModal(modal);
        }
      });
    }
  }

  function setupCopyChecklist() {
    const btn = document.getElementById('copyCallChecklist');
    const list = document.getElementById('callChecklist');
    if (!btn || !list) return;

    btn.addEventListener('click', async () => {
      const text = [...list.querySelectorAll('li')]
        .map((li) => `• ${li.textContent.trim()}`)
        .join('\n');
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy checklist'; }, 2000);
      } catch (_) {
        btn.textContent = 'Copy not available';
      }
    });
  }

  let advancedFiltersHome = null;
  let advancedFiltersParent = null;

  function setupFilterTray() {
    const overlay = document.getElementById('filterTrayOverlay');
    const openBtn = document.getElementById('openFilterTray');
    const closeBtn = document.getElementById('closeFilterTray');
    const mount = document.getElementById('filterTrayMount');
    const advanced = document.getElementById('advancedFilters');
    if (!overlay || !openBtn || !advanced) return;

    advancedFiltersHome = advanced;
    advancedFiltersParent = advanced.parentElement;

    function isMobileTray() {
      return window.matchMedia('(max-width: 768px)').matches;
    }

    function openTray() {
      if (!isMobileTray()) {
        const showAdv = document.getElementById('showAdvanced');
        if (showAdv) showAdv.click();
        return;
      }
      if (mount && advanced.parentElement !== mount) {
        mount.appendChild(advanced);
      }
      advanced.classList.add('is-tray-open');
      advanced.style.display = 'block';
      overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add('is-open'));
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      closeBtn?.focus();
    }

    function closeTray() {
      overlay.classList.remove('is-open');
      openBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      setTimeout(() => {
        overlay.hidden = true;
        advanced.classList.remove('is-tray-open');
        if (advancedFiltersParent && advanced.parentElement !== advancedFiltersParent) {
          advancedFiltersParent.appendChild(advanced);
        }
        if (document.getElementById('showAdvanced')?.getAttribute('aria-expanded') !== 'true') {
          advanced.style.display = 'none';
        }
      }, prefersReducedMotion() ? 0 : 280);
    }

    openBtn.addEventListener('click', openTray);
    closeBtn?.addEventListener('click', closeTray);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeTray();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeTray();
    });
  }

  function observeResultsAnimation() {
    const grid = document.getElementById('treatmentGrid');
    if (!grid) return;

    const markUpdating = () => {
      if (prefersReducedMotion()) return;
      grid.classList.add('is-updating');
      window.setTimeout(() => grid.classList.remove('is-updating'), 450);
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList' && m.target === grid) {
          markUpdating();
          break;
        }
      }
    });
    observer.observe(grid, { childList: true });
  }

  function init() {
    setupGuidedSearch();
    setupDecisionCards();
    setupCopyChecklist();
    setupFilterTray();
    observeResultsAnimation();
    updateGuidedUnsureHint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.initPhase1Home = init;
  window.revealViableSearch = revealSearchSection;
  window.setFlowIntent = setFlowIntent;
})();
