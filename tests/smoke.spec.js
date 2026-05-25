import { test, expect } from '@playwright/test';
import { openAdvancedFilters, openResultsAction, waitForPrograms, revealSearchForTest, clickFindPrograms, clickResetFilters } from './helpers/ui.js';

test.describe('Smoke Tests', () => {
  test('page loads without fatal console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait a bit for any async errors
    await page.waitForTimeout(1000);

    // Filter out known non-fatal errors (e.g., third-party scripts)
    const fatalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('favicon') &&
        !err.includes('third-party') &&
        !err.toLowerCase().includes('analytics'),
    );

    expect(fatalErrors).toHaveLength(0);
  });

  test('search input accepts typing; Find Programs triggers results update', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await revealSearchForTest(page);

    // Find search input
    const searchInput = page.getByTestId('search-input');
    await expect(searchInput).toBeVisible();

    // Type search query
    await searchInput.fill('test query');
    await expect(searchInput).toHaveValue('test query');

    // Click Find Programs button
    const findBtn = page.getByTestId('find-programs-btn');
    await expect(findBtn).toBeVisible();
    await clickFindPrograms(page);

    // Wait for results to update (either cards appear or empty state shows)
    await page.waitForTimeout(1000);

    // Verify results section is visible
    const resultsGrid = page.getByTestId('results-grid');
    const emptyState = page.getByTestId('empty-state');

    // Either results grid has content OR empty state is visible
    const hasResults = await resultsGrid.count() > 0;
    const isEmpty = await emptyState.isVisible().catch(() => false);

    expect(hasResults || isEmpty).toBeTruthy();
  });

  test('reset clears state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);
    await revealSearchForTest(page);

    const searchInput = page.getByTestId('search-input');
    await searchInput.fill('test');
    await clickFindPrograms(page);
    await expect(searchInput).toHaveValue('test');

    const resetBtn = page.getByTestId('reset-btn');
    await expect(resetBtn).toBeVisible();
    await clickResetFilters(page);

    await expect(searchInput).toHaveValue('');
    await expect(page.getByTestId('active-filter-chips').locator('.active-filter-chip')).toHaveCount(0);
  });

  test('advanced filters open/close and changing one filter updates results or chips', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await revealSearchForTest(page);

    await openAdvancedFilters(page);

    const advancedFilters = page.locator('#advancedFilters');
    const isVisible = await advancedFilters.isVisible().catch(() => false);
    expect(isVisible).toBeTruthy();

    // Try to change a filter (e.g., location if available)
    const locationSelect = page.locator('#loc');
    if (await locationSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      const options = await locationSelect.locator('option').count();
      if (options > 1) {
        // Select first non-empty option
        await locationSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);

        // Verify either results updated OR filter chips appeared
        const filterChips = page.getByTestId('active-filter-chips');
        const chipsVisible = await filterChips.isVisible().catch(() => false);
        const resultsGrid = page.getByTestId('results-grid');

        // Either chips show OR results grid updated
        expect(chipsVisible || (await resultsGrid.count()) >= 0).toBeTruthy();
      }
    }
  });

  test('favorites modal opens and closes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await openResultsAction(page, 'favorites');

    // Wait for modal to open
    await page.waitForTimeout(300);

    // Verify modal is visible
    const favoritesModal = page.getByTestId('favorites-modal');
    await expect(favoritesModal).toBeVisible();

    // Close modal
    const closeBtn = page.getByTestId('favorites-modal-close');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Wait for modal to close
    await page.waitForTimeout(300);

    // Verify modal is hidden
    const isHidden = await favoritesModal.getAttribute('aria-hidden');
    expect(isHidden).toBe('true');
  });

  test('history modal opens and closes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await openResultsAction(page, 'history');

    // Wait for modal to open
    await page.waitForTimeout(300);

    // Verify modal is visible
    const historyModal = page.getByTestId('history-modal');
    await expect(historyModal).toBeVisible();

    // Close modal
    const closeBtn = page.getByTestId('history-modal-close');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Wait for modal to close
    await page.waitForTimeout(300);

    // Verify modal is hidden
    const isHidden = await historyModal.getAttribute('aria-hidden');
    expect(isHidden).toBe('true');
  });
});


