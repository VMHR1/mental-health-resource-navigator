// ========== Intake Confidence Layer (Phase 9C) ==========
// Renders phone labels and verification-tier confidence pills for program cards,
// workspace cards, and the printed packet.
// No PHI. Provider-public data only.

(function () {
  if (typeof window === 'undefined') return;

  function safe(x) {
    return (x == null ? '' : String(x)).trim();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Human-readable label for a phone-labels key
  const PHONE_KEY_LABELS = {
    intake:     'Intake',
    admissions: 'Admissions',
    main:       'Main line',
    crisis:     'Crisis line',
    billing:    'Billing',
    fax:        'Fax',
  };

  // Confidence tier human labels and CSS modifiers
  const TIER_META = {
    provider_attestation: { label: 'Provider-confirmed', mod: 'provider' },
    phone_confirmed:      { label: 'Phone-confirmed',    mod: 'phone' },
    website_confirmed:    { label: 'Website-confirmed',  mod: 'website' },
    unconfirmed:          { label: 'Unconfirmed',        mod: 'unconfirmed' },
  };

  /**
   * Build an array of { key, number, label, confidence } rows for a program's phones.
   * Priority: phone_labels > intake_phone > phone (as "main line").
   */
  function buildPhoneRows(program) {
    const rows = [];
    const tier = safe(program.verification_tier) || 'unconfirmed';
    const tierInfo = TIER_META[tier] || TIER_META.unconfirmed;

    // Structured phone_labels object
    if (program.phone_labels && typeof program.phone_labels === 'object') {
      Object.entries(program.phone_labels).forEach(([key, num]) => {
        const number = safe(num);
        if (!number) return;
        rows.push({
          key,
          number,
          label: PHONE_KEY_LABELS[key] || key,
          confidence: tierInfo,
          isCrisis: key === 'crisis',
        });
      });
    }

    // Dedicated intake_phone field if not already in phone_labels
    const intakePhone = safe(program.intake_phone);
    if (intakePhone && !rows.some((r) => r.key === 'intake' || r.key === 'admissions')) {
      rows.push({ key: 'intake', number: intakePhone, label: 'Intake', confidence: tierInfo, isCrisis: false });
    }

    // Fallback: main phone field
    const mainPhone = safe(program.phone);
    if (mainPhone && !rows.some((r) => r.number === mainPhone)) {
      rows.push({ key: 'main', number: mainPhone, label: 'Main line', confidence: tierInfo, isCrisis: false });
    }

    return rows;
  }

  /**
   * Render HTML for a phone block inside a workspace card or packet.
   * Returns empty string when no phone is listed.
   */
  function renderPhoneBlock(program, { showConfidence = true, compact = false } = {}) {
    const rows = buildPhoneRows(program);
    if (!rows.length) {
      return `<span class="phone-unlabeled">No phone listed — confirm directly</span>`;
    }

    const lines = rows.map((row) => {
      const crisisNote = row.isCrisis ? ' — call 988 first for crisis' : '';
      const confidencePill = showConfidence
        ? `<span class="confidence-pill confidence-pill--${escapeHtml(row.confidence.mod)}" title="${escapeHtml(row.confidence.label)}">${escapeHtml(row.confidence.label)}</span>`
        : '';
      if (compact) {
        return `${escapeHtml(row.label)}: <a href="tel:${escapeHtml(row.number.replace(/\s/g, ''))}">${escapeHtml(row.number)}</a>${crisisNote}`;
      }
      return `
        <div class="wpc-phone-line">
          <span class="phone-label-pill">${escapeHtml(row.label)}</span>
          <a href="tel:${escapeHtml(row.number.replace(/\s/g, ''))}">${escapeHtml(row.number)}</a>
          ${confidencePill}
          ${crisisNote ? `<span style="font-size:11px; color:var(--muted);">${escapeHtml(crisisNote)}</span>` : ''}
        </div>`;
    }).join('');

    return compact ? `<div class="wpc-phone compact">${lines}</div>` : `<div class="wpc-phone">${lines}</div>`;
  }

  /**
   * Render a short "verify before calling" notice when the program has no labeled intake.
   */
  function renderVerifyNotice(program) {
    const rows = buildPhoneRows(program);
    const hasIntake = rows.some((r) => r.key === 'intake' || r.key === 'admissions');
    if (hasIntake) return '';
    return `<p class="intake-verify-notice" role="note">Intake phone not labeled — confirm whether the listed number is intake, main reception, or crisis before handing off.</p>`;
  }

  /**
   * Render a confidence badge for the program's overall verification tier.
   */
  function renderVerificationTierBadge(program) {
    const tier = safe(program.verification_tier) || 'unconfirmed';
    const meta = TIER_META[tier] || TIER_META.unconfirmed;
    return `<span class="confidence-pill confidence-pill--${escapeHtml(meta.mod)}">${escapeHtml(meta.label)}</span>`;
  }

  window.VMHRIntakeConfidence = {
    buildPhoneRows,
    renderPhoneBlock,
    renderVerifyNotice,
    renderVerificationTierBadge,
    TIER_META,
    PHONE_KEY_LABELS,
  };
})();
