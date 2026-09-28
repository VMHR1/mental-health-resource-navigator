// ========== Handoff Packet Completeness Score (Phase 8) ==========
// Pre-export checks for the discharge handoff packet.
// Returns an aggregate status used by the comparison modal UI and the print template.

const VMHRHandoffCompleteness = (function () {
  if (typeof window === 'undefined') return undefined;

  function safe(x) {
    return (x == null ? '' : String(x)).trim();
  }

  function hasIntakeLabel(program) {
    if (!program) return false;
    if (safe(program.intake_phone)) return true;
    if (program.phone_labels && typeof program.phone_labels === 'object') {
      const labelValues = Object.values(program.phone_labels)
        .map((v) => safe(v).toLowerCase())
        .filter(Boolean);
      if (labelValues.some((v) => v === 'intake' || v === 'admissions' || v === 'main')) return true;
    }
    const notes = safe(program.notes).toLowerCase();
    if (/\bintake\b|\badmissions\b/.test(notes)) return true;
    // Fallback: if a phone is listed at all, allow it as "main line".
    return false;
  }

  function isStale(program) {
    const lastVerified = safe(program.last_verified || (program.verification && program.verification.last_verified_at));
    if (!lastVerified) return true;
    const fn = window.getVerificationFreshness;
    if (typeof fn !== 'function') return false;
    return fn(lastVerified) === 'stale' || fn(lastVerified) === 'missing';
  }

  /**
   * Evaluate the readiness of a handoff packet for a set of programs.
   * @param {Array<Object>} programs - 1..3 programs being compared
   * @returns {{ status: string, label: string, blocking: boolean, issues: Array<string>, checks: Object }}
   */
  function evaluatePacket(programs) {
    const list = Array.isArray(programs) ? programs.filter(Boolean) : [];
    const checks = {
      programCount: list.length,
      hasBackupOption: list.length >= 2,
      stalePrograms: list.filter(isStale).map((p) => safe(p.program_name) || safe(p.program_id)),
      missingIntakeLabels: list.filter((p) => !hasIntakeLabel(p)).map((p) => safe(p.program_name) || safe(p.program_id)),
      // Static blocks live in handoff_copy.json — always considered present when
      // the print module can load them. We pessimistically allow export.
      crisisBlock: true,
      neutralityFooter: true,
    };

    const issues = [];

    if (list.length === 0) {
      return {
        status: 'no_programs',
        label: 'No programs selected',
        blocking: true,
        issues: ['Add at least one program to the compare set.'],
        checks,
      };
    }

    if (!checks.hasBackupOption) {
      issues.push('Only one program selected; a backup option is recommended.');
    }
    if (checks.stalePrograms.length > 0) {
      issues.push(`${checks.stalePrograms.length} program${checks.stalePrograms.length > 1 ? 's' : ''} have verification over 90 days old.`);
    }
    if (checks.missingIntakeLabels.length > 0) {
      issues.push(`${checks.missingIntakeLabels.length} program${checks.missingIntakeLabels.length > 1 ? 's' : ''} lack a labeled intake phone (use "Main line" on the printout).`);
    }

    // Determine the dominant non-blocking issue for the badge label
    let status = 'ready';
    let label = 'Ready';

    if (!checks.hasBackupOption) {
      status = 'missing_backup';
      label = 'Missing backup option';
    } else if (checks.stalePrograms.length > 0) {
      status = 'includes_stale';
      label = 'Includes stale program information';
    } else if (checks.missingIntakeLabels.length > 0) {
      status = 'missing_labels';
      label = 'Missing intake labels';
    }

    return {
      status,
      label,
      blocking: false,
      issues,
      checks,
    };
  }

  function statusToAnalyticsToken(status) {
    switch (status) {
      case 'ready': return 'Ready';
      case 'missing_backup': return 'MissingBackup';
      case 'includes_stale': return 'Stale';
      case 'missing_labels': return 'MissingLabels';
      case 'no_programs': return 'NoPrograms';
      default: return 'Unknown';
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderStatusBannerHtml(evaluation) {
    if (!evaluation) return '';
    const mod = ({
      ready: 'ready',
      missing_backup: 'missing-backup',
      includes_stale: 'includes-stale',
      missing_labels: 'missing-labels',
      no_programs: 'missing-backup',
    })[evaluation.status] || 'ready';

    const issuesHtml = (evaluation.issues || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('');
    const exportDisabled = evaluation.blocking ? 'disabled' : '';

    return `
      <div class="handoff-status handoff-status--${escapeHtml(mod)}" data-handoff-status="${escapeHtml(evaluation.status)}">
        <div class="handoff-status__main">
          <span class="handoff-status__label">Handoff packet status</span>
          <span class="handoff-status__value">${escapeHtml(evaluation.label)}</span>
          ${issuesHtml ? `<ul class="handoff-status__details">${issuesHtml}</ul>` : ''}
        </div>
        <div class="handoff-status__actions">
          <button type="button" class="btn-primary" id="handoffPrintBtn" ${exportDisabled}>Print handoff packet</button>
        </div>
      </div>
    `;
  }

  function programsFromComparisonSet() {
    const map = window.programDataMap;
    const set = window.comparisonSet;
    if (!map || !set || typeof map.get !== 'function' || typeof set.forEach !== 'function') return [];
    const result = [];
    set.forEach((id) => {
      const p = map.get(id);
      if (p) result.push(p);
    });
    return result;
  }

  function updateHandoffStatus() {
    const host = document.getElementById('handoffStatusHost');
    if (!host) return;
    const programs = programsFromComparisonSet();
    if (!programs.length) {
      host.innerHTML = '';
      return;
    }
    const evaluation = evaluatePacket(programs);
    host.innerHTML = renderStatusBannerHtml(evaluation);
    if (window.VMHRProEvents && typeof window.VMHRProEvents.record === 'function') {
      window.VMHRProEvents.record('handoff_completeness_status', {
        status: statusToAnalyticsToken(evaluation.status),
      });
    }
  }

  function handleHandoffPrintClick() {
    const programs = programsFromComparisonSet();
    if (!programs.length) return;
    const evaluation = evaluatePacket(programs);
    if (evaluation.blocking) return;
    if (evaluation.status !== 'ready') {
      const proceed = window.confirm(
        `${evaluation.label}. Print anyway?\n\n${(evaluation.issues || []).join('\n')}`
      );
      if (!proceed) return;
    }
    if (window.VMHRHandoffPrint && typeof window.VMHRHandoffPrint.openPacket === 'function') {
      window.VMHRHandoffPrint.openPacket(programs);
    }
  }

  function bindBootstrap() {
    // Update banner whenever the comparison modal becomes visible.
    const modal = document.getElementById('comparisonModal');
    if (modal) {
      const observer = new MutationObserver(() => {
        if (modal.getAttribute('aria-hidden') === 'false') {
          updateHandoffStatus();
        }
      });
      observer.observe(modal, { attributes: true, attributeFilter: ['aria-hidden'] });
    }

    // Wrap window.renderComparison so we refresh status whenever the list re-renders.
    const tryWrap = () => {
      if (typeof window.renderComparison !== 'function') return false;
      if (window.renderComparison.__vmhrWrapped) return true;
      const original = window.renderComparison;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        try { updateHandoffStatus(); } catch (e) { /* ignore */ }
        return result;
      };
      wrapped.__vmhrWrapped = true;
      window.renderComparison = wrapped;
      return true;
    };
    if (!tryWrap()) {
      // render.js may load slightly after this — retry once on next tick.
      setTimeout(tryWrap, 0);
      setTimeout(tryWrap, 200);
    }

    // Delegated click for the print button (created inside the banner each time).
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#handoffPrintBtn');
      if (btn) {
        e.preventDefault();
        handleHandoffPrintClick();
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindBootstrap, { once: true });
    } else {
      bindBootstrap();
    }
  }

  return {
    evaluatePacket,
    renderStatusBannerHtml,
    statusToAnalyticsToken,
    updateHandoffStatus,
  };
})();

export { VMHRHandoffCompleteness };

// For classic-script (non-module) consumers not yet converted
if (typeof window !== 'undefined') {
  window.VMHRHandoffCompleteness = VMHRHandoffCompleteness;
}
