import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

async function waitForPrograms(page) {
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#loadWarn')).not.toContainText(/unable to load/i, { timeout: 15000 });
  await page.waitForFunction(
    () => {
      const n = document.getElementById('totalCount')?.textContent?.trim();
      return n && n !== '…' && n !== '0' && !Number.isNaN(Number(n));
    },
    { timeout: 15000 }
  );
}

async function getCount(page) {
  return Number(await page.locator('#totalCount').textContent());
}

async function getProgramNames(page) {
  return page.locator('.card .pname').allTextContents();
}

async function resetFilters(page) {
  await page.getByTestId('reset-btn').click();
  await page.waitForTimeout(400);
}

test.describe('Search & filter localhost audit', () => {
  test('page loads program data without error', async ({ page }) => {
    await waitForPrograms(page);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(80);
    await expect(page.locator('#loadWarn')).toHaveText('');
  });

  test('baseline shows all treatment programs', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    const count = await getCount(page);
    expect(count).toBeGreaterThanOrEqual(90);
    expect(count).toBeLessThanOrEqual(100);
  });

  test('advanced filter: location Plano returns expanded results', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('advanced-filters-btn').click();
    await page.selectOption('#loc', { label: 'Plano' });
    await page.waitForTimeout(500);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(11);
    const names = await getProgramNames(page);
    expect(names.length).toBeGreaterThan(0);
  });

  test('search tips and example chips are available', async ({ page }) => {
    await waitForPrograms(page);
    const tips = page.locator('#searchTips');
    await expect(tips).toBeAttached();
    await tips.locator('summary').click();
    await expect(page.getByTestId('search-examples')).toBeVisible();
    await page.locator('[data-search-example="IOP in Plano"]').click();
    await page.waitForTimeout(600);
    await expect(page.getByTestId('search-input')).toHaveValue('IOP in Plano');
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(50);
  });

  test('smart search: IOP in Plano parses and filters', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('IOP in Plano');
    await page.getByTestId('find-programs-btn').click();
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
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('crisis support');
    await page.waitForTimeout(400);
    await expect(page.locator('#showCrisisTop')).toBeChecked({ timeout: 3000 });
  });

  test('preset: IOP in Plano', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.locator('[data-preset="iop-plano"]').click();
    await page.waitForTimeout(600);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    await expect(page.locator('#loc')).toHaveValue('Plano');
    await expect(page.locator('#care')).toHaveValue('Intensive Outpatient (IOP)');
  });

  test('preset: Teens in Dallas', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.locator('[data-preset="teens-dallas"]').click();
    await page.waitForTimeout(600);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    await expect(page.locator('#loc')).toHaveValue('Dallas');
  });

  test('preset: Virtual therapy', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.locator('[data-preset="virtual-therapy"]').click();
    await page.waitForTimeout(600);
    await expect(page.locator('#onlyVirtual')).toBeChecked();
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(20);
  });

  test('insurance bucket: Medicaid / CHIP', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('advanced-filters-btn').click();
    await page.selectOption('#insurance', { label: 'Medicaid / CHIP' });
    await page.waitForTimeout(500);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(90);
  });

  test('smart search: accepts Medicaid', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('accepts Medicaid');
    await page.waitForTimeout(700);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(90);
    await expect(page.getByText(/Insurance \(search\): Medicaid/i)).toBeVisible();
  });

  test('smart search: accepts Cigna', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('accepts Cigna');
    await page.waitForTimeout(700);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(20);
    await expect(page.getByText(/Plan \(search\): Cigna/i)).toBeVisible();
  });

  test('smart search: BCBS shorthand', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('accepts BCBS');
    await page.waitForTimeout(700);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(20);
    await expect(page.getByText(/Plan \(search\): Blue Cross Blue Shield/i)).toBeVisible();
  });

  test('smart search: BHS shorthand', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill('accepts BHS');
    await page.waitForTimeout(700);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(5);
    await expect(page.getByText(/Plan \(search\): Behavioral Health Systems/i)).toBeVisible();
  });

  test('care level PHP filter', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('advanced-filters-btn').click();
    await page.selectOption('#care', 'Partial Hospitalization (PHP)');
    await page.waitForTimeout(500);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(20);
    const names = await getProgramNames(page);
    expect(names.length).toBeGreaterThan(0);
  });

  test('org search: Children\'s Health', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('search-input').fill("Children's Health");
    await page.waitForTimeout(500);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(15);
  });

  test('active filter chips appear and clear', async ({ page }) => {
    await waitForPrograms(page);
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
    await waitForPrograms(page);
    const baseline = await getCount(page);
    await page.getByTestId('search-input').fill('IOP in Plano');
    await page.waitForTimeout(700);
    expect(await getCount(page)).toBeLessThan(baseline);
    await page.getByTestId('reset-btn').click();
    await page.waitForTimeout(600);
    expect(await getCount(page)).toBe(baseline);
    await expect(page.getByTestId('active-filter-chips')).toBeHidden();
  });

  test('empty state shows context and broaden increases results', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.getByTestId('advanced-filters-btn').click();
    await page.selectOption('#care', 'Partial Hospitalization (PHP)');
    await page.selectOption('#insurance', { label: 'Beacon' });
    await page.selectOption('#loc', 'Houston');
    await page.waitForTimeout(700);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.locator('#emptyStateBody')).toContainText(/Beacon|PHP|Houston|Location|Care|Insurance/i);
    await page.getByTestId('empty-broaden-search').click();
    await page.waitForTimeout(700);
    const afterBroaden = await getCount(page);
    expect(afterBroaden).toBeGreaterThan(0);
  });

  test('empty state clear filters restores baseline', async ({ page }) => {
    await waitForPrograms(page);
    const baseline = await getCount(page);
    await page.getByTestId('advanced-filters-btn').click();
    await page.selectOption('#care', 'Partial Hospitalization (PHP)');
    await page.selectOption('#insurance', { label: 'Beacon' });
    await page.selectOption('#loc', 'Houston');
    await page.waitForTimeout(700);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.getByTestId('empty-clear-filters').click();
    await page.waitForTimeout(600);
    expect(await getCount(page)).toBe(baseline);
  });

  test('crisis toggle shows crisis programs', async ({ page }) => {
    await waitForPrograms(page);
    await resetFilters(page);
    await page.locator('#showCrisisTop').check();
    await page.waitForTimeout(500);
    await expect(page.locator('#sectionTitle')).toContainText(/crisis/i);
    const count = await getCount(page);
    expect(count).toBeGreaterThan(10);
  });
});
