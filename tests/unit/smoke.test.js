import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programCanonicalUrl } from '../../scripts/render-program-detail.js';

test('programCanonicalUrl returns the extensionless canonical program URL', () => {
  assert.equal(programCanonicalUrl('abc'), 'https://viablemhr.com/programs/abc');
});
