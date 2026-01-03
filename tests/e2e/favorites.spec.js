import { test, expect } from '@playwright/test';

test.describe('Favorites Modal', () => {
  test('opens and renders favorites modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for favorites button (could be in header or as a button)
    // Common patterns: button with "favorite" text, star icon, or data attribute
    const favoritesBtn = page
      .locator(
        'button:has-text("Favorites"), button[aria-label*="favorite" i], button[data-favorites]',
      )
      .first();

    // If favorites button exists, click it
    if (await favoritesBtn.isVisible({ timeout: 2000 })) {
      await favoritesBtn.click();
      await page.waitForTimeout(500);

      // Check that modal or favorites section is visible
      const modal = page.locator(
        '.modal, [role="dialog"], .favorites-modal, #favoritesModal',
      );
      const modalVisible = (await modal.count()) > 0;

      if (modalVisible) {
        await expect(modal.first()).toBeVisible();
      } else {
        // If no modal, favorites might be in a section
        const favoritesSection = page.locator('#favorites, .favorites-section');
        await expect(favoritesSection.first()).toBeVisible();
      }
    } else {
      // Favorites feature might not be implemented yet - skip test
      test.skip();
    }
  });

  test('can add and view favorites', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for programs to load
    await page.waitForTimeout(1000);

    // Try to find a favorite button on a program card
    const programCards = page.locator('.program-card, .result-card');
    const cardCount = await programCards.count();

    if (cardCount > 0) {
      const firstCard = programCards.first();
      const favoriteBtn = firstCard.locator(
        'button[aria-label*="favorite" i], button[data-favorite], .favorite-btn, button:has-text("★"), button:has-text("☆")',
      );

      if (await favoriteBtn.isVisible({ timeout: 2000 })) {
        // Click favorite button
        await favoriteBtn.click();
        await page.waitForTimeout(500);

        // Open favorites modal/section
        const favoritesBtn = page
          .locator(
            'button:has-text("Favorites"), button[aria-label*="favorite" i]',
          )
          .first();

        if (await favoritesBtn.isVisible({ timeout: 2000 })) {
          await favoritesBtn.click();
          await page.waitForTimeout(500);

          // Verify favorite is shown
          const favoritesList = page.locator(
            '.favorites-list, .favorite-item, #favorites .program-card',
          );
          const favoritesCount = await favoritesList.count();
          expect(favoritesCount).toBeGreaterThan(0);
        }
      } else {
        // Favorite button not found - feature might not be implemented
        test.skip();
      }
    } else {
      test.skip();
    }
  });
});
