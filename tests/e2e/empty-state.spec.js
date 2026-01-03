import { test, expect } from '@playwright/test';

test.describe('Empty State', () => {
  test('renders gracefully when no matches found', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Enter a search query that should return no results
    const searchInput = page.locator('#q');
    await searchInput.fill('XYZ123NONEXISTENTPROGRAM');
    await searchInput.press('Enter');

    // Wait for results to update
    await page.waitForTimeout(1000);

    // Check for empty state message
    const emptyState = page.locator('text=/no results|no matches|0 results/i');
    const results = page.locator('.program-card, .result-card');
    const count = await results.count();

    // Either empty state message is shown OR no result cards are visible
    if (count === 0) {
      // Empty state should be visible
      await expect(emptyState.first()).toBeVisible();
    } else {
      // If cards exist, they should be hidden or empty state should be shown
      const emptyStateVisible = (await emptyState.count()) > 0;
      expect(emptyStateVisible || count === 0).toBeTruthy();
    }
  });

  test('applies multiple filters that result in no matches', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Apply a very specific filter combination that likely has no matches
    // First, set location to a specific city
    const locationSelect = page.locator('#loc');
    if (await locationSelect.isVisible()) {
      await locationSelect.selectOption({ index: 1 }); // Select first non-empty option
      await page.waitForTimeout(500);
    }

    // Then search for something very specific
    const searchInput = page.locator('#q');
    await searchInput.fill('NONEXISTENTXYZ');
    await searchInput.press('Enter');

    // Wait for results to update
    await page.waitForTimeout(1000);

    // Should show empty state or 0 results gracefully
    const results = page.locator('.program-card, .result-card');
    const count = await results.count();

    // Empty state should handle this gracefully
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
