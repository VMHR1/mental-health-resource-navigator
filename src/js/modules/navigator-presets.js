// ========== Navigator-mode presets (Phase 8) ==========
// Professional discharge / coordinator workflows. Same filter logic, not a new index.

(function () {
  if (typeof window === 'undefined') return;

  const NAVIGATOR_PRESETS = {
    'discharge-iop-dfw': {
      label: 'Post-discharge IOP (DFW)',
      audience: ['discharge', 'facility'],
      description: 'Intensive outpatient programs across the DFW metro for step-down after inpatient care.',
      config: {
        care: 'Intensive Outpatient (IOP)',
        query: '',
      },
    },
    'php-adolescent': {
      label: 'PHP for adolescents',
      audience: ['discharge'],
      description: 'Partial hospitalization or day programs with adolescent service age.',
      config: {
        care: 'Partial Hospitalization (PHP)',
        age: '15',
        query: '',
      },
    },
    'dual-diagnosis-iop': {
      label: 'Co-occurring SUD + MH IOP',
      audience: ['discharge', 'lmha'],
      description: 'Intensive outpatient with substance use focus and co-occurring mental health care.',
      config: {
        care: 'Intensive Outpatient (IOP)',
        serviceDomain: 'substance_use',
        query: '',
      },
    },
    'verified-90d': {
      label: 'Verified within 90 days',
      audience: ['discharge', 'lmha', 'bhops'],
      description: 'Programs with verification refreshed in the last 90 days only.',
      config: {
        verificationRecency: '90',
        query: '',
      },
    },
    'virtual-iop': {
      label: 'Virtual IOP',
      audience: ['discharge', 'school'],
      description: 'Intensive outpatient with virtual or telehealth options.',
      config: {
        care: 'Intensive Outpatient (IOP)',
        onlyVirtual: true,
        query: '',
      },
    },
    'crisis-resources': {
      label: 'Crisis resources',
      audience: ['discharge', 'school'],
      description: 'Crisis-flagged listings in the directory (988 stays primary).',
      config: {
        showCrisis: true,
        query: 'crisis support',
      },
    },
  };

  window.NAVIGATOR_PRESETS = NAVIGATOR_PRESETS;
})();
