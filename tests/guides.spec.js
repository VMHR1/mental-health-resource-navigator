import { test, expect } from '@playwright/test';

test.describe('Guides page (Phase 6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guides.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('loads with main heading and sections', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/guide/i);
    await expect(page.locator('#how-to-search')).toBeAttached();
    await expect(page.locator('#levels-of-care')).toBeAttached();
    await expect(page.locator('#what-to-ask')).toBeAttached();
  });

  test('internal navigation links resolve', async ({ page }) => {
    await page.getByRole('link', { name: 'How to search this directory' }).click();
    await expect(page).toHaveURL(/#how-to-search$/);
    await expect(page.locator('#howToSearchHeading')).toBeInViewport();
  });

  test('footer links route to index, about, privacy, terms', async ({ page }) => {
    await page.getByRole('link', { name: 'Return to program search' }).click();
    await expect(page).toHaveURL(/\/(index\.html)?$/);

    await page.goto('/guides.html');
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL(/about\.html$/);

    await page.goto('/guides.html');
    await page.getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page).toHaveURL(/privacy\.html$/);

    await page.goto('/guides.html');
    await page.getByRole('link', { name: 'Terms', exact: true }).click();
    await expect(page).toHaveURL(/terms\.html$/);
  });

  test('main page link from how-to-search section works', async ({ page }) => {
    await page.locator('#how-to-search a[href="index.html"]').click();
    await expect(page).toHaveURL(/\/(index\.html)?$/);
  });

  test('copy checklist announces success', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Clipboard write requires secure context in WebKit');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy checklist' }).click();
    await expect(page.locator('#copyChecklistStatus')).toContainText(/copied/i);
  });
});
