// ========== Report Outdated form (Phase 8) ==========
// Client-side validation, light PHI-like string heuristics, and Formspree POST.

(function () {
  if (typeof window === 'undefined') return;

  const PHI_PATTERNS = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\bmrn\s*[:#-]?\s*\w+/i,
    /\bdob\s*[:#-]?\s*\w+/i,
    /\bdate of birth\b/i,
    /\bdiagnos(?:is|ed)\b/i,
    /\bpatient\b\s+[A-Z][a-z]+/, // "patient John"
  ];

  function safe(x) { return (x == null ? '' : String(x)).trim(); }

  function getField(form, name) {
    return form.querySelector(`[name="${name}"]`);
  }

  function setFieldError(form, name, msg) {
    const field = form.querySelector(`.ro-field[data-field="${name}"]`);
    if (!field) return;
    field.setAttribute('data-invalid', msg ? 'true' : 'false');
    const errorEl = field.querySelector('.ro-error');
    if (errorEl) {
      if (msg) {
        errorEl.textContent = msg;
        errorEl.hidden = false;
      } else {
        errorEl.textContent = '';
        errorEl.hidden = true;
      }
    }
  }

  function clearAllErrors(form) {
    form.querySelectorAll('.ro-field[data-invalid="true"]').forEach((el) => {
      el.setAttribute('data-invalid', 'false');
    });
    form.querySelectorAll('.ro-error').forEach((el) => {
      el.textContent = '';
      el.hidden = true;
    });
  }

  function showStatus(state, message) {
    const status = document.getElementById('ro-status');
    if (!status) return;
    status.textContent = message;
    status.setAttribute('data-state', state);
    status.hidden = false;
  }

  function looksLikePHI(text) {
    return PHI_PATTERNS.some((re) => re.test(text));
  }

  function validate(form) {
    clearAllErrors(form);
    let ok = true;

    const programId = safe((getField(form, 'program_id') || {}).value);
    const programName = safe((getField(form, 'program_name') || {}).value);
    if (!programId && !programName) {
      setFieldError(form, 'program_name', 'Provide a program identifier above or the program / organization name.');
      ok = false;
    }

    const issueType = safe((getField(form, 'issue_type') || {}).value);
    if (!issueType) {
      setFieldError(form, 'issue_type', 'Select an issue type.');
      ok = false;
    }

    const details = safe((getField(form, 'details') || {}).value);
    if (!details) {
      setFieldError(form, 'details', 'Describe what needs to change.');
      ok = false;
    } else if (details.length < 8) {
      setFieldError(form, 'details', 'Please add a little more detail.');
      ok = false;
    } else if (looksLikePHI(details)) {
      setFieldError(form, 'details', 'Looks like patient information. Remove identifiers (DOB, MRN, names, diagnoses) before submitting.');
      ok = false;
    }

    const email = safe((getField(form, 'email') || {}).value);
    if (email) {
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!validEmail) {
        setFieldError(form, 'email', 'Enter a valid email or leave this blank.');
        ok = false;
      }
    }

    return ok;
  }

  function prefillFromUrl(form) {
    let pid = '';
    try {
      pid = new URLSearchParams(window.location.search).get('program_id') || '';
    } catch (_) { /* ignore */ }
    if (pid) {
      const field = getField(form, 'program_id');
      if (field) field.value = pid.slice(0, 120);
    }
    if (window.VMHRProEvents && typeof window.VMHRProEvents.record === 'function') {
      window.VMHRProEvents.record('report_outdated_open', { prefilled_program: !!pid });
    }
  }

  function submitForm(form) {
    const data = new FormData(form);
    const submitBtn = form.querySelector('#ro-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
    }
    fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (response.ok) {
          showStatus('success', 'Thank you. A moderator will review this update.');
          if (window.VMHRProEvents && typeof window.VMHRProEvents.record === 'function') {
            window.VMHRProEvents.record('report_outdated_submit', {
              issue_type: safe(data.get('issue_type')),
              reporter_role: safe(data.get('reporter_role')) || 'unspecified',
            });
          }
          form.reset();
          // Re-apply program_id from URL after reset, since users may want to verify it persisted.
          prefillFromUrl(form);
        } else {
          let detail = '';
          try {
            const json = await response.json();
            detail = json && json.errors && json.errors[0] && json.errors[0].message
              ? json.errors[0].message
              : '';
          } catch (_) { /* ignore */ }
          showStatus('error', detail ? `Could not submit: ${detail}` : 'Could not submit. Please try again or email us.');
        }
      })
      .catch(() => {
        showStatus('error', 'Network error. Please try again or email viablementalhealthresources@gmail.com.');
      })
      .finally(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send report';
        }
      });
  }

  function init() {
    const form = document.getElementById('reportOutdatedForm');
    if (!form) return;
    prefillFromUrl(form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate(form)) return;
      submitForm(form);
    });
  }

  function boot() {
    if (window.VMHRProGate && typeof window.VMHRProGate.runWhenUnlocked === 'function') {
      window.VMHRProGate.runWhenUnlocked(init);
    } else {
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
