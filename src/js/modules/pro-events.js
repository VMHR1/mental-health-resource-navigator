// ========== Professional layer events (Phase 8) ==========
// Privacy-preserving local rollup for professional layer interactions.
// No raw search queries, no identifiers, no server upload. Buckets only.

(function () {
  if (typeof window === 'undefined') return;

  const STORE_KEY = 'vmhr_pro_events_v1';
  const MAX_EVENTS = 250;

  // Allowed event names. Anything else is ignored.
  const ALLOWED = new Set([
    'pro_landing_view',
    'pro_audience_section_view',
    'board_open',
    'navigator_mode_on',
    'navigator_mode_off',
    'navigator_preset_used',
    'match_explainer_expand',
    'friction_flag_shown',
    'handoff_completeness_status',
    'handoff_export',
    'report_outdated_open',
    'report_outdated_submit',
    'regional_snapshot_download',
    'export_center_download',
    'navigator_cta_header',
    'navigator_cta_discharge',
    'board_link_discharge',
    'snapshot_open_bhops',
    'report_outdated_open_bhops',
    'boards_open_lmha',
    'snapshot_open_lmha',
    'boards_open_school',
    'submit_open_program',
    'report_outdated_open_program',
  ]);

  // Allow only enumerable, low-cardinality properties — no free-text.
  function sanitizeProps(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const out = {};
    Object.keys(raw).forEach((k) => {
      const v = raw[k];
      if (v == null) return;
      if (typeof v === 'boolean' || typeof v === 'number') {
        out[k] = v;
        return;
      }
      if (typeof v === 'string') {
        const s = v.slice(0, 64);
        if (/^[a-zA-Z0-9_\-:.|/]+$/.test(s)) {
          out[k] = s;
        }
        return;
      }
      if (Array.isArray(v)) {
        const arr = v
          .filter((item) => typeof item === 'string' && /^[a-zA-Z0-9_\-:.|/]+$/.test(item.slice(0, 32)))
          .slice(0, 10)
          .map((item) => item.slice(0, 32));
        if (arr.length) out[k] = arr;
      }
    });
    return out;
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { version: 1, events: [], updatedAt: null };
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        events: Array.isArray(parsed.events) ? parsed.events : [],
        updatedAt: parsed.updatedAt || null,
      };
    } catch (_) {
      return { version: 1, events: [], updatedAt: null };
    }
  }

  function saveStore(store) {
    try {
      store.updatedAt = new Date().toISOString();
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
      return true;
    } catch (_) {
      return false;
    }
  }

  function record(name, props) {
    if (typeof localStorage === 'undefined') return false;
    if (!ALLOWED.has(name)) return false;
    const store = loadStore();
    store.events.push({
      ts: new Date().toISOString(),
      name,
      props: sanitizeProps(props),
    });
    if (store.events.length > MAX_EVENTS) {
      store.events = store.events.slice(store.events.length - MAX_EVENTS);
    }
    return saveStore(store);
  }

  function summary() {
    const store = loadStore();
    const counts = {};
    store.events.forEach((e) => {
      counts[e.name] = (counts[e.name] || 0) + 1;
    });
    return {
      updatedAt: store.updatedAt,
      totalEvents: store.events.length,
      counts,
    };
  }

  function exportJson() {
    return JSON.stringify({ summary: summary(), store: loadStore() }, null, 2);
  }

  function clear() {
    try {
      localStorage.removeItem(STORE_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Wire data-pro-event attributes on links/buttons on document load.
  function bindDelegated() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-pro-event]');
      if (!target) return;
      const name = target.getAttribute('data-pro-event');
      if (!name) return;
      const propsAttr = target.getAttribute('data-pro-event-props');
      let props = {};
      if (propsAttr) {
        try {
          props = JSON.parse(propsAttr);
        } catch (_) {
          props = {};
        }
      }
      record(name, props);
    });
  }

  function init() {
    bindDelegated();
    // Track landing view once per page load on professionals/boards/etc.
    const path = (location.pathname || '').toLowerCase();
    if (path.endsWith('/professionals.html') || path === '/professionals' || path === '/') {
      if (path.endsWith('/professionals.html') || path === '/professionals') {
        record('pro_landing_view', {});
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.VMHRProEvents = { record, summary, exportJson, clear };
})();
