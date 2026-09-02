// ========== Professional section password gate (preview) ==========
// Lightweight client-side gate for professional pages and navigator mode.
// Not a security boundary — deters casual access only. Change password before public launch.

(function () {
  if (typeof window === 'undefined') return;

  const STORAGE_KEY = 'vmhr_pro_gate_v1';
  const CONFIG_PATHS = ['/pro_gate.json', 'pro_gate.json', 'data/pro_gate.json'];

  const PRO_PAGE_SLUGS = [
    'professionals',
    'boards',
    'report-outdated',
    'regional-snapshot',
    'changelog',
    'export',
    'handoff',  // Phase 9C: Discharge Handoff Builder
  ];

  let configCache = null;
  let overlayEl = null;
  /** @type {Promise<boolean>|null} Resolves when overlay unlock succeeds (or gate not needed). */
  let overlayPromise = null;

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

  function pathSlug() {
    try {
      const path = window.location.pathname || '';
      const base = path.split('/').pop() || '';
      return base.replace(/\.html$/i, '').toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function isProPage() {
    const slug = pathSlug();
    return PRO_PAGE_SLUGS.includes(slug);
  }

  function isNavigatorEntry() {
    try {
      return new URLSearchParams(window.location.search).get('mode') === 'navigator';
    } catch (_) {
      return false;
    }
  }

  function isUnlocked() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function setUnlocked(on) {
    try {
      if (on) sessionStorage.setItem(STORAGE_KEY, '1');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* ignore */ }
    if (on) {
      document.documentElement.classList.remove('pro-gate-locked');
      document.dispatchEvent(new CustomEvent('vmhr:pro-gate-unlock'));
    }
  }

  async function loadConfig() {
    if (configCache) return configCache;
    for (const path of CONFIG_PATHS) {
      try {
        const res = await fetch(path, { cache: 'no-cache' });
        if (!res.ok) continue;
        configCache = await res.json();
        return configCache;
      } catch (_) {
        /* try next path */
      }
    }
    // Fail closed on pro routes so a missing deploy cannot silently drop the gate
    configCache = requiresProtectionSync()
      ? { enabled: true, hint: 'Contact the site owner for preview access.' }
      : { enabled: false };
    return configCache;
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function verifyPassword(password, config) {
    const expected = safe(config && config.password_sha256).toLowerCase();
    if (!expected) return false;
    const actual = await sha256Hex(password);
    return actual === expected;
  }

  function requiresProtectionSync() {
    return isProPage() || isNavigatorEntry();
  }

  async function gateEnabled() {
    const config = await loadConfig();
    return !!(config && config.enabled);
  }

  async function needsGate() {
    if (!requiresProtectionSync()) return false;
    if (isUnlocked()) return false;
    return gateEnabled();
  }

  function removeOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
  }

  function showOverlay(config, options) {
    options = options || {};
    if (isUnlocked()) return Promise.resolve(true);
    if (overlayPromise) return overlayPromise;

    overlayPromise = new Promise((resolve) => {
      document.documentElement.classList.add('pro-gate-locked');

      const panel = document.createElement('div');
      panel.className = 'pro-gate';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'proGateTitle');

      const reason = options.reason === 'navigator'
        ? 'Navigator mode and professional tools are in preview.'
        : 'The professional section is in preview.';

      const hint = safe(config && config.hint) || 'Contact the site owner for access.';

      panel.innerHTML = `
      <div class="pro-gate__card">
        <h1 id="proGateTitle" class="pro-gate__title">Professional preview</h1>
        <p class="pro-gate__lead">${escapeHtml(reason)} Enter the preview password to continue.</p>
        <p class="pro-gate__hint">${escapeHtml(hint)}</p>
        <form class="pro-gate__form" id="proGateForm" autocomplete="off">
          <label class="pro-gate__label" for="proGatePassword">Password</label>
          <input class="pro-gate__input" id="proGatePassword" name="password" type="password" required autocomplete="current-password" />
          <p class="pro-gate__error" id="proGateError" hidden></p>
          <div class="pro-gate__actions">
            <button type="submit" class="btnlike btn-primary" id="proGateSubmit">Continue</button>
            <a class="btnlike" href="/">Back to family search</a>
          </div>
        </form>
        <p class="pro-gate__note">Family search stays open. This gate is temporary while we evaluate the professional layer.</p>
      </div>
    `;

      overlayEl = document.createElement('div');
      overlayEl.className = 'pro-gate-overlay';
      overlayEl.appendChild(panel);
      document.body.appendChild(overlayEl);

      const form = panel.querySelector('#proGateForm');
      const input = panel.querySelector('#proGatePassword');
      const errorEl = panel.querySelector('#proGateError');
      const submitBtn = panel.querySelector('#proGateSubmit');

      setTimeout(() => input && input.focus(), 50);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (errorEl) {
          errorEl.hidden = true;
          errorEl.textContent = '';
        }
        if (submitBtn) submitBtn.disabled = true;
        const ok = await verifyPassword(input ? input.value : '', config);
        if (submitBtn) submitBtn.disabled = false;
        if (!ok) {
          if (errorEl) {
            errorEl.textContent = 'Incorrect password. Try again.';
            errorEl.hidden = false;
          }
          if (input) input.select();
          return;
        }
        setUnlocked(true);
        removeOverlay();
        overlayPromise = null;
        resolve(true);
      });
    });

    return overlayPromise;
  }

  /**
   * Ensure the user has access. Resolves true when unlocked or gate disabled.
   */
  async function ensureAccess(options) {
    if (!requiresProtectionSync()) return true;
    if (isUnlocked()) return true;
    const config = await loadConfig();
    if (!config || !config.enabled) return true;
    await showOverlay(config, options);
    return isUnlocked();
  }

  /**
   * Run callback after gate passes (or immediately when not required).
   */
  function runWhenUnlocked(fn) {
    if (typeof fn !== 'function') return;
    const run = () => {
      Promise.resolve()
        .then(() => needsGate())
        .then((blocked) => {
          if (!blocked) {
            fn();
            return;
          }
          return ensureAccess().then((ok) => {
            if (ok) fn();
          });
        });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  async function bootPageGate() {
    if (!isProPage()) return;
    if (isUnlocked()) return;
    const config = await loadConfig();
    if (!config || !config.enabled) return;
    await showOverlay(config, { reason: 'page' });
  }

  window.VMHRProGate = {
    ensureAccess,
    runWhenUnlocked,
    isUnlocked,
    needsGate,
    isProPage,
    isNavigatorEntry,
    clearUnlock: () => setUnlocked(false),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPageGate, { once: true });
  } else {
    bootPageGate();
  }
})();
