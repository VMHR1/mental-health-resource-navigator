#!/usr/bin/env node
/**
 * Production smoke test against live site (default: https://viablemhr.com).
 * Usage: node scripts/prod-smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || process.env.PROD_URL || 'https://viablemhr.com';

const checks = [];

function row(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`${icon}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitForPrograms(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => {
      const n = document.getElementById('totalCount')?.textContent?.trim();
      return n && n !== '…' && n !== '0' && !Number.isNaN(Number(n));
    },
    { timeout: 45000 }
  );
}

async function getCount(page) {
  return Number(await page.locator('#totalCount').textContent());
}

(async () => {
  console.log(`\n=== Production smoke: ${BASE} ===\n`);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await waitForPrograms(page);
    const loadWarn = await page.locator('#loadWarn').textContent();
    row('Page loads program data', !/unable to load/i.test(loadWarn || ''), loadWarn || 'ok');

    const baseline = await getCount(page);
    row('Baseline treatment count', baseline >= 80 && baseline <= 100, String(baseline));

    await page.getByTestId('search-input').fill('IOP in Plano');
    await page.waitForTimeout(900);
    const iopCount = await getCount(page);
    row('Smart search: IOP in Plano', iopCount > 0 && iopCount < 50, String(iopCount));

    await page.getByTestId('reset-btn').click();
    await page.waitForTimeout(500);
    await page.locator('[data-preset="virtual-therapy"]').click();
    await page.waitForTimeout(700);
    const virtualCount = await getCount(page);
    row('Preset: Virtual therapy', virtualCount > 0 && virtualCount < 20, String(virtualCount));

    await page.getByTestId('reset-btn').click();
    await page.waitForTimeout(500);
    await page.getByTestId('search-input').fill('accepts Medicaid');
    await page.waitForTimeout(900);
    const medicaidCount = await getCount(page);
    row(
      'Smart search: accepts Medicaid',
      medicaidCount > 10 && medicaidCount < 90,
      String(medicaidCount)
    );

    await page.getByTestId('reset-btn').click();
    await page.waitForTimeout(500);
    const tips = page.locator('#searchTips');
    row('Search tips present', (await tips.count()) > 0);
    await tips.locator('summary').click();
    row('Search examples present', (await page.getByTestId('search-examples').count()) > 0);
  } catch (err) {
    row('Smoke run completed', false, err.message);
  } finally {
    await browser.close();
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(`\nSummary: ${checks.length - failed.length}/${checks.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
})();
