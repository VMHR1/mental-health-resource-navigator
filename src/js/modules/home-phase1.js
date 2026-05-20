/**
 * ViableMHR Phase 1 — Homepage UX (motion, guided search, care helper, filter tray)
 * Preserves existing filter/search IDs and scheduleRenderFn integration.
 */

(function () {
  'use strict';

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function smoothScrollTo(el) {
    if (!el) return;
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function revealSearchSection() {
    const section = document.getElementById('searchSection');
    if (section) section.classList.add('is-revealed');
    smoothScrollTo(section);
    const q = document.getElementById('q');
    if (q) setTimeout(() => q.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 400);
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

    if (support && care && support.value) {
      care.value = support.value;
    }

    if (where) {
      if (where.value === 'virtual') {
        if (onlyVirtual) onlyVirtual.checked = true;
        if (onlyVirtualTop) onlyVirtualTop.checked = true;
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

    scheduleRender();
  }

  function setupGuidedSearch() {
    ['guidedWho', 'guidedWhere', 'guidedSupport', 'guidedConcern'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', applyGuidedSearch);
    });
  }

  function setupCareHelperModal() {
    const modal = document.getElementById('careHelperModal');
    const helpBtn = document.getElementById('heroHelpChoose');
    const closeBtn = document.getElementById('careHelperModalClose');
    if (!modal) return;

    function closeCareHelperModal() {
      if (typeof window.hideModal === 'function') window.hideModal(modal);
    }

    function resetCareHelperOutput() {
      const output = document.getElementById('careHelperOutput');
      if (!output) return;
      output.innerHTML = '';
      output.classList.remove('is-visible');
    }

    function openCareHelperModal() {
      if (typeof window.showModal !== 'function') return;
      resetCareHelperOutput();
      window.showModal(modal);
      const delay = prefersReducedMotion() ? 0 : 400;
      window.setTimeout(() => {
        const first = document.getElementById('helperDanger');
        if (first && typeof first.focus === 'function') first.focus();
      }, delay);
    }

    if (helpBtn) {
      helpBtn.addEventListener('click', openCareHelperModal);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', closeCareHelperModal);
    }
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCareHelperModal();
    });

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape') return;
        if (modal.getAttribute('aria-hidden') !== 'false') return;
        e.preventDefault();
        e.stopPropagation();
        closeCareHelperModal();
      },
      true
    );
  }

  function setupDecisionCards() {
    setupCareHelperModal();

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

  function buildCareHelperOutput() {
    const danger = document.getElementById('helperDanger')?.value;
    const safe = document.getElementById('helperSafeTonight')?.value;
    const disruption = document.getElementById('helperDisruption')?.value;
    const setting = document.getElementById('helperSetting')?.value;
    const format = document.getElementById('helperFormat')?.value;
    const concerns = document.getElementById('helperConcerns')?.value;

    const output = document.getElementById('careHelperOutput');
    if (!output) return;

    let html = '';

    if (danger === 'yes') {
      html += `<div class="care-helper-crisis-box"><strong>Immediate physical danger:</strong> Call <strong>911</strong> now. This directory does not provide emergency services.</div>`;
      output.innerHTML = html;
      output.classList.add('is-visible');
      output.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'nearest',
      });
      return;
    }

    if (safe === 'no' || safe === 'unsure') {
      html += `<div class="care-helper-crisis-box"><strong>Safety concern tonight:</strong> Consider calling or texting <strong>988</strong> and seeking immediate professional support. Call <strong>911</strong> if there is immediate physical danger.</div>`;
    }

    const suggestions = [];
    const settingMap = {
      outpatient: 'outpatient (regular appointments)',
      iop: 'intensive outpatient (IOP)',
      php: 'partial hospitalization / day program (PHP)',
      inpatient: 'inpatient hospital-based stabilization',
      residential: 'residential (live-in) treatment',
      navigation: 'care navigation',
    };

    if (setting && settingMap[setting]) {
      suggestions.push(settingMap[setting]);
    } else if (disruption === 'yes') {
      suggestions.push('structured programs such as IOP or PHP');
      suggestions.push('whether hospital-based stabilization is needed');
    } else {
      suggestions.push('outpatient care');
      suggestions.push('whether a structured IOP or PHP may be worth discussing');
    }

    if (concerns === 'some') {
      suggestions.push('programs experienced with higher-acuity concerns (confirm fit at intake)');
    }

    if (format === 'virtual') {
      suggestions.push('virtual or telehealth options');
    } else if (format === 'in-person') {
      suggestions.push('in-person programs near you');
    }

    const unique = [...new Set(suggestions)];
    html += `<h3>You may want to ask programs about</h3><p>${unique.map((s) => `• ${s}`).join('<br>')}</p>`;
    html += `<p>A trained professional can help determine fit during intake. Program structure varies—confirm details directly.</p>`;

    output.innerHTML = html;
    output.classList.add('is-visible');
    output.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }

  function setupCareHelper() {
    const btn = document.getElementById('careHelperSubmit');
    if (btn) btn.addEventListener('click', buildCareHelperOutput);

    const danger = document.getElementById('helperDanger');
    if (danger) {
      danger.addEventListener('change', () => {
        if (danger.value === 'yes') {
          const output = document.getElementById('careHelperOutput');
          if (!output) return;
          output.innerHTML =
            '<div class="care-helper-crisis-box"><strong>Immediate physical danger:</strong> Call <strong>911</strong> now. This directory does not provide emergency services.</div>';
          output.classList.add('is-visible');
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
        if (!document.getElementById('showAdvanced')?.getAttribute('aria-expanded') === 'true') {
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
      window.setTimeout(() => grid.classList.remove('is-updating'), 400);
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
    setupCareHelper();
    setupCopyChecklist();
    setupFilterTray();
    observeResultsAnimation();

    document.getElementById('searchSection')?.classList.add('is-revealed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.initPhase1Home = init;
  window.revealViableSearch = revealSearchSection;
})();
