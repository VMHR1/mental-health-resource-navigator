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
    // Include per-node targets and check data (for color-contrast: computed
    // fg/bg and the measured ratio). A count alone made CI failures
    // undiagnosable without rerunning axe by hand against a guess.
    const summary = serious
      .map((v) => {
        const nodes = v.nodes
          .map((n) => {
            const d = n.any?.[0]?.data;
            const detail = d && d.contrastRatio !== undefined
              ? ` (fg ${d.fgColor} on bg ${d.bgColor}, ratio ${d.contrastRatio}, needs ${d.expectedContrastRatio})`
              : '';
            return `    ${JSON.stringify(n.target)}${detail}\n      ${n.html.slice(0, 160)}`;
          })
          .join('\n');
        return `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)\n${nodes}`;
      })
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

  test('php programs hub page', async ({ page }) => {
    await page.goto('/php-programs.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'php programs hub');
  });

  test('iop programs hub page', async ({ page }) => {
    await page.goto('/iop-programs.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'iop programs hub');
  });

  test('residential programs hub page', async ({ page }) => {
    await page.goto('/residential-programs.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'residential programs hub');
  });

  test('crisis resources page', async ({ page }) => {
    await page.goto('/crisis-resources.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'crisis resources');
  });

  test('guide: how to search', async ({ page }) => {
    await page.goto('/guide-how-to-search.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'guide how to search');
  });

  test('guide: levels of care', async ({ page }) => {
    await page.goto('/guide-levels-of-care.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'guide levels of care');
  });

  test('guide: what to ask', async ({ page }) => {
    await page.goto('/guide-what-to-ask.html');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'guide what to ask');
  });

  test('directory page', async ({ page }) => {
    await page.goto('/directory');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    assertNoSeriousViolations(results, 'directory');
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
