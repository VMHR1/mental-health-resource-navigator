// ========== Handoff Builder (Phase 9C) ==========
// Owns the scenario builder UI on /handoff.html.
// Reads form state, saves to VMHRScenarioState, and transitions to the workspace step.
// No PHI. No free-text fields. No server calls.

(function () {
  if (typeof window === 'undefined') return;

  function safe(x) { return (x == null ? '' : String(x)).trim(); }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function setStepVisible(stepId) {
    document.querySelectorAll('[data-handoff-step]').forEach((el) => {
      el.hidden = el.dataset.handoffStep !== stepId;
    });
    document.querySelectorAll('.handoff-step-tab').forEach((tab) => {
      const active = tab.dataset.stepLabel === stepId;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-current', active ? 'step' : 'false');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function markTabDone(stepId) {
    const tab = document.querySelector(`.handoff-step-tab[data-step-label="${stepId}"]`);
    if (tab) tab.classList.add('done');
  }

  // ── Scenario form reading ────────────────────────────────────────────────────

  function readScenarioFromForm() {
    const scenario = {};

    // Single-select fields
    document.querySelectorAll('.scenario-select[data-scenario-field]').forEach((sel) => {
      const field = sel.dataset.scenarioField;
      const val = safe(sel.value);
      if (val) scenario[field] = val;
    });

    // Checkbox toggles (scalar — transportation_concern, school_coordination)
    document.querySelectorAll('.scenario-toggle input[type="checkbox"]:not([data-scenario-field="specialized_needs"])').forEach((cb) => {
      const field = cb.dataset.scenarioField;
      if (cb.checked) scenario[field] = cb.value;
    });

    // Multi-select checkboxes (specialized_needs)
    const needs = [];
    document.querySelectorAll('.scenario-toggle input[data-scenario-field="specialized_needs"]:checked').forEach((cb) => {
      needs.push(cb.value);
    });
    if (needs.length) scenario.specialized_needs = needs;

    return scenario;
  }

  function populateFormFromScenario(scenario) {
    if (!scenario || typeof scenario !== 'object') return;

    // Single-select dropdowns
    document.querySelectorAll('.scenario-select[data-scenario-field]').forEach((sel) => {
      const field = sel.dataset.scenarioField;
      if (scenario[field]) sel.value = scenario[field];
    });

    // Scalar checkboxes
    document.querySelectorAll('.scenario-toggle input[type="checkbox"]:not([data-scenario-field="specialized_needs"])').forEach((cb) => {
      const field = cb.dataset.scenarioField;
      if (scenario[field] === cb.value) {
        cb.checked = true;
        cb.closest('.scenario-toggle').classList.add('checked');
      }
    });

    // Multi-select checkboxes (specialized_needs)
    const needs = Array.isArray(scenario.specialized_needs) ? scenario.specialized_needs : [];
    document.querySelectorAll('.scenario-toggle input[data-scenario-field="specialized_needs"]').forEach((cb) => {
      cb.checked = needs.includes(cb.value);
      cb.closest('.scenario-toggle').classList.toggle('checked', cb.checked);
    });
  }

  // ── Crisis intercept ──────────────────────────────────────────────────────────

  function handleSafetyChange(value) {
    const intercept = document.getElementById('crisis-intercept');
    const fields    = document.getElementById('scenario-fields-main');
    const buildBtn  = document.getElementById('build-workspace-btn');

    if (!intercept || !fields) return;

    const isCrisis = value === 'crisis';
    intercept.hidden = !isCrisis;
    fields.style.display = isCrisis ? 'none' : '';
    if (buildBtn) buildBtn.style.display = isCrisis ? 'none' : '';

    if (isCrisis && window.VMHRProEvents) {
      window.VMHRProEvents.record('discharge_builder_start', { crisis_path: true });
    }
  }

  // ── Build workspace button ────────────────────────────────────────────────────

  function handleBuildWorkspace(e) {
    if (e && e.preventDefault) e.preventDefault();
    const scenario = readScenarioFromForm();

    if (!scenario.care_level && !scenario.age_band && !scenario.geography && !scenario.insurance_type) {
      alert('Please fill in at least one scenario field (care level, age band, city, or insurance type) before building the workspace.');
      return;
    }

    if (window.VMHRScenarioState) window.VMHRScenarioState.save(scenario);

    if (window.VMHRProEvents) {
      window.VMHRProEvents.record('discharge_builder_start', {
        field_count: Object.keys(scenario).length,
        crisis_path: false,
      });
    }

    markTabDone('scenario');
    setStepVisible('workspace');

    if (window.VMHRHandoffWorkspace && typeof window.VMHRHandoffWorkspace.build === 'function') {
      window.VMHRHandoffWorkspace.build(scenario);
    }
  }

  // ── Clear scenario ────────────────────────────────────────────────────────────

  function handleClearScenario() {
    document.querySelectorAll('.scenario-select[data-scenario-field]').forEach((sel) => { sel.value = ''; });
    document.querySelectorAll('.scenario-toggle input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
      cb.closest('.scenario-toggle').classList.remove('checked');
    });
    const intercept = document.getElementById('crisis-intercept');
    const fields    = document.getElementById('scenario-fields-main');
    const buildBtn  = document.getElementById('build-workspace-btn');
    if (intercept) intercept.hidden = true;
    if (fields) fields.style.display = '';
    if (buildBtn) buildBtn.style.display = '';
    if (window.VMHRScenarioState) window.VMHRScenarioState.clear();
  }

  // ── Bindings ──────────────────────────────────────────────────────────────────

  function bindToggleLabels() {
    document.querySelectorAll('.scenario-toggle input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        cb.closest('.scenario-toggle').classList.toggle('checked', cb.checked);
      });
    });
  }

  function bindCrisisBack() {
    const link = document.getElementById('crisis-back-link');
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const sel = document.getElementById('scenario-safety');
        if (sel) { sel.value = ''; handleSafetyChange(''); }
      });
    }
  }

  function bindEditScenario() {
    ['edit-scenario-btn', 'packet-edit-scenario-btn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => setStepVisible('scenario'));
    });
  }

  function init() {
    let ran = false;
    const tryRun = () => {
      if (ran) return;
      ran = true;
      run();
    };

    // Fallback: bind handlers when user unlocks via overlay (in case ensureAccess races).
    document.addEventListener('vmhr:pro-gate-unlock', tryRun, { once: true });

    if (window.VMHRProGate && typeof window.VMHRProGate.runWhenUnlocked === 'function') {
      window.VMHRProGate.runWhenUnlocked(tryRun);
    } else {
      tryRun();
    }
  }

  function run() {
    // Restore scenario from URL or session
    let savedScenario = null;
    if (window.VMHRScenarioState) {
      savedScenario = window.VMHRScenarioState.hydrateFromUrl() || window.VMHRScenarioState.load();
    }

    if (savedScenario && Object.keys(savedScenario).length > 0) {
      populateFormFromScenario(savedScenario);
      if (savedScenario.safety_urgency) handleSafetyChange(savedScenario.safety_urgency);
    }

    // Safety urgency change
    const safetySel = document.getElementById('scenario-safety');
    if (safetySel) {
      safetySel.addEventListener('change', () => handleSafetyChange(safetySel.value));
    }

    // Build workspace button
    const buildBtn = document.getElementById('build-workspace-btn');
    if (buildBtn) buildBtn.addEventListener('click', handleBuildWorkspace);

    // Clear scenario
    const clearBtn = document.getElementById('clear-scenario-btn');
    if (clearBtn) clearBtn.addEventListener('click', handleClearScenario);

    bindToggleLabels();
    bindCrisisBack();
    bindEditScenario();

    if (window.VMHRProEvents) {
      window.VMHRProEvents.record('discharge_builder_start', { entry_source: 'landing' });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.VMHRHandoffBuilder = { readScenarioFromForm, populateFormFromScenario };
})();
