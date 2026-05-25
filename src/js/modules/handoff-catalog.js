// ========== Handoff catalog loader (slim) ==========
// Loads programs.json into window.programDataMap without the full search app stack.
// Used on handoff.html only — avoids events.js / bind() on missing search DOM.

(function () {
  if (typeof window === 'undefined') return;

  const programDataMap = new Map();
  window.programDataMap = programDataMap;

  async function loadHandoffCatalog() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch('programs.json', {
        cache: 'no-cache',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`programs.json HTTP ${res.status}`);
      }
      const text = await res.text();
      let data;
      if (typeof window.validateJSON === 'function') {
        const check = window.validateJSON(text);
        if (!check.valid) {
          console.warn('Handoff catalog: JSON validation warning', check.error);
        }
        data = check.data;
      } else {
        data = JSON.parse(text);
      }
      const programs = Array.isArray(data)
        ? data
        : (data && Array.isArray(data.programs) ? data.programs : []);
      programDataMap.clear();
      programs.forEach((p) => {
        if (p && p.program_id) programDataMap.set(p.program_id, p);
      });
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('vmhr:programs-ready', { detail: { count: programDataMap.size } })
        );
      }
      console.log('Handoff catalog loaded:', programDataMap.size, 'programs');
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('Handoff catalog load failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadHandoffCatalog, { once: true });
  } else {
    loadHandoffCatalog();
  }

  window.VMHRHandoffCatalog = { reload: loadHandoffCatalog };
})();
