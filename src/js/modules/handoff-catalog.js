// ========== Handoff catalog loader (slim) ==========
// Loads programs.json into window.programDataMap without the full search app stack.
// Used on handoff.html only — avoids events.js / bind() on missing search DOM.

(function () {
  if (typeof window === 'undefined') return;

  const CATALOG_URL = '/programs.json';
  const programDataMap = new Map();
  window.programDataMap = programDataMap;

  let loadPromise = null;

  function parseProgramsPayload(text) {
    if (typeof window.validateJSON === 'function') {
      const check = window.validateJSON(text);
      if (check.valid && check.data) return check.data;
      if (!check.valid) {
        console.warn('Handoff catalog: JSON validation warning', check.error);
      }
    }
    return JSON.parse(text);
  }

  async function loadHandoffCatalog() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(CATALOG_URL, {
        cache: 'no-cache',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`programs.json HTTP ${res.status} (${res.url})`);
      }
      const text = await res.text();
      const data = parseProgramsPayload(text);
      const programs = Array.isArray(data)
        ? data
        : (data && Array.isArray(data.programs) ? data.programs : []);
      programDataMap.clear();
      programs.forEach((p) => {
        if (p && p.program_id) programDataMap.set(p.program_id, p);
      });
      if (programDataMap.size === 0) {
        throw new Error('programs.json loaded but contained no valid program records');
      }
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('vmhr:programs-ready', { detail: { count: programDataMap.size } })
        );
      }
      console.log('Handoff catalog loaded:', programDataMap.size, 'programs');
      return programDataMap.size;
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('Handoff catalog load failed:', err);
      throw err;
    }
  }

  function whenReady() {
    if (!loadPromise) {
      loadPromise = loadHandoffCatalog().catch((err) => {
        loadPromise = null;
        throw err;
      });
    }
    return loadPromise;
  }

  function reload() {
    loadPromise = null;
    return whenReady();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { whenReady(); }, { once: true });
  } else {
    whenReady();
  }

  window.VMHRHandoffCatalog = { reload, whenReady, getMap: () => programDataMap };
})();
