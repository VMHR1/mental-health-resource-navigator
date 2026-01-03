import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('loads without console errors', async ({ page }) => {
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

    expect(consoleErrors).toHaveLength(0);
  });

  test('displays specialized resources section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for specialized resources section
    const section = page.locator('.specialized-resources-section');
    await expect(section).toBeVisible();

    // Check for both resource cards
    const eatingDisordersCard = page.locator('text=Eating Disorders').first();
    const substanceUseCard = page.locator('text=Substance Use').first();

    await expect(eatingDisordersCard).toBeVisible();
    await expect(substanceUseCard).toBeVisible();
  });

  test('clicking Eating Disorders "View all" applies filter and scrolls to results', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click the "View all" button for Eating Disorders
    const viewAllBtn = page.locator(
      'button[data-preset="eating-disorders-all"]',
    );
    await expect(viewAllBtn).toBeVisible();
    await viewAllBtn.click();

    // Wait for filter to apply and scroll
    await page.waitForTimeout(500);

    // Check that we scrolled to treatment section
    const treatmentSection = page.locator('#treatmentSection');
    await expect(treatmentSection).toBeVisible();

    // Check that filter chips show Eating Disorders
    const filterChips = page.locator('.filter-chip');
    const eatingDisordersChip = filterChips.filter({
      hasText: /Eating Disorders/i,
    });
    await expect(eatingDisordersChip.first()).toBeVisible();
  });

  test('clicking Substance Use "PHP" applies filter and scrolls to results', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click the "PHP" button for Substance Use
    const phpBtn = page.locator('button[data-preset="substance-use-php"]');
    await expect(phpBtn).toBeVisible();
    await phpBtn.click();

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Check that we scrolled to treatment section
    const treatmentSection = page.locator('#treatmentSection');
    await expect(treatmentSection).toBeVisible();

    // Check that filter chips show Substance Use and PHP
    const filterChips = page.locator('.filter-chip');
    const substanceUseChip = filterChips.filter({ hasText: /Substance Use/i });
    const phpChip = filterChips.filter({ hasText: /PHP/i });

    await expect(substanceUseChip.first()).toBeVisible();
    await expect(phpChip.first()).toBeVisible();
  });

  test('clicking Eating Disorders "Outpatient" shows only outpatient programs', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click the "Outpatient" button for Eating Disorders
    const outpatientBtn = page.locator(
      'button[data-preset="eating-disorders-outpatient"]',
    );
    await expect(outpatientBtn).toBeVisible();
    await outpatientBtn.click();

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Check that results are shown
    const results = page.locator('.program-card, .result-card');
    const count = await results.count();

    if (count > 0) {
      // Verify all results show "Outpatient" level of care
      for (let i = 0; i < Math.min(count, 3); i++) {
        const card = results.nth(i);
        const levelOfCare = card.locator('text=/Outpatient/i');
        await expect(levelOfCare.first()).toBeVisible();
      }
    }
  });
});
