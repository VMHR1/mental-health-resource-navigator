import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  insuranceSentence,
  insuranceChipLabels,
  ageFitLine,
  showTransportation,
  callQuestions,
  BASELINE_QUESTIONS,
  TOPIC_QUESTIONS,
} from '../../scripts/program-display.js';

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

test('callQuestions: Crisis Service gets baseline only', () => {
  assert.deepEqual(callQuestions(crisis, new Set()), [...BASELINE_QUESTIONS]);
});

test('callQuestions: missing publishedTopics is treated as empty', () => {
  assert.equal(callQuestions(treatment).length, 7);
});

test('callQuestions: returns a fresh array each call', () => {
  const a = callQuestions(crisis, new Set());
  a.push('mutated');
  assert.equal(callQuestions(crisis, new Set()).length, 2);
});
