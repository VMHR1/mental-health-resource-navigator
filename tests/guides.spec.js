import { test, expect } from '@playwright/test';

test.describe('Guides hub (Phase 6 / crawlability split)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guides.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('loads with main heading and section anchors', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/guide/i);
    await expect(page.locator('#how-to-search')).toBeAttached();
    await expect(page.locator('#levels-of-care')).toBeAttached();
    await expect(page.locator('#what-to-ask')).toBeAttached();
  });

  test('internal navigation links resolve to anchors on the hub', async ({ page }) => {
    await page.getByRole('link', { name: 'How to search this directory', exact: true }).click();
    await expect(page).toHaveURL(/#how-to-search$/);
    await expect(page.locator('#howToSearchHeading')).toBeInViewport();
  });

  test('each section links to its full guide page', async ({ page }) => {
    await expect(page.locator('#how-to-search a[href="/guide-how-to-search"]')).toBeAttached();
    await expect(page.locator('#levels-of-care a[href="/guide-levels-of-care"]')).toBeAttached();
    await expect(page.locator('#what-to-ask a[href="/guide-what-to-ask"]')).toBeAttached();
  });

  test('footer links route to index, about, privacy, terms', async ({ page }) => {
    await page.getByRole('link', { name: 'Return to program search' }).click();
    await expect(page).toHaveURL(/\/(index\.html)?$/);

    await page.goto('/guides.html');
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL(/\/about$/);

    await page.goto('/guides.html');
    await page.getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page).toHaveURL(/\/privacy$/);

    await page.goto('/guides.html');
    await page.getByRole('link', { name: 'Terms', exact: true }).click();
    await expect(page).toHaveURL(/\/terms$/);
  });
});

test.describe('Guide: How to search this directory', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guide-how-to-search.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('loads with heading and content', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/how to search/i);
    await expect(page.locator('#how-to-search')).toBeAttached();
  });

  test('main page link from how-to-search section works', async ({ page }) => {
    await page.locator('#how-to-search a[href="/"]').click();
    await expect(page).toHaveURL(/\/(index\.html)?$/);
  });

  test('links back to the guides hub', async ({ page }) => {
    await page.getByRole('link', { name: 'All guides' }).click();
    await expect(page).toHaveURL(/\/guides$/);
  });
});

test.describe('Guide: Understanding levels of care', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guide-levels-of-care.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('loads with heading and content', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/levels of care/i);
    await expect(page.locator('#levels-of-care')).toBeAttached();
    await expect(page.getByText('Outpatient', { exact: true })).toBeAttached();
  });

  test('links back to the guides hub', async ({ page }) => {
    await page.getByRole('link', { name: 'All guides' }).click();
    await expect(page).toHaveURL(/\/guides$/);
  });
});

test.describe('Guide: What to ask when you call', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guide-what-to-ask.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('loads with heading and content', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/what to ask/i);
    await expect(page.locator('#what-to-ask')).toBeAttached();
  });

  test('copy checklist announces success', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Clipboard write requires secure context in WebKit');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy checklist' }).click();
    await expect(page.locator('#copyChecklistStatus')).toContainText(/copied/i);
  });

  test('links back to the guides hub', async ({ page }) => {
    await page.getByRole('link', { name: 'All guides' }).click();
    await expect(page).toHaveURL(/\/guides$/);
  });
});
