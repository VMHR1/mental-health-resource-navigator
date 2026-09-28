import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  insuranceSentence,
  insuranceDisplayNote,
  insuranceChipLabels,
  insurancePlanNames,
  ageFitLine,
  showTransportation,
  callQuestions,
  BASELINE_QUESTIONS,
  TOPIC_QUESTIONS,
} from '../../scripts/program-display.js';

// --- insuranceDisplayNote (spec 1.2, crisis rewording) ----------------------

test('insuranceDisplayNote: rewords the crisis "not billed" literal', () => {
  assert.equal(
    insuranceDisplayNote({ insurance_notes: 'N/A (not an insurance-billed service)' }),
    'Not billed to insurance',
  );
});

test('insuranceDisplayNote: passes any other sentence through unchanged', () => {
  const p = { insurance_notes: 'Plans: Aetna | Types: Commercial | Call to verify plan.' };
  assert.equal(insuranceDisplayNote(p), 'Call to verify plan.');
  assert.equal(insuranceDisplayNote({}), '');
});

// --- insuranceSentence (spec 1.2) -------------------------------------------

test('insuranceSentence: strips Plans/Types scaffolding, keeps free text', () => {
  const p = {
    insurance_notes:
      'Plans: Most major insurance providers (in-network) | Types: Commercial (most major), Out-of-network sometimes possible | Carrollton Springs states it is in-network with most major insurers; call to confirm coverage.',
  };
  assert.equal(
    insuranceSentence(p),
    'Carrollton Springs states it is in-network with most major insurers; call to confirm coverage.',
  );
});

test('insuranceSentence: prefers accepted_insurance.notes when present', () => {
  const p = {
    insurance_notes: 'Plans: Aetna, Cigna | Types: Commercial | Old free text.',
    accepted_insurance: { notes: '  Reflections shows major insurer networks on its site.  ' },
  };
  assert.equal(insuranceSentence(p), 'Reflections shows major insurer networks on its site.');
});

test('insuranceSentence: blank accepted_insurance.notes falls back to insurance_notes', () => {
  const p = {
    insurance_notes: 'Plans: Aetna | Types: Commercial | Call to verify plan.',
    accepted_insurance: { notes: '   ' },
  };
  assert.equal(insuranceSentence(p), 'Call to verify plan.');
});

test('insuranceSentence: segments reordered or missing', () => {
  assert.equal(
    insuranceSentence({ insurance_notes: 'Types: Commercial | Plans: Aetna | Hours vary. Call to verify.' }),
    'Hours vary. Call to verify.',
  );
  assert.equal(
    insuranceSentence({ insurance_notes: 'Types: Commercial, Medicaid | Confirm with admissions.' }),
    'Confirm with admissions.',
  );
});

test('insuranceSentence: returns empty string when only scaffolding remains', () => {
  assert.equal(insuranceSentence({ insurance_notes: 'Plans: Aetna, TRICARE | Types: Commercial, Military (TRICARE)' }), '');
  assert.equal(insuranceSentence({ insurance_notes: 'Plans: Blue Cross Blue Shield, Beacon (per location page; list changes—verify).' }), '');
  assert.equal(insuranceSentence({ insurance_notes: '' }), '');
  assert.equal(insuranceSentence({}), '');
  assert.equal(insuranceSentence({ insurance_notes: null, accepted_insurance: null }), '');
});

test('insuranceSentence: plain free-text notes pass through unchanged', () => {
  const text = 'Insurance not listed on public website; call 469-940-6900 to verify coverage and benefits.';
  assert.equal(insuranceSentence({ insurance_notes: text }), text);
});

test('insuranceSentence: joins multiple free-text segments', () => {
  assert.equal(
    insuranceSentence({ insurance_notes: 'Plans: Aetna | Does not accept Oscar. | TRICARE may require referral.' }),
    'Does not accept Oscar. TRICARE may require referral.',
  );
});

// --- insuranceChipLabels (spec 1.2, controller ruling) ----------------------

test('insuranceChipLabels: maps structured categories in fixed order', () => {
  assert.deepEqual(
    insuranceChipLabels({ insurance_categories: ['tricare', 'medicare', 'medicaid_chip', 'commercial'] }),
    ['Commercial', 'Medicaid/CHIP', 'TRICARE', 'Medicare'],
  );
  assert.deepEqual(insuranceChipLabels({ insurance_categories: ['commercial', 'tricare'] }), ['Commercial', 'TRICARE']);
});

