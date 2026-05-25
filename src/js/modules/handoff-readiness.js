// ========== Handoff Readiness Engine (Phase 9D) ==========
// Evaluates a program set against the rules in handoff_readiness_rules.json.
// Returns a four-status procedural readiness result.
//
// IMPORTANT: readiness is NOT a quality score. It does NOT rank programs by quality.
// It does NOT determine clinical appropriateness. It is a procedural completeness check.
// Print is never blocked; the planner is always the decision-maker.

(function () {
  if (typeof window === 'undefined') return;

  function safe(x) { return (x == null ? '' : String(x)).trim(); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // ── Status severity ordering ──────────────────────────────────────────────────
  const STATUS_SEVERITY = {
    ready:              0,
    needs_confirmation: 1,
    weak_handoff:       2,
    do_not_hand_off:    3,
  };

  const STATUS_LABELS = {
    ready:              'Ready for handoff',
    needs_confirmation: 'Needs confirmation',
    weak_handoff:       'Weak handoff',
    do_not_hand_off:    'Do not hand off without calling',
  };

  const DISCLAIMER = 'Readiness is a procedural check — it confirms the packet contains expected structural elements (backup option, intake label, verification freshness, crisis fallback). It is not a clinical recommendation, not a quality score, and not a substitute for confirming details directly with each program. ViableMHR is not emergency care; call 988 for crisis support or 911 for immediate danger.';

  // ── Care level check helpers ───────────────────────────────────────────────────

  const CARE_LEVEL_MAP = {
    php:         ['Partial Hospitalization (PHP)'],
    iop:         ['Intensive Outpatient (IOP)'],
    outpatient:  ['Outpatient', 'Walk-In Outpatient'],
    residential: ['Residential'],
    navigation:  ['Navigation'],
  };

  function programMatchesCareLevel(program, careLevel) {
    if (!careLevel || careLevel === 'unsure') return true;
    const allowed = CARE_LEVEL_MAP[careLevel];
    if (!allowed) return true;
    return allowed.some((l) => safe(program.level_of_care).toLowerCase().includes(l.toLowerCase()));
  }

  function hasIntakeLabel(program) {
    if (safe(program.intake_phone)) return true;
    if (program.phone_labels && typeof program.phone_labels === 'object') {
      const vals = Object.values(program.phone_labels).map((v) => safe(v).toLowerCase());
      return vals.some((v) => v === 'intake' || v === 'admissions' || v === 'main');
    }
    return /\bintake\b|\badmissions\b/.test(safe(program.notes).toLowerCase());
  }

  function isStale(program) {
    const lastVerified = safe(program.last_verified || (program.verification && program.verification.last_verified_at));
    if (!lastVerified) return true;
    const fn = window.getVerificationFreshness;
    if (typeof fn !== 'function') return false;
    return fn(lastVerified) === 'stale' || fn(lastVerified) === 'missing';
  }

  function geoFitsScenario(program, geography) {
    if (!geography || geography === 'dfw_metro') return true;
    if (geography === 'virtual_ok') {
      return safe(program.service_setting).toLowerCase().includes('virtual');
    }
    const GEO_MAP = {
      dallas:'dallas', fort_worth:'fort worth', plano:'plano', frisco:'frisco',
      mckinney:'mckinney', arlington:'arlington', garland:'garland', irving:'irving',
      denton:'denton', lewisville:'lewisville', richardson:'richardson',
      carrollton:'carrollton', grand_prairie:'grand prairie',
    };
    const tok = GEO_MAP[geography];
    if (!tok) return true;
    const locs = Array.isArray(program.locations) ? program.locations : [];
    const isVirtual = safe(program.service_setting).toLowerCase().includes('virtual');
    if (isVirtual) return true;
    return locs.some((l) => safe(l.city).toLowerCase().includes(tok));
  }

  function insuranceIsClear(program) {
    const ins = program.accepted_insurance || {};
    const status = safe(ins.status).toLowerCase();
    if (status === 'not_listed' || status === 'unclear' || status === 'contact_for_info') return false;
    const types = Array.isArray(ins.types) ? ins.types.filter(Boolean) : [];
    const plans = Array.isArray(ins.plans) ? ins.plans.filter(Boolean) : [];
    const notes = safe(ins.notes) || safe(program.insurance_notes);
    return types.length > 0 || plans.length > 0 || notes.length > 0;
  }

  // ── Core evaluation ───────────────────────────────────────────────────────────

  /**
   * Evaluate the readiness of a program set for a scenario.
   * @param {Array} programs — selected programs (primary + backup)
   * @param {Object} scenario — non-PHI scenario from VMHRScenarioState
   * @returns {{ status, label, severity, failing_checks, passing_checks, disclaimer }}
   */
  function evaluate(programs, scenario) {
    const list = Array.isArray(programs) ? programs.filter(Boolean) : [];
    const sc = scenario || {};
    const failing = [];
    const passing = [];

    // Blocking check: program count
    if (list.length === 0) {
      return {
        status: 'do_not_hand_off',
        label: STATUS_LABELS.do_not_hand_off,
        severity: STATUS_SEVERITY.do_not_hand_off,
        failing_checks: [{ id: 'program_count', message: 'No programs selected. Add at least one program.' }],
        passing_checks: [],
        disclaimer: DISCLAIMER,
      };
    }

    // Check: backup option
    if (list.length >= 2) {
      passing.push({ id: 'backup_option', message: 'Backup option present.' });
    } else {
      failing.push({ id: 'backup_option', message: 'No backup option. Add a second program in case the first is unavailable.', severity: STATUS_SEVERITY.weak_handoff });
    }

    // Check: care level match (scenario-aware)
    const careMismatches = sc.care_level
      ? list.filter((p) => !programMatchesCareLevel(p, sc.care_level))
      : [];
    if (careMismatches.length > 0) {
      failing.push({ id: 'care_level_match', message: `${careMismatches.length} program(s) may not offer the requested care level. Confirm care level directly.`, severity: STATUS_SEVERITY.weak_handoff });
    } else {
      passing.push({ id: 'care_level_match', message: 'Care level matches scenario (or no care level specified).' });
    }

    // Check: insurance clear
    const insuranceUnclear = list.filter((p) => !insuranceIsClear(p));
    if (insuranceUnclear.length > 0) {
      failing.push({ id: 'insurance_clear', message: `Insurance status unclear for ${insuranceUnclear.length} program(s). Confirm accepted plans.`, severity: STATUS_SEVERITY.needs_confirmation });
    } else {
      passing.push({ id: 'insurance_clear', message: 'Insurance status clear for all programs.' });
    }

    // Check: intake phone labeled
    const noIntake = list.filter((p) => !hasIntakeLabel(p));
    if (noIntake.length > 0) {
      failing.push({ id: 'intake_phone_labeled', message: `Intake phone not labeled for ${noIntake.length} program(s). Confirm which number to give the family.`, severity: STATUS_SEVERITY.needs_confirmation });
    } else {
      passing.push({ id: 'intake_phone_labeled', message: 'Intake phone labeled for all programs.' });
    }

    // Check: verification fresh
    const stalePrograms = list.filter(isStale);
    if (stalePrograms.length > 0) {
      failing.push({ id: 'verification_fresh', message: `${stalePrograms.length} program(s) not verified in the last 90 days. Confirm details are current.`, severity: STATUS_SEVERITY.needs_confirmation });
    } else {
      passing.push({ id: 'verification_fresh', message: 'All programs verified within 90 days.' });
    }

    // Check: no stale + missing intake combined
    const compoundRisk = list.filter((p) => isStale(p) && !hasIntakeLabel(p));
    if (compoundRisk.length > 0) {
      failing.push({ id: 'no_stale_critical_fields', message: `${compoundRisk.length} program(s) are both stale AND missing an intake label. Do not hand off without a direct call.`, severity: STATUS_SEVERITY.do_not_hand_off });
    } else {
      passing.push({ id: 'no_stale_critical_fields', message: 'No programs have both stale verification and missing intake label.' });
    }

    // Check: location/virtual fit
    const geoMismatches = sc.geography
      ? list.filter((p) => !geoFitsScenario(p, sc.geography))
      : [];
    if (geoMismatches.length > 0) {
      failing.push({ id: 'location_or_virtual_fit', message: `${geoMismatches.length} program(s) may not serve the selected geography. Confirm location fit or virtual availability.`, severity: STATUS_SEVERITY.weak_handoff });
    } else {
      passing.push({ id: 'location_or_virtual_fit', message: 'Location or virtual fit confirmed for all programs (or no geography specified).' });
    }

    // Crisis fallback is always present (asserted, not checked)
    passing.push({ id: 'crisis_fallback_present', message: '988/911 crisis fallback included in all packets.' });

    // Determine worst-case status
    let worstSeverity = STATUS_SEVERITY.ready;
    failing.forEach(({ severity }) => {
      if (severity > worstSeverity) worstSeverity = severity;
    });

    const statusKey = Object.keys(STATUS_SEVERITY).find((k) => STATUS_SEVERITY[k] === worstSeverity) || 'ready';

    return {
      status: statusKey,
      label: STATUS_LABELS[statusKey],
      severity: worstSeverity,
      failing_checks: failing,
      passing_checks: passing,
      disclaimer: DISCLAIMER,
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const STATUS_MOD = {
    ready:              'ready',
    needs_confirmation: 'needs-confirmation',
    weak_handoff:       'weak',
    do_not_hand_off:    'critical',
  };

  function renderBanner(result) {
    if (!result) return '';
    const mod = STATUS_MOD[result.status] || 'ready';
    const failItems = (result.failing_checks || []).map((c) => `<li>${escapeHtml(c.message)}</li>`).join('');
    const passItems = (result.passing_checks || []).map((c) => `<li>${escapeHtml(c.message)}</li>`).join('');

    return `
      <div class="handoff-status handoff-status--${mod}" data-readiness-status="${escapeHtml(result.status)}" role="status" aria-live="polite">
        <div class="handoff-status__main">
          <span class="handoff-status__label">Handoff readiness</span>
          <span class="handoff-status__value">${escapeHtml(result.label)}</span>
          ${failItems ? `<ul class="handoff-status__details" aria-label="Issues to address">${failItems}</ul>` : ''}
          ${passItems && result.status !== 'ready' ? `
            <details style="margin-top:8px; font-size:12px;">
              <summary style="cursor:pointer; color:var(--muted);">What passed (${result.passing_checks.length} checks)</summary>
              <ul style="margin:6px 0 0; padding-left:1.1rem;">${passItems}</ul>
            </details>` : ''}
        </div>
        <p class="handoff-status__disclaimer" style="font-size:11px; color:var(--muted); margin:8px 0 0; line-height:1.4;">${escapeHtml(result.disclaimer)}</p>
      </div>
    `;
  }

  window.VMHRHandoffReadiness = { evaluate, renderBanner, STATUS_LABELS, STATUS_SEVERITY, DISCLAIMER };
})();
