// ========== Handoff Print (Phase 8) ==========
// Build a printable / save-as-PDF handoff packet from the comparison set.
// Always renders the static Backup Plan and Crisis blocks, plus per-program
// match summary and operational caveats. No PHI fields, no patient names.

(function () {
  if (typeof window === 'undefined') return;

  let cachedCopy = null;
  let copyPromise = null;

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

  function loadHandoffCopy() {
    if (cachedCopy) return Promise.resolve(cachedCopy);
    if (copyPromise) return copyPromise;
    copyPromise = fetch('data/handoff_copy.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load handoff_copy.json');
        return r.json();
      })
      .then((data) => {
        cachedCopy = data;
        return data;
      })
      .catch((err) => {
        console.warn('handoff_copy.json fallback:', err);
        // Minimal fallback ensures we still print a usable packet.
        cachedCopy = {
          metadata: { version: 0 },
          disclaimer: 'This packet is informational only. Confirm details with each program. Do not write patient identifiers on this page.',
          care_levels_blurb: [],
          backup_plan_intro: 'If the first program cannot help, try these steps. Not medical advice.',
          backup_plan_rows: [],
          call_script: [],
          crisis_block: {
            title: 'Crisis and safety',
            body: 'Call 988 for crisis support. Call 911 for immediate physical danger. ViableMHR is not emergency care.',
          },
          footer: 'Prepared with ViableMHR. Neutral directory. Confirm details with each program.',
        };
        return cachedCopy;
      });
    return copyPromise;
  }

  function locLabel(program) {
    if (typeof window.locLabel === 'function') return window.locLabel(program);
    const locs = Array.isArray(program.locations) ? program.locations : [];
    const first = locs[0] || {};
    const parts = [safe(first.city), safe(first.state)].filter(Boolean);
    return parts.join(', ') || 'Location not listed';
  }

  function addressLabel(program) {
    const locs = Array.isArray(program.locations) ? program.locations : [];
    if (!locs.length) return '';
    const parts = locs
      .map((l) => [safe(l.address), safe(l.city), safe(l.state), safe(l.zip)].filter(Boolean).join(', '))
      .filter(Boolean);
    return parts.join(' • ');
  }

  function phoneLabel(program) {
    const phone = safe(program.phone);
    const intake = safe(program.intake_phone);
    const phoneLabels = program.phone_labels && typeof program.phone_labels === 'object' ? program.phone_labels : null;
    const lines = [];
    if (intake) lines.push(`Intake: ${intake}`);
    if (phoneLabels && phoneLabels.main && safe(phoneLabels.main).toLowerCase() !== 'intake') {
      lines.push(`Main: ${phone || ''}`);
    } else if (!intake && phone) {
      lines.push(`Main line: ${phone}`);
    } else if (intake && phone && phone !== intake) {
      lines.push(`Main: ${phone}`);
    }
    return lines.join(' • ');
  }

  function frictionFlagsForProgram(program) {
    if (!window.VMHRFrictionFlags || typeof window.VMHRFrictionFlags.computeFlags !== 'function') return [];
    const filters = window.VMHRMatchExplain && window.VMHRMatchExplain.readFilterSnapshot
      ? window.VMHRMatchExplain.readFilterSnapshot()
      : null;
    const ids = window.VMHRFrictionFlags.computeFlags(program, filters);
    return ids.map((id) => (window.VMHRFrictionFlags.FLAG_DEFINITIONS[id] && window.VMHRFrictionFlags.FLAG_DEFINITIONS[id].label) || id);
  }

  function matchSummaryForProgram(program) {
    if (!window.VMHRMatchExplain || typeof window.VMHRMatchExplain.explainMatch !== 'function') return [];
    const filters = window.VMHRMatchExplain.readFilterSnapshot();
    return window.VMHRMatchExplain.explainMatch(program, filters);
  }

  function renderProgramBlock(program) {
    const name = safe(program.program_name) || 'Program';
    const org = safe(program.organization);
    const care = safe(program.level_of_care) || 'Care level not listed';
    const ages = safe(program.ages_served) || 'Ask program';
    const loc = locLabel(program);
    const addr = addressLabel(program);
    const phones = phoneLabel(program);
    const website = safe(program.website_url) || safe(program.website);
    const insurance = safe(program.insurance_notes) || 'Confirm by phone';
    const lastVerified = safe(program.last_verified || (program.verification && program.verification.last_verified_at));
    const fn = window.getVerificationFreshness;
    const freshness = lastVerified && typeof fn === 'function' ? fn(lastVerified) : 'missing';
    const verificationLine = lastVerified
      ? `${lastVerified}${freshness === 'stale' ? ' (over 90 days — confirm currency)' : ''}`
      : 'Not listed — confirm directly';

    const matchRows = matchSummaryForProgram(program)
      .filter((r) => r.key !== 'verification')
      .map((r) => `${escapeHtml(r.label)}: ${escapeHtml(r.detail)}`);
    const flags = frictionFlagsForProgram(program);

    return `
      <article class="handoff-print__program">
        <h2>${escapeHtml(name)}</h2>
        ${org ? `<p class="org">${escapeHtml(org)}</p>` : ''}
        <dl>
          <dt>Care level</dt><dd>${escapeHtml(care)}</dd>
          <dt>Ages served</dt><dd>${escapeHtml(ages)}</dd>
          <dt>Location</dt><dd>${escapeHtml(loc)}${addr ? ` (${escapeHtml(addr)})` : ''}</dd>
          ${phones ? `<dt>Phone</dt><dd>${escapeHtml(phones)}</dd>` : ''}
          ${website ? `<dt>Website</dt><dd>${escapeHtml(website)}</dd>` : ''}
          <dt>Insurance</dt><dd>${escapeHtml(insurance)}</dd>
          <dt>Last verified</dt><dd>${escapeHtml(verificationLine)}</dd>
        </dl>
        ${matchRows.length ? `<p class="handoff-print__match"><strong>Why this matched:</strong> ${matchRows.join('; ')}</p>` : ''}
        ${flags.length ? `<p class="handoff-print__flags"><strong>Operational caveats:</strong> ${escapeHtml(flags.join(', '))}</p>` : ''}
      </article>
    `;
  }

  function renderBackupPlanSection(copy) {
    const intro = escapeHtml(safe(copy.backup_plan_intro) || 'If the first call does not work out, try these steps.');
    const rows = (Array.isArray(copy.backup_plan_rows) ? copy.backup_plan_rows : [])
      .map((row) => `<tr><th scope="row">${escapeHtml(row.scenario)}</th><td>${escapeHtml(row.actions)}</td></tr>`)
      .join('');
    if (!rows) {
      return `<section class="handoff-print__section handoff-print__backup"><h2>Backup plan</h2><p>${intro}</p></section>`;
    }
    return `
      <section class="handoff-print__section handoff-print__backup">
        <h2>Backup plan</h2>
        <p>${intro}</p>
        <table>
          <thead><tr><th scope="col">If this happens</th><th scope="col">What families and staff can try</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  function renderCareLevelBlock(copy) {
    const items = Array.isArray(copy.care_levels_blurb) ? copy.care_levels_blurb : [];
    if (!items.length) return '';
    return `
      <section class="handoff-print__section">
        <h2>Levels of care</h2>
        <ul>
          ${items.map((c) => `<li><strong>${escapeHtml(c.label)}:</strong> ${escapeHtml(c.text)}</li>`).join('')}
        </ul>
      </section>
    `;
  }

  function renderCallScriptBlock(copy) {
    const items = Array.isArray(copy.call_script) ? copy.call_script : [];
    if (!items.length) return '';
    return `
      <section class="handoff-print__section">
        <h2>Call script</h2>
        <ol>
          ${items.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}
        </ol>
      </section>
    `;
  }

  function renderCrisisBlock(copy) {
    const crisis = copy.crisis_block || {};
    return `
      <section class="handoff-print__crisis" aria-label="Crisis and safety">
        <strong>${escapeHtml(crisis.title || 'Crisis and safety')}</strong><br>
        ${escapeHtml(crisis.body || 'Call 988 for crisis support. Call 911 for immediate physical danger. ViableMHR is not emergency care.')}
      </section>
    `;
  }

  function renderDocument(programs, copy, evaluation) {
    const now = new Date();
    const generated = now.toLocaleString();
    const programBlocks = programs.map(renderProgramBlock).join('');
    const evalStatus = evaluation ? `<p class="handoff-print__meta">Completeness status at print: <strong>${escapeHtml(evaluation.label)}</strong></p>` : '';

    const inner = `
      <h1>Handoff packet</h1>
      <p class="handoff-print__meta">Generated ${escapeHtml(generated)} • ViableMHR neutral directory</p>
      <div class="handoff-print__disclaimer">${escapeHtml(copy.disclaimer || '')}</div>
      ${evalStatus}
      ${programBlocks}
      ${renderCareLevelBlock(copy)}
      ${renderCallScriptBlock(copy)}
      ${renderBackupPlanSection(copy)}
      ${renderCrisisBlock(copy)}
      <p class="handoff-print__footer">${escapeHtml(copy.footer || '')}</p>
    `;

    return `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Handoff packet — ViableMHR</title>
          <link rel="stylesheet" href="${escapeHtml(window.location.origin)}/phase1-design.css">
          <style>
            body { background: #fff; }
          </style>
        </head>
        <body class="handoff-print">
          ${inner}
          <p class="handoff-print__noprint" style="text-align:center; margin-top: 20px;">
            <button type="button" onclick="window.print()" style="padding:10px 20px; font-size:14px; cursor:pointer;">Print this packet</button>
          </p>
        </body>
      </html>
    `;
  }

  function recordExport(programs, evaluation) {
    if (!window.VMHRProEvents || typeof window.VMHRProEvents.record !== 'function') return;
    const hadStale = !!(evaluation && evaluation.checks && evaluation.checks.stalePrograms && evaluation.checks.stalePrograms.length > 0);
    window.VMHRProEvents.record('handoff_export', {
      program_count: programs.length,
      had_stale: hadStale,
    });
    if (window.VMHRHandoffCompleteness) {
      window.VMHRProEvents.record('handoff_completeness_status', {
        status: window.VMHRHandoffCompleteness.statusToAnalyticsToken(evaluation && evaluation.status),
      });
    }
  }

  /**
   * Open the handoff packet in a new window/tab.
   * @param {Array<Object>} programs - up to 3 programs
   */
  function openPacket(programs) {
    const list = Array.isArray(programs) ? programs.filter(Boolean) : [];
    if (!list.length) {
      if (typeof window.showToast === 'function') {
        const toast = document.getElementById('toast');
        if (toast) window.showToast('Add at least one program to the compare set first.', 'error', toast);
      }
      return;
    }

    const evaluation = window.VMHRHandoffCompleteness
      ? window.VMHRHandoffCompleteness.evaluatePacket(list)
      : null;

    loadHandoffCopy().then((copy) => {
      const html = renderDocument(list, copy, evaluation);
      const w = window.open('', '_blank', 'noopener,noreferrer');
      if (!w) {
        if (typeof window.showToast === 'function') {
          const toast = document.getElementById('toast');
          if (toast) window.showToast('Pop-up blocked. Allow pop-ups to open the handoff packet.', 'error', toast);
        }
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      recordExport(list, evaluation);
    });
  }

  window.VMHRHandoffPrint = {
    openPacket,
    loadHandoffCopy,
  };
})();
