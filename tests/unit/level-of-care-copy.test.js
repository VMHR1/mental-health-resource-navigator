import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explainerFor } from '../../scripts/level-of-care-copy.js';

const programsUrl = new URL('../../public/data/programs.json', import.meta.url);
const raw = JSON.parse(readFileSync(programsUrl, 'utf8'));
const programs = Array.isArray(raw) ? raw : raw.programs;

// The 10 raw values from the spec's 1.1 table, mapped to their 7 explainers.
const SPEC_TABLE = {
  'Partial Hospitalization (PHP)': 'PHP',
  'Intensive Outpatient (IOP)': 'IOP',
  Residential: 'Residential',
  Outpatient: 'Outpatient',
  'Walk-In Outpatient': 'Outpatient',
  Navigation: 'Navigation',
  'Mobile Crisis': 'Crisis in person',
  'Walk-In Crisis / Urgent': 'Crisis in person',
  'Psychiatric Triage': 'Crisis in person',
  'Crisis Hotline': 'Crisis phone/text',
};

function assertExplainerShape(e, label) {
  assert.ok(e, `${label}: expected an explainer`);
  assert.equal(typeof e.title, 'string', `${label}: title`);
  assert.ok(e.title.trim().length > 0, `${label}: title not empty`);
  assert.equal(typeof e.body, 'string', `${label}: body`);
  // 3–5 sentences.
  const sentences = e.body.split(/(?<=[.!?])\s+/).filter(Boolean);
  assert.ok(sentences.length >= 3 && sentences.length <= 5, `${label}: ${sentences.length} sentences`);
}

test('every level_of_care in programs.json has an explainer', () => {
  const values = new Set(programs.map((p) => p.level_of_care));
  for (const v of values) assertExplainerShape(explainerFor(v), v);
});

test('unknown or missing values return null', () => {
  assert.equal(explainerFor('Made Up'), null);
  assert.equal(explainerFor(undefined), null);
  assert.equal(explainerFor(''), null);
});

test('covers all 10 spec values and groups them into exactly 7 explainers', () => {
  const byGroup = new Map();
  for (const [value, group] of Object.entries(SPEC_TABLE)) {
    const e = explainerFor(value);
    assertExplainerShape(e, value);
    if (byGroup.has(group)) {
      assert.equal(e, byGroup.get(group), `${value} should share the ${group} explainer`);
    } else {
      byGroup.set(group, e);
    }
  }
  assert.equal(new Set(byGroup.values()).size, 7);
});

test('crisis explainers point to 988 and 911', () => {
  for (const v of ['Mobile Crisis', 'Walk-In Crisis / Urgent', 'Psychiatric Triage', 'Crisis Hotline']) {
    const { body } = explainerFor(v);
    assert.match(body, /\b988\b/, `${v}: 988`);
    assert.match(body, /\b911\b/, `${v}: 911`);
  }
});

test('each explainer links to the levels-of-care guide', () => {
  for (const v of Object.keys(SPEC_TABLE)) {
    assert.equal(explainerFor(v).guideHref, '/guide-levels-of-care');
  }
});