test('insuranceChipLabels: ignores unknown values and duplicates; missing field is []', () => {
  assert.deepEqual(insuranceChipLabels({ insurance_categories: ['bogus', 'medicaid_chip', 'medicaid_chip'] }), [
    'Medicaid/CHIP',
  ]);
  assert.deepEqual(insuranceChipLabels({}), []);
  assert.deepEqual(insuranceChipLabels({ insurance_categories: null }), []);
  assert.deepEqual(insuranceChipLabels({ insurance_categories: 'commercial' }), []);
});

// --- ageFitLine (spec 1.3) --------------------------------------------------

test('ageFitLine: min only', () => {
  assert.equal(ageFitLine({ age_min: 11, ages_served: '11+' }), 'Serves ages 11 and up');
});

test('ageFitLine: min and max use an en dash', () => {
  assert.equal(ageFitLine({ age_min: 12, age_max: 17, ages_served: '12-17' }), 'Serves ages 12–17');
});

test('ageFitLine: min equals max', () => {
  assert.equal(ageFitLine({ age_min: 17, age_max: 17 }), 'Serves age 17');
});

test('ageFitLine: max only, and zero minimum', () => {
  assert.equal(ageFitLine({ age_max: 17 }), 'Serves ages 17 and under');
  assert.equal(ageFitLine({ age_min: 0, age_max: 17 }), 'Serves ages 17 and under');
  assert.equal(ageFitLine({ age_min: 0, ages_served: 'All ages' }), 'Serves all ages');
});

test('ageFitLine: falls back to ages_served free text', () => {
  assert.equal(ageFitLine({ ages_served: 'Children & adolescents' }), 'Ages served: Children & adolescents');
});

test('ageFitLine: unknown ages', () => {
  const expected = 'Ages served not published — ask when you call.';
  assert.equal(ageFitLine({ ages_served: 'Unknown' }), expected);
  assert.equal(ageFitLine({ ages_served: '  unknown ' }), expected);
  assert.equal(ageFitLine({}), expected);
});

// --- showTransportation (spec 1.5) ------------------------------------------

test('showTransportation: hides Unknown and N/A, shows Yes', () => {
  assert.equal(showTransportation({ transportation_available: 'Unknown' }), false);
  assert.equal(showTransportation({ transportation_available: 'N/A' }), false);
  assert.equal(showTransportation({ transportation_available: 'Yes' }), true);
});

test('showTransportation: hides missing or blank values', () => {
  assert.equal(showTransportation({}), false);
  assert.equal(showTransportation({ transportation_available: '  ' }), false);
  assert.equal(showTransportation({ transportation_available: ' unknown ' }), false);
});

// --- callQuestions (spec 1.4) -----------------------------------------------

const treatment = { entry_type: 'Treatment Program' };
const crisis = { entry_type: 'Crisis Service' };
const TOPICS = ['conditions', 'schedule', 'family', 'school', 'admission'];

test('callQuestions: exposes 2 baseline and 5 topic questions', () => {
  assert.equal(BASELINE_QUESTIONS.length, 2);
  assert.deepEqual(Object.keys(TOPIC_QUESTIONS), TOPICS);
  for (const q of [...BASELINE_QUESTIONS, ...Object.values(TOPIC_QUESTIONS)]) {
    assert.match(q, /^[A-Z].*\?$/, `one plain question: ${q}`);
  }
});

test('callQuestions: Treatment Program with no published facts gets everything', () => {
  assert.deepEqual(callQuestions(treatment, new Set()), [
    ...BASELINE_QUESTIONS,
    ...TOPICS.map((t) => TOPIC_QUESTIONS[t]),
  ]);
});

test('callQuestions: a published topic drops its question', () => {
  const qs = callQuestions(treatment, new Set(['schedule']));
  assert.equal(qs.length, 6);
  assert.ok(!qs.includes(TOPIC_QUESTIONS.schedule));
  assert.ok(qs.includes(TOPIC_QUESTIONS.family));
  assert.ok(BASELINE_QUESTIONS.every((q) => qs.includes(q)));
});

