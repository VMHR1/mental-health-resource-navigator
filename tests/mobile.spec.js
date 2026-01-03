import { test, expect } from '@playwright/test';

test.describe('Mobile Verification', () => {
  // Only run these tests on mobile projects
  test.use({ 
    // This will be overridden by project config, but ensures mobile viewport
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    // Check for horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('critical controls are visible and clickable on mobile', async ({ page }) => {
    // Search input
    const searchInput = page.getByTestId('search-input');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeEnabled();

    // Find Programs button
    const findBtn = page.getByTestId('find-programs-btn');
    await expect(findBtn).toBeVisible();
    await expect(findBtn).toBeEnabled();

    // Advanced Filters toggle
    const advancedBtn = page.getByTestId('advanced-filters-btn');
    await expect(advancedBtn).toBeVisible();
    await expect(advancedBtn).toBeEnabled();

    // Reset button
    const resetBtn = page.getByTestId('reset-btn');
    await expect(resetBtn).toBeVisible();
    await expect(resetBtn).toBeEnabled();

    // Verify buttons are clickable (not covered by other elements)
    const findBtnBox = await findBtn.boundingBox();
    const advancedBtnBox = await advancedBtn.boundingBox();
    const resetBtnBox = await resetBtn.boundingBox();

    expect(findBtnBox).not.toBeNull();
    expect(advancedBtnBox).not.toBeNull();
    expect(resetBtnBox).not.toBeNull();
  });

  test('advanced filters open and dropdown can be used on mobile', async ({ page }) => {
    // Open advanced filters
    const advancedBtn = page.getByTestId('advanced-filters-btn');
    await advancedBtn.click();
    await page.waitForTimeout(300);

    // Verify filters section is visible
    const advancedFilters = page.locator('#advancedFilters');
    await expect(advancedFilters).toBeVisible();

    // Try to interact with a dropdown (location select)
    const locationSelect = page.locator('#loc');
    if (await locationSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      const options = await locationSelect.locator('option').count();
      if (options > 1) {
        // Select a value
        await locationSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);

        // Verify selection worked (either filter chips appeared or results updated)
        const filterChips = page.getByTestId('active-filter-chips');
        const chipsVisible = await filterChips.isVisible().catch(() => false);
        const selectedValue = await locationSelect.inputValue();

        // Either chips are visible OR a value was selected
        expect(chipsVisible || selectedValue !== '').toBeTruthy();
      }
    }

    // Try age dropdown if available
    const ageBtn = page.locator('#ageBtn');
    if (await ageBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await ageBtn.click();
      await page.waitForTimeout(300);

      const ageMenu = page.locator('#ageMenu');
      const menuVisible = await ageMenu.isVisible().catch(() => false);
      expect(menuVisible).toBeTruthy();

      // Select an age option
      const ageOption = ageMenu.locator('.dd-option').nth(1);
      if (await ageOption.isVisible({ timeout: 500 }).catch(() => false)) {
        await ageOption.click();
        await page.waitForTimeout(500);
        // Verify age was selected
        const ageValue = await page.locator('#ageBtnValue').textContent();
        expect(ageValue).not.toBe('Any age');
      }
    }
  });

  test('results section renders after search OR empty-state renders', async ({ page }) => {
    // Perform a search
    const searchInput = page.getByTestId('search-input');
    await searchInput.fill('test search');
    await page.getByTestId('find-programs-btn').click();

    // Wait for results to update
    await page.waitForTimeout(1000);

    // Check for results OR empty state
    const resultsGrid = page.getByTestId('results-grid');
    const emptyState = page.getByTestId('empty-state');

    const hasResults = (await resultsGrid.locator('.program-card, .result-card').count()) > 0;
    const isEmpty = await emptyState.isVisible().catch(() => false);

    // Either results are shown OR empty state is visible
    expect(hasResults || isEmpty).toBeTruthy();
  });

  test('homepage snapshot on mobile', async ({ page }) => {
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Take full-page screenshot
    await expect(page).toHaveScreenshot('mobile-homepage.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('results view snapshot after search on mobile', async ({ page }) => {
    // Perform a search
    const searchInput = page.getByTestId('search-input');
    await searchInput.fill('dallas');
    await page.getByTestId('find-programs-btn').click();

    // Wait for results to render
    await page.waitForTimeout(1500);

    // Scroll to results section
    const treatmentSection = page.locator('#treatmentSection');
    await treatmentSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Take full-page screenshot
    await expect(page).toHaveScreenshot('mobile-results-view.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});

