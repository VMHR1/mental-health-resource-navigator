import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  openAdvancedFilters,
  openResultsAction,
  revealSearchForTest,
  showAllResults,
  waitForPrograms,
} from './helpers/ui.js';

/** Fail on critical/serious axe violations; log moderate for triage. */
function assertNoSeriousViolations(results, contextLabel) {
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  if (serious.length) {
    const summary = serious
      .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
      .join('\n');
    throw new Error(`[${contextLabel}] axe violations:\n${summary}`);
  }
}

test.describe('Accessibility (axe-core)', () => {
  test('homepage — search revealed', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);
    await revealSearchForTest(page);

    const results = await new AxeBuilder({ page })
      .disableRules(['region'])
      .analyze();
    assertNoSeriousViolations(results, 'homepage search revealed');
  });

  test('homepage — filter tray open (mobile)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'Filter tray is mobile-only');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);
    await revealSearchForTest(page);
    await openAdvancedFilters(page);

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'homepage filter tray');
  });

  test('homepage — favorites modal open', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);

    await openResultsAction(page, 'favorites');
    await expect(page.getByTestId('favorites-modal')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('#favoritesModal')
      .analyze();
    assertNoSeriousViolations(results, 'favorites modal');
  });

  test('guides page', async ({ page }) => {
    await page.goto('/guides.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'guides');
  });

  test('about page', async ({ page }) => {
    await page.goto('/about.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'about');
  });

  test('privacy page', async ({ page }) => {
    await page.goto('/privacy.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'privacy');
  });

  test('submit page', async ({ page }) => {
    await page.goto('/submit.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'submit');
  });

  test('program slug page', async ({ page }) => {
    await page.goto('/programs/crisis-988.html');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#programDetail, .program-detail, main', { timeout: 15000 }).catch(() => {});

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'program slug');
  });

  test('homepage — results grid with cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);
    await showAllResults(page);
    await page.waitForSelector('.card', { timeout: 10000 });
    await page.waitForFunction(
      () => {
        const grid = document.getElementById('treatmentGrid');
        if (!grid) return false;
        if (grid.classList.contains('is-updating')) return false;
        const opacity = parseFloat(getComputedStyle(grid).opacity);
        if (opacity < 0.99) return false;
        const card = grid.querySelector('.card');
        if (!card) return false;
        return parseFloat(getComputedStyle(card).opacity) >= 0.99;
      },
      { timeout: 8000 },
    );
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .include('#treatmentGrid')
      .analyze();
    assertNoSeriousViolations(results, 'results grid');
  });
});
