/**
 * Program page content (spec docs/superpowers/specs/2026-09-27-program-page-content-design.md,
 * Phase 1): level-of-care explainer, insurance chips + readable sentence,
 * age-fit line, hidden unknown transportation, and "Questions to ask when you
 * call". Runs against the built dist/ — `rm -rf dist && npm run build` first.
 *
 * Two render paths are covered:
 *  - prerendered /programs/{id} pages (scripts/render-program-detail.js), and
 *  - the client fallback program.html?id={id} (src/js/program-detail.js),
 *    which only gets the insurance, age and transportation changes (spec 2.5).
 */
import { test, expect } from '@playwright/test';

const PHP_ID = 'php-changes-frisco';

/** The value cell of the grid row whose label is exactly `labelText`. */
function rowValue(page, labelText) {
  return page
    .locator('#programDetail .program-detail-label', { hasText: new RegExp(`^${labelText}$`) })
    .locator('xpath=following-sibling::div[contains(@class,"program-detail-value")][1]');
}

test.describe('prerendered program pages', () => {
  test('PHP page shows explainer, insurance chips, age line and call questions', async ({ page }) => {
    await page.goto(`/programs/${PHP_ID}`);
    const root = page.locator('#programDetail [data-prerendered="true"]');
    await expect(root).toHaveCount(1);

    // 1.1 level-of-care explainer, with a link to the levels-of-care guide.
    const explainer = page.locator('.program-detail-explainer');
    await expect(explainer.getByRole('heading', { name: 'What PHP means for your family' })).toBeVisible();
    await expect(explainer.getByRole('link', { name: /levels of care/i })).toHaveAttribute('href', '/guide-levels-of-care');

    // 1.2 insurance chips + readable sentence, never the raw pipe-delimited note.
    const insurance = page.locator('.program-detail-insurance');
    await expect(insurance.locator('.program-detail-chip')).toHaveText(['Commercial']);
    await expect(insurance).toContainText('in-network with most major insurers');
    expect(await insurance.textContent()).not.toContain('|');
    expect(await insurance.textContent()).not.toMatch(/Plans:|Types:/);

    // 1.3 age-fit line.
    await expect(rowValue(page, 'Ages Served')).toHaveText('Serves ages 11 and up');

    // 1.4 questions list (Treatment Program: baseline + all topic questions).
    const questions = page.locator('.program-detail-questions');
    await expect(questions.getByRole('heading', { name: 'Questions to ask when you call' })).toBeVisible();
    await expect(questions.locator('li')).toHaveCount(7);
    await expect(questions.locator('li').first()).toHaveText('Do you have openings right now, or is there a waitlist?');

    // Section order: explainer right after Program Information, questions right before Verification.
    const headings = await root.locator(':scope > .program-detail-section > h2').allTextContents();
    const at = (t) => headings.indexOf(t);
    expect(at('What PHP means for your family')).toBe(at('Program Information') + 1);
    expect(at('Questions to ask when you call')).toBe(at('Verification') - 1);
  });

  test('crisis page reads "Not billed to insurance" and shows only baseline questions', async ({ page }) => {
    await page.goto('/programs/crisis-mcot-ntbha');
    const insurance = page.locator('.program-detail-insurance');
    await expect(insurance).toHaveText('Not billed to insurance');
    await expect(page.locator('.program-detail-questions li')).toHaveCount(2);
    await expect(page.locator('.program-detail-explainer h2')).toHaveText('What in-person crisis care means for your family');
  });

  test('no page renders an Unknown/N/A transportation row or a pipe in insurance', async ({ page }) => {
    // Unknown, N/A (crisis), Unknown (walk-in crisis), N/A (hotline), Unknown (IOP).
    const hidden = [PHP_ID, 'crisis-mcot-ntbha', 'crisis-walkin-metrocare', 'crisis-988', 'iop-childrens-sparc-dallas'];
    for (const id of hidden) {
      await page.goto(`/programs/${id}`);
      await expect(page.locator('#programDetail .program-detail-title')).toBeVisible();
      await expect(page.locator('#programDetail .program-detail-label', { hasText: /^Transportation$/ })).toHaveCount(0);
      expect(await page.locator('.program-detail-insurance').textContent()).not.toContain('|');
    }

    // "Yes" still renders as before.
    await page.goto('/programs/php-carrus-frisco');
    await expect(rowValue(page, 'Transportation')).toHaveText('Yes');
  });
});

test.describe('client fallback (program.html?id=)', () => {
  test('shows age line, readable insurance, hides unknown transportation; no prerender-only sections', async ({ page }) => {
    await page.goto(`/program.html?id=${PHP_ID}`);
    await expect(page.locator('#programDetail .program-detail-title')).toBeVisible();
    // Proves this is the client-rendered path, not a prerendered page.
    await expect(page.locator('#programDetail [data-prerendered="true"]')).toHaveCount(0);

    await expect(rowValue(page, 'Ages Served')).toHaveText('Serves ages 11 and up');

    const insurance = page.locator('.program-detail-insurance');
    await expect(insurance.locator('.program-detail-chip')).toHaveText(['Commercial']);
    await expect(insurance).toContainText('in-network with most major insurers');
    expect(await insurance.textContent()).not.toContain('|');

    await expect(page.locator('#programDetail .program-detail-label', { hasText: /^Transportation$/ })).toHaveCount(0);

    // Spec 2.5: explainer and questions are prerender-only.
    await expect(page.locator('.program-detail-explainer')).toHaveCount(0);
    await expect(page.locator('.program-detail-questions')).toHaveCount(0);
  });

  test('crisis fallback reads "Not billed to insurance"', async ({ page }) => {
    await page.goto('/program.html?id=crisis-mcot-ntbha');
    await expect(page.locator('#programDetail .program-detail-title')).toBeVisible();
    await expect(page.locator('.program-detail-insurance')).toHaveText('Not billed to insurance');
  });
});
