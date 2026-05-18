import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

test.describe('Filter behavior and routing', () => {
  test('eating disorder preset returns eating disorder programs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-preset="eating-disorders-all"]').click();
    await page.waitForTimeout(600);
    const cards = page.locator('.card:has(.pname)');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('substance use preset returns substance use programs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-preset="substance-use-all"]').click();
    await page.waitForTimeout(600);
    const cards = page.locator('.card:has(.pname)');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('OSAR referral enables crisis results', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('advanced-filters-btn').click();
    await page.locator('#statewideFiltersSection').evaluate((el) => {
      el.style.display = 'block';
    });
    await page.selectOption('#serviceDomain', 'substance_use', { force: true });
    await page.waitForTimeout(200);
    // Drive the hidden multi-select + change event (same path as chip UI → events.js enables crisis toggle for OSAR)
    await page.evaluate(() => {
      const sel = document.getElementById('sudServices');
      if (!sel) return;
      Array.from(sel.options).forEach((o) => {
        o.selected = o.value === 'osar_referral';
      });
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(800);
    await expect(page.locator('#showCrisis')).toBeChecked();
  });

  test('Outpatient and Residential care filters return results', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('advanced-filters-btn').click();
    await page.selectOption('#care', 'Outpatient', { force: true });
    await page.waitForTimeout(600);
    expect(await page.locator('.card:has(.pname)').count()).toBeGreaterThan(0);

    await page.selectOption('#care', 'Residential', { force: true });
    await page.waitForTimeout(600);
    expect(await page.locator('.card:has(.pname)').count()).toBeGreaterThan(0);
  });

  test('privacy and terms links route correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('footer a[href="privacy.html"]')).toBeVisible();
    await expect(page.locator('footer a[href="terms.html"]')).toBeVisible();

    await page.goto('/privacy.html');
    await expect(page).toHaveURL(/privacy\.html$/);
    await page.goto('/terms.html');
    await expect(page).toHaveURL(/terms\.html$/);
  });

  test('program detail page handles valid and invalid IDs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const validId = await page.evaluate(async () => {
      const res = await fetch('/programs.json');
      const data = await res.json();
      return data.programs?.[0]?.program_id;
    });
    expect(validId).toBeTruthy();

    await page.goto(`/program.html?id=${encodeURIComponent(validId)}`);
    await expect(page.locator('#programDetail .program-detail-title')).toBeVisible();

    await page.goto('/program.html?id=does-not-exist');
    await expect(page.locator('#programDetail')).toContainText('Program not found');
  });

  test('malicious text fixture is escaped and not executed', async ({ page }) => {
    const fixture = JSON.parse(
      readFileSync(join(process.cwd(), 'tests', 'fixtures', 'malicious-program.json'), 'utf8')
    );
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate((program) => {
      window.__xssExecuted = false;
      window.alert = () => { window.__xssExecuted = true; };
      const card = window.createCard(program, 0, {
        els: {},
        state: { getOpenId: () => null, getUserLocation: () => null, getCurrentSort: () => 'relevance' },
        isFavorite: () => false,
        comparisonSet: new Set(),
        programDataMap: new Map()
      });
      const host = document.createElement('div');
      host.id = 'xss-test-host';
      host.appendChild(card);
      document.body.appendChild(host);
    }, fixture);

    await expect(page.locator('#xss-test-host')).toContainText('<script>alert(1)</script> Family Org');
    const xssExecuted = await page.evaluate(() => window.__xssExecuted === true);
    expect(xssExecuted).toBeFalsy();
  });
});
