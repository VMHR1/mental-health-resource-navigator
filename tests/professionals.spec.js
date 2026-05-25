import { test, expect } from '@playwright/test';
import { waitForPrograms, showAllResults, revealSearchForTest, unlockProGate } from './helpers/ui.js';

test.describe('Professional Navigator Layer', () => {
  test.beforeEach(async ({ page }) => {
    await unlockProGate(page);
  });

  test('professionals.html renders all five audience sections', async ({ page }) => {
    await page.goto('/professionals.html');
    await expect(page.locator('h1')).toContainText('For professionals');
    const sections = ['#discharge-teams', '#bh-operations', '#lmha-coalitions', '#school-counselors', '#program-staff'];
    for (const sel of sections) {
      const heading = page.locator(`${sel} h2`);
      await expect(heading).toBeVisible();
    }
    // Promise of free family search and no paid placement must be present.
    await expect(page.locator('.pro-promise')).toContainText(/no paid rankings/i);
    await expect(page.locator('.pro-promise')).toContainText(/no patient identifiers/i);
  });

  test('boards.html lists five boards with editorial notes', async ({ page }) => {
    await page.goto('/boards.html');
    await expect(page.locator('h1')).toContainText('Resource boards');
    // Wait for async fetch + render
    await expect(page.locator('.board-card')).toHaveCount(5, { timeout: 15000 });
    // Each board should display an editorial note (neutrality)
    const notes = page.locator('.board-editorial');
    await expect(notes).toHaveCount(5);
    // Each board must include items
    const items = page.locator('.board-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(5);
  });

  test('navigator mode activates from ?mode=navigator and shows toolbar + caveats', async ({ page }) => {
    await page.goto('/?mode=navigator');
    await expect(page.locator('body')).toHaveClass(/navigator-mode-on/);
    await expect(page.locator('#navigatorToolbar')).toBeVisible();
    await waitForPrograms(page);
    await revealSearchForTest(page);
    await showAllResults(page);
    await page.waitForSelector('.card[data-id]', { timeout: 20000 });
    // At least one overlay should appear in navigator mode (match explainer or friction flag)
    await expect(page.locator('.navigator-overlay').first()).toBeVisible({ timeout: 10000 });
  });

  test('navigator order matches default order for the same filters (neutrality)', async ({ page }) => {
    await page.goto('/');
    await waitForPrograms(page);
    await revealSearchForTest(page);
    await showAllResults(page);
    await page.waitForSelector('.card[data-id]', { timeout: 20000 });
    const defaultOrder = await page.$$eval('.card[data-id]', (cards) =>
      cards.slice(0, 10).map((c) => c.getAttribute('data-id'))
    );

    await page.goto('/?mode=navigator');
    await waitForPrograms(page);
    await revealSearchForTest(page);
    await showAllResults(page);
    await page.waitForSelector('.card[data-id]', { timeout: 20000 });
    const navOrder = await page.$$eval('.card[data-id]', (cards) =>
      cards.slice(0, 10).map((c) => c.getAttribute('data-id'))
    );

    expect(navOrder).toEqual(defaultOrder);
  });

  test('report-outdated form blocks empty submissions and prefills from URL', async ({ page }) => {
    await page.goto('/report-outdated.html?program_id=test-prefill-id');
    await expect(page.locator('#ro-program-id')).toHaveValue('test-prefill-id');

    // Submit empty — should remain on page and show inline errors
    await page.locator('#ro-submit').click();
    await expect(page.locator('.ro-field[data-field="issue_type"][data-invalid="true"]')).toBeVisible();
    await expect(page.locator('.ro-field[data-field="details"][data-invalid="true"]')).toBeVisible();
  });

  test('regional-snapshot.html renders headline counts and methodology', async ({ page }) => {
    await page.goto('/regional-snapshot.html');
    await expect(page.locator('h1')).toContainText('Regional gap snapshot');
    await expect(page.locator('.rs-tile').first()).toBeVisible({ timeout: 10000 });
    // Headline tile labels must be visible
    await expect(page.getByText(/programs in directory/i)).toBeVisible();
    await expect(page.getByText(/stale programs/i)).toBeVisible();
    // Methodology section must be present (use first match — the phrase appears as a bolded headline + sentence)
    await expect(page.getByText(/Counts and buckets only/i).first()).toBeVisible();
  });

  test('changelog page lists verification events with scope tags', async ({ page }) => {
    await page.goto('/changelog.html');
    await expect(page.locator('h1')).toContainText('Verification changelog');
    await expect(page.locator('.cl-event').first()).toBeVisible({ timeout: 10000 });
    const scopes = await page.locator('.cl-event__scope').allTextContents();
    expect(scopes.length).toBeGreaterThan(0);
  });

  test('export center exposes schema fields and CSV download form', async ({ page }) => {
    await page.goto('/export.html');
    await expect(page.locator('h1')).toContainText('Export center');
    await expect(page.locator('#exportLicenseText')).not.toHaveText(/Loading/i, { timeout: 10000 });
    await expect(page.locator('#exportSchemaTable tbody tr').first()).toBeVisible();
    await expect(page.locator('input[name="format"][value="csv"]')).toBeChecked();
  });

  test('boards page exposes data-pro-event hooks (no PHI in attributes)', async ({ page }) => {
    await page.goto('/boards.html');
    await page.waitForSelector('.board-item', { timeout: 15000 });
    const proEventCount = await page.locator('[data-pro-event="board_open"]').count();
    expect(proEventCount).toBeGreaterThan(0);
    // Ensure data-pro-event-props parses as JSON and only contains board_id
    const props = await page.$eval('[data-pro-event="board_open"]', (el) => el.getAttribute('data-pro-event-props'));
    expect(() => JSON.parse(props)).not.toThrow();
    const parsed = JSON.parse(props);
    expect(Object.keys(parsed)).toEqual(['board_id']);
  });
});
