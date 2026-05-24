/**
 * Mobile-aware UI helpers (filter tray + results overflow menu).
 */

import { expect } from '@playwright/test';

/** Wait until program data is loaded (awaiting panel stat or unlocked results count). */
export async function waitForPrograms(page) {
  await expect(page.locator('#loadWarn')).not.toContainText(/unable to load/i, { timeout: 15000 });
  await page.waitForFunction(
    () => {
      const awaiting = document.getElementById('awaitingProgramCount')?.textContent?.trim();
      if (awaiting && awaiting !== '…' && awaiting !== '—' && !Number.isNaN(Number(awaiting))) {
        return true;
      }
      const n = document.getElementById('totalCount')?.textContent?.trim();
      return n && n !== '…' && n !== '0' && !Number.isNaN(Number(n));
    },
    { timeout: 15000 }
  );
}

/** Unlock and show the full program list (pre-search gate). */
export async function showAllResults(page) {
  const browseAll = page.getByTestId('browse-all-btn');
  if (await browseAll.isVisible().catch(() => false)) {
    await browseAll.scrollIntoViewIfNeeded();
    await browseAll.click();
    await page.waitForTimeout(400);
  }
}

/** Reveal search section via intent card (needed before Find Programs on fresh load). */
export async function revealSearchForTest(page) {
  const searchPrograms = page.getByRole('button', { name: 'Search programs' });
  if (await searchPrograms.isVisible().catch(() => false)) {
    await searchPrograms.click();
    await page.waitForTimeout(500);
  }
}

export async function openAdvancedFilters(page) {
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width <= 768;

  if (isMobile) {
    const trayBtn = page.locator('#openFilterTray');
    await trayBtn.waitFor({ state: 'visible', timeout: 5000 });
    await trayBtn.click();
    await page.waitForTimeout(400);
    const advanced = page.locator('#advancedFilters');
    await advanced.waitFor({ state: 'visible', timeout: 5000 });
    return;
  }

  await page.getByTestId('advanced-filters-btn').click({ force: true });
  await page.waitForTimeout(300);
  await page.locator('#advancedFilters').waitFor({ state: 'visible', timeout: 5000 });
}

export async function closeFilterTrayIfOpen(page) {
  const overlay = page.locator('#filterTrayOverlay.is-open');
  if (await overlay.count()) {
    await page.locator('#closeFilterTray').click();
    await page.waitForTimeout(350);
  }
}

export async function openResultsAction(page, action) {
  await showAllResults(page);
  const testId = action === 'favorites' ? 'favorites-btn' : 'history-btn';
  const direct = page.getByTestId(testId);
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    return;
  }

  await page.getByTestId('results-more-btn').click();
  const label = action === 'favorites' ? /Saved/i : /History/i;
  await page.getByRole('menuitem', { name: label }).click();
}
