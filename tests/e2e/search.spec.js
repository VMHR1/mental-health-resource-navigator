import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test('search for "Weatherford" returns expected results', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find search input
    const searchInput = page.locator('#q');
    await expect(searchInput).toBeVisible();

    // Type search query
    await searchInput.fill('Weatherford');
    await searchInput.press('Enter');

    // Wait for results to load
    await page.waitForTimeout(1000);

    // Check that results are displayed
    const results = page.locator('.program-card, .result-card');
    const count = await results.count();

    expect(count).toBeGreaterThan(0);

    // Verify at least one result mentions Weatherford
    const resultsText = await page.locator('#treatmentSection').textContent();
    expect(resultsText.toLowerCase()).toContain('weatherford');
  });

  test('search for "Evergreen" returns expected results', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find search input
    const searchInput = page.locator('#q');
    await expect(searchInput).toBeVisible();

    // Type search query
    await searchInput.fill('Evergreen');
    await searchInput.press('Enter');

    // Wait for results to load
    await page.waitForTimeout(1000);

    // Check that results are displayed
    const results = page.locator('.program-card, .result-card');
    const count = await results.count();

    expect(count).toBeGreaterThan(0);

    // Verify results mention Evergreen or Fort Behavioral
    const resultsText = await page.locator('#treatmentSection').textContent();
    expect(
      resultsText.toLowerCase().includes('evergreen') ||
        resultsText.toLowerCase().includes('fort behavioral'),
    ).toBeTruthy();
  });

  test('empty search shows all programs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Clear any existing filters
    const resetBtn = page
      .locator('#resetTop, button:has-text("Reset")')
      .first();
    if (await resetBtn.isVisible()) {
      await resetBtn.click();
      await page.waitForTimeout(500);
    }

    // Check that results are displayed (should show all programs)
    const results = page.locator('.program-card, .result-card');
    const count = await results.count();

    expect(count).toBeGreaterThan(0);
  });
});
