import { test, expect } from '@playwright/test';
import {
  openAdvancedFilters,
  closeFilterTrayIfOpen,
  showAllResults,
  waitForPrograms,
  clickResetFilters,
  clickFindPrograms,
  revealSearchForTest,
  safeClick,
} from './helpers/ui.js';

async function loadHome(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await waitForPrograms(page);
}

async function ensureResultsUnlocked(page) {
  const unlocked = await page.evaluate(() => document.body.classList.contains('is-results-unlocked'));
  if (!unlocked) {
    await page.getByTestId('browse-all-btn').click();
    await page.waitForTimeout(500);
  }
}

async function getCount(page) {
  await ensureResultsUnlocked(page);
  return Number(await page.locator('#totalCount').textContent());
}

async function getAwaitingCount(page) {
  return Number(await page.locator('#awaitingProgramCount').textContent());
}

async function getProgramNames(page) {
  return page.locator('.card .pname').allTextContents();
}

async function resetFilters(page) {
  await clickResetFilters(page);
}

test.describe('Search & filter localhost audit', () => {
  test('page loads program data without error', async ({ page }) => {
    await loadHome(page);
    const count = await getAwaitingCount(page);
    expect(count).toBeGreaterThan(80);
    await expect(page.locator('#loadWarn')).toHaveText('');
    await expect(page.getByTestId('results-awaiting')).toBeVisible();
  });

  test('baseline shows all treatment programs', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await showAllResults(page);
    const count = await getCount(page);
    expect(count).toBeGreaterThanOrEqual(90);
    expect(count).toBeLessThanOrEqual(100);
  });

  test('advanced filter: location Plano returns expanded results', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await showAllResults(page);
    await openAdvancedFilters(page);
    await page.selectOption('#loc', { label: 'Plano' });
    await page.waitForTimeout(500);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(11);
    const names = await getProgramNames(page);
    expect(names.length).toBeGreaterThan(0);
  });

  test('example: IOP in Frisco age 14 returns results', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await revealSearchForTest(page);
    await safeClick(page.locator('#searchTips summary'), page.locator('#searchSection'));
    await safeClick(page.locator('[data-search-example="IOP in Frisco for 14"]'), page.locator('#searchSection'));
    await clickFindPrograms(page);
    await page.waitForTimeout(600);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(20);
  });

  test('active filter chip removes only that filter', async ({ page }) => {
    await loadHome(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('IOP in Frisco for 14');
    await clickFindPrograms(page);
    await page.waitForTimeout(600);
    expect(await getCount(page)).toBeGreaterThan(0);
    const locRemove = page
      .getByTestId('remove-filter-location')
      .or(page.getByTestId('remove-filter-parsedLocation'));
    await expect(locRemove).toBeVisible();
    const chipsBefore = await page.locator('[data-testid="active-filter-chips"] .active-filter-chip').count();
    await locRemove.click();
    await page.waitForTimeout(600);
    await expect(page.getByTestId('search-input')).not.toHaveValue(/Frisco/i);
    await expect(page.locator('#loc')).toHaveValue('');
    await expect(locRemove).toBeHidden();
    const chipsAfter = await page.locator('[data-testid="active-filter-chips"] .active-filter-chip').count();
    expect(chipsAfter).toBe(chipsBefore - 1);
    await expect(page.getByTestId('search-input')).not.toHaveValue('');
    await expect(page.getByTestId('remove-filter-care').or(page.getByTestId('remove-filter-parsedCare'))).toBeVisible();
  });

  test('search tips and example chips are available', async ({ page }) => {
    await loadHome(page);
    await revealSearchForTest(page);
    const tips = page.locator('#searchTips');
    await expect(tips).toBeAttached();
    await safeClick(tips.locator('summary'), page.locator('#searchSection'));
    await expect(page.getByTestId('search-examples')).toBeVisible();
    await safeClick(page.locator('[data-search-example="IOP in Plano"]'), page.locator('#searchSection'));
    await page.waitForTimeout(600);
    await expect(page.getByTestId('search-input')).toHaveValue('IOP in Plano');
    await clickFindPrograms(page);
    await page.waitForTimeout(600);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(50);
  });

  test('smart search: IOP in Plano parses and filters', async ({ page }) => {
    await loadHome(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('IOP in Plano');
    await clickFindPrograms(page);
    await page.waitForTimeout(600);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(50);
    const chips = page.locator('[data-testid="active-filter-chips"] .active-filter-chip-label');
    const chipTexts = await chips.allTextContents();
    const combined = chipTexts.join(' ').toLowerCase();
    expect(combined).toMatch(/plano|iop|location|care/i);
  });

  test('smart search: crisis enables crisis resources', async ({ page }) => {
    await loadHome(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('crisis support');
    await page.waitForTimeout(400);
    await expect(page.locator('#showCrisisTop')).toBeChecked({ timeout: 3000 });
  });

  test('preset: IOP programs (no city)', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await safeClick(page.locator('[data-preset="iop-programs"]').first(), page.locator('#searchSection'));
    await clickFindPrograms(page);
    await page.waitForTimeout(600);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    await expect(page.locator('#loc')).toHaveValue('');
    await expect(page.locator('#care')).toHaveValue('Intensive Outpatient (IOP)');
  });

  test('preset: Youth & teens (no city)', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await safeClick(page.locator('[data-preset="youth-teens"]').first(), page.locator('#searchSection'));
    await clickFindPrograms(page);
    await page.waitForTimeout(600);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    await expect(page.locator('#loc')).toHaveValue('');
    await expect(page.locator('#age')).toHaveValue('15');
  });

  test('preset: Virtual therapy', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await safeClick(page.locator('[data-preset="virtual-therapy"]'), page.locator('#searchSection'));
    await clickFindPrograms(page);
    await page.waitForTimeout(600);
    await expect(page.locator('#onlyVirtual')).toBeChecked();
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(20);
  });

  test('insurance bucket: Medicaid / CHIP', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await showAllResults(page);
    await openAdvancedFilters(page);
    await page.selectOption('#insurance', { label: 'Medicaid / CHIP' });
    await page.waitForTimeout(500);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(90);
  });

  test('smart search: accepts Medicaid', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('accepts Medicaid');
    await clickFindPrograms(page);
    await page.waitForTimeout(700);
    await showAllResults(page);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(90);
    await expect(page.locator('[data-testid="active-filter-chips"]')).toContainText(/Medicaid/i);
  });

  test('smart search: accepts Cigna', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('accepts Cigna');
    await clickFindPrograms(page);
    await page.waitForTimeout(700);
    await showAllResults(page);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(20);
    await expect(page.locator('[data-testid="active-filter-chips"]')).toContainText(/Cigna/i);
  });

  test('smart search: BCBS shorthand', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('accepts BCBS');
    await clickFindPrograms(page);
    await page.waitForTimeout(700);
    await showAllResults(page);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(20);
    await expect(page.locator('[data-testid="active-filter-chips"]')).toContainText(/Blue Cross Blue Shield/i);
  });

  test('smart search: BHS shorthand', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('accepts BHS');
    await clickFindPrograms(page);
    await page.waitForTimeout(700);
    await showAllResults(page);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(5);
    await expect(page.locator('[data-testid="active-filter-chips"]')).toContainText(/Behavioral Health Systems/i);
  });

  test('care level PHP filter', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await showAllResults(page);
    await openAdvancedFilters(page);
    await page.selectOption('#care', 'Partial Hospitalization (PHP)');
    await page.waitForTimeout(500);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(20);
    const names = await getProgramNames(page);
    expect(names.length).toBeGreaterThan(0);
  });

  test('org search: Children\'s Health', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill("Children's Health");
    await clickFindPrograms(page);
    await page.waitForTimeout(500);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(15);
  });

  test('active filter chips appear and clear', async ({ page }) => {
    await loadHome(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('IOP Plano');
    await page.waitForTimeout(400);
    const chips = page.locator('[data-testid="active-filter-chips"]');
    await expect(chips).toBeVisible();
    const removeBtn = chips.locator('.active-filter-chip-remove').first();
    if (await removeBtn.count()) {
      await removeBtn.click();
      await page.waitForTimeout(400);
    }
  });

  test('reset returns to full baseline count', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    const baseline = await getCount(page);
    await page.getByTestId('search-input').fill('IOP in Plano');
    await clickFindPrograms(page);
    await page.waitForTimeout(700);
    expect(await getCount(page)).toBeLessThan(baseline);
    await clickResetFilters(page);
    await expect(page.getByTestId('results-awaiting')).toBeVisible();
    await showAllResults(page);
    expect(await getCount(page)).toBe(baseline);
    await expect(page.getByTestId('active-filter-chips')).toBeHidden();
  });

  test('empty state shows context and broaden increases results', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await showAllResults(page);
    await openAdvancedFilters(page);
    await page.selectOption('#care', 'Partial Hospitalization (PHP)');
    await page.selectOption('#insurance', { label: 'Beacon' });
    await page.selectOption('#loc', 'Houston');
    await page.waitForTimeout(700);
    await closeFilterTrayIfOpen(page);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.locator('#emptyStateBody')).toContainText(/Beacon|PHP|Houston|Location|Care|Insurance/i);
    await page.getByTestId('empty-broaden-search').click();
    await page.waitForTimeout(700);
    const afterBroaden = await getCount(page);
    expect(afterBroaden).toBeGreaterThan(0);
  });

  test('empty state clear filters restores baseline', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    const baseline = await getCount(page);
    await openAdvancedFilters(page);
    await page.selectOption('#care', 'Partial Hospitalization (PHP)');
    await page.selectOption('#insurance', { label: 'Beacon' });
    await page.selectOption('#loc', 'Houston');
    await page.waitForTimeout(700);
    await closeFilterTrayIfOpen(page);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.getByTestId('empty-clear-filters').click();
    await page.waitForTimeout(600);
    expect(await getCount(page)).toBe(baseline);
  });

  test('crisis toggle shows crisis programs', async ({ page }) => {
    await loadHome(page);
    await showAllResults(page);
    await resetFilters(page);
    await showAllResults(page);
    await page.locator('#showCrisisTop').check();
    await page.waitForTimeout(500);
    await expect(page.locator('#sectionTitle')).toContainText(/crisis/i);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(10);
  });
});
