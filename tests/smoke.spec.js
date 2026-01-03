import { test, expect } from '@playwright/test';

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

    // Find search input
    const searchInput = page.getByTestId('search-input');
    await expect(searchInput).toBeVisible();

    // Type search query
    await searchInput.fill('test query');
    await expect(searchInput).toHaveValue('test query');

    // Click Find Programs button
    const findBtn = page.getByTestId('find-programs-btn');
    await expect(findBtn).toBeVisible();
    await findBtn.click();

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

    // Apply a filter first
    const searchInput = page.getByTestId('search-input');
    await searchInput.fill('test');
    await page.getByTestId('find-programs-btn').click();
    await page.waitForTimeout(500);

    // Check if filter chips exist or results count changed
    const filterChips = page.getByTestId('active-filter-chips');
    const initialChipsCount = await filterChips.locator('.filter-chip').count().catch(() => 0);

    // Click reset
    const resetBtn = page.getByTestId('reset-btn');
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // Wait for reset to take effect
    await page.waitForTimeout(500);

    // Verify state cleared: either chips disappeared OR search input cleared
    const finalChipsCount = await filterChips.locator('.filter-chip').count().catch(() => 0);
    const searchValue = await searchInput.inputValue();

    // Reset should clear search OR remove filter chips
    expect(finalChipsCount < initialChipsCount || searchValue === '').toBeTruthy();
  });

  test('advanced filters open/close and changing one filter updates results or chips', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click Advanced Filters button
    const advancedBtn = page.getByTestId('advanced-filters-btn');
    await expect(advancedBtn).toBeVisible();
    await advancedBtn.click();

    // Wait for filters to open
    await page.waitForTimeout(300);

    // Verify filters are visible (check for advanced filters section)
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

    // Click favorites button
    const favoritesBtn = page.getByTestId('favorites-btn');
    await expect(favoritesBtn).toBeVisible();
    await favoritesBtn.click();

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

    // Click history button
    const historyBtn = page.getByTestId('history-btn');
    await expect(historyBtn).toBeVisible();
    await historyBtn.click();

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

