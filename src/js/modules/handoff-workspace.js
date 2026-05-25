// ========== Handoff Workspace (Phase 9C) ==========
// Builds the workspace canvas from a scenario.
// Filters programs from window.programDataMap using the scenario inputs,
// computes call order and what-to-confirm, and renders both columns.
// No PHI. Does not change public search order.

(function () {
  if (typeof window === 'undefined') return;

  function safe(x) { return (x == null ? '' : String(x)).trim(); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // ── Care level mapping ────────────────────────────────────────────────────────
  const CARE_LEVEL_MAP = {
    php:         ['Partial Hospitalization (PHP)'],
    iop:         ['Intensive Outpatient (IOP)'],
    outpatient:  ['Outpatient', 'Walk-In Outpatient'],
    residential: ['Residential'],
    navigation:  ['Navigation'],
    unsure:      null, // show all
  };

  const GEO_MAP = {
    dallas:       'dallas',
    fort_worth:   'fort worth',
    plano:        'plano',
    frisco:       'frisco',
    mckinney:     'mckinney',
    arlington:    'arlington',
    garland:      'garland',
    irving:       'irving',
    denton:       'denton',
    lewisville:   'lewisville',
    richardson:   'richardson',
    carrollton:   'carrollton',
    grand_prairie:'grand prairie',
    dfw_metro:    null, // show all
    virtual_ok:   null, // show virtual
  };

  const INSURANCE_MAP = {
    medicaid_chip: ['medicaid', 'chip', 'medicaid/chip'],
    commercial:    ['commercial'],
    tricare:       ['tricare'],
    self_pay:      ['self-pay', 'self pay', 'sliding scale'],
    uninsured:     ['self-pay', 'self pay', 'sliding scale', 'uninsured'],
    unsure:        null,
  };

  const AGE_BAND_RANGES = {
    '5-9':    [5, 9],
    '10-12':  [10, 12],
    '13-14':  [13, 14],
    '15-17':  [15, 17],
    '18plus': [18, 999],
  };

  const SPECIALIZED_DOMAIN_MAP = {
    eating_disorder:  'eating_disorders',
    substance_use:    'substance_use',
    co_occurring:     'co_occurring',
  };

  // ── Program filtering ─────────────────────────────────────────────────────────

  function parseProgramAgeRange(agesServed) {
    const text = safe(agesServed);
    if (!text) return [0, 999];
    if (/\bup\b/i.test(text) || text.endsWith('+')) {
      const lo = parseInt(text, 10);
      return [Number.isFinite(lo) ? lo : 0, 999];
    }
    const band = text.match(/(\d{1,3})\s*[-–]\s*(\d{1,3})/);
    if (band) return [parseInt(band[1], 10), parseInt(band[2], 10)];
    const single = parseInt(text, 10);
    if (Number.isFinite(single)) return [single, single];
    return [0, 999];
  }

  function ageFits(program, ageBand) {
    if (!ageBand || ageBand === 'unsure') return true;
    const [scenarioMin, scenarioMax] = AGE_BAND_RANGES[ageBand] || [0, 999];
    const [progMin, progMax] = parseProgramAgeRange(program.ages_served);
    // Program serves part of the scenario band
    return progMin <= scenarioMax && progMax >= scenarioMin;
  }

  function careLevelFits(program, careLevel) {
    if (!careLevel || careLevel === 'unsure') return true;
    const allowed = CARE_LEVEL_MAP[careLevel];
    if (!allowed) return true;
    return allowed.some((l) => safe(program.level_of_care).toLowerCase().includes(l.toLowerCase()));
  }

  function geoFits(program, geography) {
    if (!geography || geography === 'dfw_metro') return true;
    if (geography === 'virtual_ok') {
      const setting = safe(program.service_setting).toLowerCase();
      return setting.includes('virtual') || setting.includes('telehealth') || setting.includes('online');
    }
    const cityToken = GEO_MAP[geography];
    if (!cityToken) return true;
    const locs = Array.isArray(program.locations) ? program.locations : [];
    return locs.some((l) => safe(l.city).toLowerCase().includes(cityToken));
  }

  function insuranceFits(program, insuranceType) {
    if (!insuranceType || insuranceType === 'unsure') return true;
    const tokens = INSURANCE_MAP[insuranceType];
    if (!tokens) return true;
    const ins = program.accepted_insurance || {};
    const types = (Array.isArray(ins.types) ? ins.types : []).map((t) => safe(t).toLowerCase());
    const plans = (Array.isArray(ins.plans) ? ins.plans : []).map((p) => safe(p).toLowerCase());
    const notes = (safe(ins.notes) + ' ' + safe(program.insurance_notes)).toLowerCase();
    return tokens.some((tok) =>
      types.some((t) => t.includes(tok)) ||
      plans.some((p) => p.includes(tok)) ||
      notes.includes(tok)
    );
  }

  function virtualFits(program, virtualPref) {
    if (!virtualPref || virtualPref === 'either') return true;
    const setting = safe(program.service_setting).toLowerCase();
    const isVirtual = setting.includes('virtual') || setting.includes('telehealth');
    if (virtualPref === 'in_person_only') return !isVirtual;
    if (virtualPref === 'virtual_preferred' || virtualPref === 'virtual_ok') return true;
    return true;
  }

  function specializedFits(program, needs) {
    if (!needs || needs.length === 0) return true;
    const domains = Array.isArray(program.service_domains) ? program.service_domains : [];
    return needs.some((need) => {
      const domain = SPECIALIZED_DOMAIN_MAP[need];
      if (domain) return domains.includes(domain);
      return true; // non-domain needs (lgbtq, spanish) — always show
    });
  }

  function scoreProgram(program, scenario) {
    let score = 0;
    const lastVerified = safe(program.last_verified || (program.verification && program.verification.last_verified_at));
    const fn = window.getVerificationFreshness;
    const freshness = lastVerified && typeof fn === 'function' ? fn(lastVerified) : 'missing';
    if (freshness === 'current') score += 3;
    else if (freshness === 'stale') score += 1;

    const hasIntake = safe(program.intake_phone) || (program.phone_labels && Object.keys(program.phone_labels).length > 0);
    if (hasIntake) score += 2;

    if (program.verification_tier === 'provider_attestation') score += 2;
    else if (program.verification_tier === 'phone_confirmed') score += 1;

    if (geoFits(program, scenario.geography) && scenario.geography !== 'dfw_metro') score += 1;

    return score;
  }

  function filterPrograms(scenario) {
    const map = window.programDataMap;
    if (!map || typeof map.get !== 'function') return [];
    const all = [];
    map.forEach((p) => all.push(p));

    return all
      .filter((p) => safe(p.entry_type).toLowerCase() !== 'crisis service')
      .filter((p) => ageFits(p, scenario.age_band))
      .filter((p) => careLevelFits(p, scenario.care_level))
      .filter((p) => geoFits(p, scenario.geography))
      .filter((p) => insuranceFits(p, scenario.insurance_type))
      .filter((p) => virtualFits(p, scenario.virtual_preference))
      .filter((p) => specializedFits(p, scenario.specialized_needs));
  }

  function splitPrimaryBackup(programs, scenario) {
    if (programs.length === 0) return { primary: [], backup: [] };
    const sorted = [...programs].sort((a, b) => scoreProgram(b, scenario) - scoreProgram(a, scenario));
    const primary = sorted.slice(0, 3);
    // Backup differs from primary on at least one dimension
    const primaryCities = new Set(primary.flatMap((p) => (p.locations || []).map((l) => safe(l.city).toLowerCase())));
    const primaryInsIds = new Set(primary.map((p) => {
      const ins = p.accepted_insurance || {};
      return (Array.isArray(ins.types) ? ins.types : []).join('|').toLowerCase();
    }));
    const backup = sorted.slice(3).filter((p) => {
      const cities = (p.locations || []).map((l) => safe(l.city).toLowerCase());
      const differentCity = cities.some((c) => !primaryCities.has(c));
      const insStr = ((p.accepted_insurance || {}).types || []).join('|').toLowerCase();
      const differentIns = insStr !== [...primaryInsIds][0];
      const isVirtual = safe(p.service_setting).toLowerCase().includes('virtual');
      return differentCity || differentIns || isVirtual;
    }).slice(0, 3);

    return { primary, backup };
  }

  // ── Rendering ──────────────────────────────────────────────────────────────────

  function renderProgramCard(program, isBackup) {
    const name    = escapeHtml(safe(program.program_name) || 'Program');
    const org     = escapeHtml(safe(program.organization));
    const care    = escapeHtml(safe(program.level_of_care) || 'Care level not listed');
    const ages    = escapeHtml(safe(program.ages_served) || 'Ask program');
    const setting = escapeHtml(safe(program.service_setting) || '');
    const locs    = Array.isArray(program.locations) ? program.locations : [];
    const loc     = escapeHtml(locs.length ? [locs[0].city, locs[0].state].filter(Boolean).join(', ') : 'Ask program');

    const lastVerified = safe(program.last_verified || (program.verification && program.verification.last_verified_at));
    const fn = window.getVerificationFreshness;
    const freshness = lastVerified && typeof fn === 'function' ? fn(lastVerified) : 'missing';
    const verBadge = freshness === 'stale' || freshness === 'missing'
      ? `<span class="friction-flag" data-flag-id="verification_stale" style="font-size:11px;">Verification overdue</span>`
      : `<span style="font-size:11px; color:var(--muted);">Verified ${escapeHtml(lastVerified)}</span>`;

    const phoneBlock = window.VMHRIntakeConfidence
      ? window.VMHRIntakeConfidence.renderPhoneBlock(program, { showConfidence: true })
      : (safe(program.phone) ? `<div class="wpc-phone"><div class="wpc-phone-line"><span class="phone-label-pill">Main line</span>${escapeHtml(safe(program.phone))}</div></div>` : '');

    const verifyNotice = window.VMHRIntakeConfidence
      ? window.VMHRIntakeConfidence.renderVerifyNotice(program)
      : '';

    const flags = window.VMHRFrictionFlags
      ? window.VMHRFrictionFlags.renderFlagBadgesHtml(program, null)
      : '';

    const label = isBackup ? '<span class="workspace-section-label" style="margin:0 0 4px; display:inline-block;">Backup</span>' : '';

    return `
      <div class="workspace-program-card" data-program-id="${escapeHtml(safe(program.program_id))}">
        ${label}
        <h3>${name}</h3>
        ${org ? `<p class="wpc-org">${org}</p>` : ''}
        <div class="wpc-meta">
          <div>Care level: ${care}</div>
          <div>Ages: ${ages}${setting ? ` • ${setting}` : ''}</div>
          <div>Location: ${loc}</div>
          <div style="margin-top:4px;">${verBadge}</div>
        </div>
        ${phoneBlock}
        ${verifyNotice}
        ${flags ? `<div class="wpc-flags">${flags}</div>` : ''}
      </div>`;
  }

  function renderCallOrder(programs) {
    return programs.map((p, i) => {
      const name = escapeHtml(safe(p.program_name));
      const lastVerified = safe(p.last_verified || (p.verification && p.verification.last_verified_at));
      const fn = window.getVerificationFreshness;
      const freshness = lastVerified && typeof fn === 'function' ? fn(lastVerified) : 'missing';
      const hasIntake = safe(p.intake_phone) || (p.phone_labels && Object.keys(p.phone_labels).length > 0);

      const reasons = [];
      if (freshness === 'current') reasons.push('verification current');
      if (hasIntake) reasons.push('intake phone labeled');
      if (p.verification_tier === 'provider_attestation') reasons.push('provider-confirmed');

      return `
        <li class="call-order-item">
          <span class="call-order-num" aria-hidden="true">${i + 1}</span>
          <div class="call-order-body">
            <strong>${name}</strong>
            ${reasons.length ? `<div class="call-order-reason">Why first: ${escapeHtml(reasons.join(' • '))}</div>` : ''}
          </div>
        </li>`;
    }).join('');
  }

  function renderConfirmList(programs) {
    const items = [];
    programs.forEach((p) => {
      const name = safe(p.program_name);
      const flags = window.VMHRFrictionFlags
        ? window.VMHRFrictionFlags.computeFlags(p, null)
        : [];
      flags.forEach((flagId) => {
        const def = window.VMHRFrictionFlags && window.VMHRFrictionFlags.FLAG_DEFINITIONS[flagId];
        if (def && def.whatToAsk) {
          items.push(`${name}: ${def.whatToAsk}`);
        }
      });
      if (!safe(p.intake_phone) && !(p.phone_labels)) {
        const alreadyListed = items.some((i) => i.includes(name) && i.includes('intake'));
        if (!alreadyListed) items.push(`${name}: Confirm whether the listed phone is intake, main reception, or crisis.`);
      }
    });
    if (!items.length) items.push('All programs: Confirm current intake phone, insurance, and availability before handing off.');
    return items.map((item) => `<li class="confirm-item">${escapeHtml(item)}</li>`).join('');
  }

  function renderScenarioSummary(scenario) {
    const tags = [];
    if (scenario.age_band) tags.push(`Age: ${scenario.age_band}`);
    if (scenario.care_level) tags.push(`Care level: ${scenario.care_level}`);
    if (scenario.geography) tags.push(`City: ${scenario.geography.replace(/_/g, ' ')}`);
    if (scenario.insurance_type) tags.push(`Insurance: ${scenario.insurance_type.replace(/_/g, ' ')}`);
    if (scenario.virtual_preference) tags.push(`Virtual: ${scenario.virtual_preference.replace(/_/g, ' ')}`);
    if (scenario.transportation_concern) tags.push('Transportation concern');
    if (scenario.school_coordination) tags.push('School coordination');
    const needs = Array.isArray(scenario.specialized_needs) ? scenario.specialized_needs : [];
    needs.forEach((n) => tags.push(n.replace(/_/g, ' ')));
    return tags.map((t) => `<li style="font-size:13px; padding:2px 0; color:var(--vm-ink);">${escapeHtml(t)}</li>`).join('');
  }

  // ── Main build function ───────────────────────────────────────────────────────

  function build(scenario) {
    const allMatched = filterPrograms(scenario);
    const { primary, backup } = splitPrimaryBackup(allMatched, scenario);
    const allSelected = [...primary, ...backup];

    // Render primary
    const primaryHost = document.getElementById('workspace-primary');
    if (primaryHost) {
      primaryHost.innerHTML = primary.length
        ? primary.map((p) => renderProgramCard(p, false)).join('')
        : '<div class="workspace-empty">No programs matched this scenario. Try broadening the scenario or <a href="index.html">searching the directory directly</a>.</div>';
    }

    // Render backup
    const backupHost = document.getElementById('workspace-backup');
    if (backupHost) {
      backupHost.innerHTML = backup.length
        ? backup.map((p) => renderProgramCard(p, true)).join('')
        : '<div class="workspace-empty">No distinct backup options found for this scenario. Consider broadening the geographic area or insurance type.</div>';
    }

    // Call order — sort all selected by score
    const callOrderList = document.getElementById('workspace-call-order');
    if (callOrderList) {
      const ordered = [...allSelected].sort((a, b) => scoreProgram(b, scenario) - scoreProgram(a, scenario));
      callOrderList.innerHTML = renderCallOrder(ordered);
    }

    // Confirm list
    const confirmList = document.getElementById('workspace-confirm-list');
    if (confirmList) {
      confirmList.innerHTML = renderConfirmList(allSelected);
    }

    // Scenario summary in sidebar
    const tagsHost = document.getElementById('sidebar-scenario-tags');
    if (tagsHost) tagsHost.innerHTML = renderScenarioSummary(scenario);

    const summaryHost = document.getElementById('workspace-scenario-summary');
    if (summaryHost) {
      const count = allMatched.length;
      summaryHost.textContent = `${count} program${count !== 1 ? 's' : ''} matched this scenario. Showing up to 3 primary and 3 backup options.`;
    }

    // Run readiness engine
    if (window.VMHRHandoffReadiness && typeof window.VMHRHandoffReadiness.evaluate === 'function') {
      const result = window.VMHRHandoffReadiness.evaluate(allSelected, scenario);
      const host = document.getElementById('handoff-readiness-host');
      if (host) host.innerHTML = window.VMHRHandoffReadiness.renderBanner(result);
    }

    // Track event
    if (window.VMHRProEvents) {
      window.VMHRProEvents.record('workspace_loaded', {
        primary_count: primary.length,
        backup_count: backup.length,
        had_results: allMatched.length > 0,
      });
    }

    // Wire packet step button
    const packetBtn = document.getElementById('preview-packet-btn');
    if (packetBtn) {
      packetBtn.onclick = () => {
        markTabDone('workspace');
        setStepVisible('packet');
        buildPacketPreview(allSelected, scenario);
      };
    }

    const backBtn = document.getElementById('packet-edit-workspace-btn');
    if (backBtn) {
      backBtn.onclick = () => setStepVisible('workspace');
    }
  }

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

  function buildPacketPreview(programs, scenario) {
    if (window.VMHRHandoffPrint && typeof window.VMHRHandoffPrint.openPacket === 'function') {
      const printBtn = document.getElementById('packet-print-btn');
      if (printBtn) {
        printBtn.onclick = () => window.VMHRHandoffPrint.openPacket(programs, scenario);
      }
    }

    const metaBar = document.getElementById('packet-meta-bar');
    if (metaBar) {
      const scenarioTags = [];
      if (scenario.care_level) scenarioTags.push(scenario.care_level.toUpperCase());
      if (scenario.geography) scenarioTags.push(scenario.geography.replace(/_/g, ' '));
      if (scenario.insurance_type) scenarioTags.push(scenario.insurance_type.replace(/_/g, ' '));
      if (scenario.age_band) scenarioTags.push(`age ${scenario.age_band}`);
      metaBar.innerHTML = `<strong>Scenario:</strong> ${escapeHtml(scenarioTags.join(' • ') || 'General')} • <strong>${programs.length} program${programs.length !== 1 ? 's' : ''}</strong> included.`;
    }

    if (window.VMHRProEvents) {
      window.VMHRProEvents.record('discharge_builder_complete', {
        field_count: Object.keys(scenario).length,
        crisis_path: false,
      });
    }
  }

  // Expose build — defers until programDataMap is populated by app.js.
  // vmhr:rendered only fires on index.html (search page), so on /handoff we
  // poll and listen for vmhr:programs-ready from app.js after catalog load.
  function buildWhenReady(scenario) {
    const tryBuild = () => {
      const map = window.programDataMap;
      if (map && map.size > 0) {
        build(scenario);
        return true;
      }
      return false;
    };

    if (tryBuild()) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 50;

    const cleanup = (intervalId) => {
      clearInterval(intervalId);
      window.removeEventListener('vmhr:programs-ready', onProgramsReady);
    };

    const onProgramsReady = () => {
      if (tryBuild()) cleanup(interval);
    };

    const interval = setInterval(() => {
      if (tryBuild()) {
        cleanup(interval);
        return;
      }
      if (++attempts >= MAX_ATTEMPTS) {
        cleanup(interval);
        const primaryHost = document.getElementById('workspace-primary');
        if (primaryHost) {
          primaryHost.innerHTML = '<div class="workspace-empty">Could not load program data. Try refreshing the page.</div>';
        }
      }
    }, 100);

    window.addEventListener('vmhr:programs-ready', onProgramsReady);
  }

  window.VMHRHandoffWorkspace = { build: buildWhenReady, filterPrograms };
})();
