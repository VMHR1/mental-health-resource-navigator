/**
 * Phase 4 — Scroll-linked space recovery (context bar + section reveals)
 */

const flowScroll = (function () {
  'use strict';

  const INTENT_LABELS = {
    crisis: 'Crisis support',
    treatment: 'Find programs',
    guidance: 'Help choosing care',
  };

  const REVEAL_SECTIONS = '.home-guide-cta, .specialized-below, .directory-explainer';

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function readDropdownFilters() {
    return {
      location: document.getElementById('loc')?.value || '',
      age: document.getElementById('age')?.value || '',
      care: document.getElementById('care')?.value || '',
      insurance: document.getElementById('insurance')?.value || '',
      onlyVirtual: document.getElementById('onlyVirtual')?.checked || false,
      showCrisis: document.getElementById('showCrisis')?.checked || false,
    };
  }

  function buildFilterSummary() {
    if (typeof window.getEffectiveSearchFilters !== 'function') return '';

    const query = document.getElementById('q')?.value || '';
    const { chips } = window.getEffectiveSearchFilters(query, readDropdownFilters(), {
      parseSmartSearch: window.parseSmartSearch,
      getTextSearchTerms: window.getTextSearchTerms,
    });

    if (!chips.length) return 'Browse all programs';

    const short = chips.map((chip) =>
      chip.label
        .replace(/^Location \(search\):\s*/i, '')
        .replace(/^(Location|Care|Insurance|Age|Search|Focus|Plan):\s*/i, '')
    );

    const maxShown = 2;
    const head = short.slice(0, maxShown).join(' · ');
    const extra = short.length - maxShown;
    return extra > 0 ? `${head} · +${extra} more` : head;
  }

  function updateFlowContextBar() {
    const bar = document.getElementById('flowContextBar');
    const intentEl = document.getElementById('flowContextIntent');
    const jumpBtn = document.getElementById('flowContextJump');
    if (!bar || !intentEl) return;

    const intent = document.body.dataset.intent || '';
    const chosen = document.body.classList.contains('flow-intent-chosen');
    const visible = bar.classList.contains('is-visible');
    const intentLabel = INTENT_LABELS[intent] || 'Search programs';

    intentEl.textContent = intentLabel;

    if (jumpBtn) {
      const summary = buildFilterSummary();
      const detail =
        summary && summary !== 'Browse all programs' ? ` — ${summary}` : '';
      const label = `${intentLabel}${detail}. Return to search.`;
      jumpBtn.title = label;
      jumpBtn.setAttribute('aria-label', label);
    }

    bar.hidden = !(chosen && visible);
    bar.setAttribute('aria-hidden', bar.hidden ? 'true' : 'false');
  }

  function setupContextBarObserver() {
    const bar = document.getElementById('flowContextBar');
    const hero = document.querySelector('.hero-gateway');
    if (!bar || !hero) return;

    const jumpBtn = document.getElementById('flowContextJump');
    jumpBtn?.addEventListener('click', () => {
      const search = document.getElementById('searchSection');
      if (typeof window.revealViableSearch === 'function') {
        window.revealViableSearch({ focusSearch: true });
      } else if (search) {
        search.classList.add('is-revealed');
        search.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'center',
        });
        document.getElementById('q')?.focus({ preventScroll: true });
      }
    });

    const syncVisibility = (heroVisible) => {
      const chosen = document.body.classList.contains('flow-intent-chosen');
      const show = chosen && !heroVisible;
      bar.classList.toggle('is-visible', show);
      if (!show) bar.classList.remove('is-scroll-away');
      updateFlowContextBar();
    };

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      window.addEventListener(
        'scroll',
        () => {
          const rect = hero.getBoundingClientRect();
          syncVisibility(rect.bottom > 0);
        },
        { passive: true }
      );
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          syncVisibility(entry.isIntersecting);
        },
        { root: null, rootMargin: '-8px 0px 0px 0px', threshold: 0 }
      );

      observer.observe(hero);
    }

    let lastScrollY = window.scrollY;
    let scrollAwayRaf = null;
    window.addEventListener(
      'scroll',
      () => {
        if (scrollAwayRaf) return;
        scrollAwayRaf = requestAnimationFrame(() => {
          scrollAwayRaf = null;
          if (!bar.classList.contains('is-visible')) return;

          const y = window.scrollY;
          const delta = y - lastScrollY;
          if (delta > 10) {
            bar.classList.add('is-scroll-away');
          } else if (delta < -10) {
            bar.classList.remove('is-scroll-away');
          }
          lastScrollY = y;
        });
      },
      { passive: true }
    );
  }

  function setupSectionRevealObserver() {
    const sections = document.querySelectorAll(REVEAL_SECTIONS);
    if (!sections.length) return;

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      sections.forEach((el) => el.classList.add('is-inview'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-inview');
            observer.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );

    sections.forEach((el) => observer.observe(el));
  }

  function bindFilterSync() {
    const ids = ['q', 'loc', 'age', 'care', 'insurance', 'onlyVirtual', 'showCrisis', 'onlyVirtualTop', 'showCrisisTop'];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(evt, updateFlowContextBar);
    });
  }

  function init() {
    setupContextBarObserver();
    setupSectionRevealObserver();
    bindFilterSync();
    updateFlowContextBar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    updateFlowContextBar,
  };
})();

export { flowScroll };

// For classic-script (non-module) consumers not yet converted
if (typeof window !== 'undefined') {
  window.flowScroll = flowScroll;
}