test('callQuestions: all topics published leaves baseline only', () => {
  assert.deepEqual(callQuestions(treatment, new Set(TOPICS)), [...BASELINE_QUESTIONS]);
});

test('callQuestions: Crisis Service gets no questions at all', () => {
  assert.deepEqual(callQuestions(crisis, new Set()), []);
});

test('callQuestions: any non-Treatment entry type (or none) gets no questions', () => {
  assert.deepEqual(callQuestions({ entry_type: 'Navigation' }), []);
  assert.deepEqual(callQuestions({}), []);
  assert.deepEqual(callQuestions(null), []);
});

test('callQuestions: missing publishedTopics is treated as empty', () => {
  assert.equal(callQuestions(treatment).length, 7);
});

test('callQuestions: returns a fresh array each call', () => {
  const a = callQuestions(treatment, new Set());
  a.push('mutated');
  assert.equal(callQuestions(treatment, new Set()).length, 7);
  const c = callQuestions(crisis, new Set());
  c.push('mutated');
  assert.deepEqual(callQuestions(crisis, new Set()), []);
});

// --- insurancePlanNames (Ruling 10: named plans under the chips) ------------

test('insurancePlanNames: prefers accepted_insurance.plans_raw (website spelling)', () => {
  const p = {
    accepted_insurance: {
      plans: ['Champva', 'Medicaid'],
      plans_raw: ['ChampVA', 'Molina Medicaid'],
    },
    insurance_notes: 'Plans: Something Else | Types: Commercial',
  };
  assert.deepEqual(insurancePlanNames(p), ['ChampVA', 'Molina Medicaid']);
});

test('insurancePlanNames: falls back to accepted_insurance.plans when plans_raw is missing or empty', () => {
  const plans = ['Aetna', 'Cigna'];
  assert.deepEqual(insurancePlanNames({ accepted_insurance: { plans } }), plans);
  assert.deepEqual(insurancePlanNames({ accepted_insurance: { plans, plans_raw: [] } }), plans);
});

test('insurancePlanNames: parses the Plans: segment of insurance_notes when no array exists', () => {
  const p = { insurance_notes: 'Plans: Aetna, Cigna ,, Humana | Types: Commercial | Call to verify.' };
  assert.deepEqual(insurancePlanNames(p), ['Aetna', 'Cigna', 'Humana']);
});

test('insurancePlanNames: does not split on commas inside parentheses', () => {
  const p = {
    insurance_notes:
      'Plans: Aetna, UnitedHealthcare (incl. UMR, All Savers, etc.), Humana | Types: Commercial',
  };
  assert.deepEqual(insurancePlanNames(p), ['Aetna', 'UnitedHealthcare (incl. UMR, All Savers, etc.)', 'Humana']);
});

test('insurancePlanNames: trims, drops empties and case-insensitive duplicates', () => {
  const p = { accepted_insurance: { plans_raw: [' Aetna ', '', 'aetna', 'Cigna', null, 'Cigna'] } };
  assert.deepEqual(insurancePlanNames(p), ['Aetna', 'Cigna']);
});

test('insurancePlanNames: drops generic "Most …" / "See …" phrases that are not plan names', () => {
  assert.deepEqual(
    insurancePlanNames({ accepted_insurance: { plans_raw: ['Most major insurance providers (in-network)'] } }),
    [],
  );
  assert.deepEqual(
    insurancePlanNames({ insurance_notes: 'Plans: Most major commercial insurance, Medicaid | Types: Commercial' }),
    ['Medicaid'],
  );
  assert.deepEqual(
    insurancePlanNames({
      accepted_insurance: {
        plans: ['Medicare'],
        plans_raw: ["See Texas Health 'Insurance Plans Accepted' list (many commercial, Medicare Advantage, and Medicaid/CHIP plans)"],
      },
    }),
    [],
    'a lossy normalized `plans` must not stand in for a generic raw entry',
  );
});

test('insurancePlanNames: [] when nothing is published', () => {
  assert.deepEqual(insurancePlanNames({}), []);
  assert.deepEqual(insurancePlanNames(null), []);
  assert.deepEqual(insurancePlanNames({ insurance_notes: 'N/A (not an insurance-billed service)' }), []);
  assert.deepEqual(insurancePlanNames({ insurance_notes: 'Types: Commercial | Call.' }), []);
});
