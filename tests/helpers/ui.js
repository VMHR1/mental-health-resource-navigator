/**
 * Mobile-aware UI helpers (filter tray + results overflow menu).
 */

import { expect } from '@playwright/test';

/** Unlock professional preview gate for Playwright (sessionStorage). */
export async function unlockProGate(page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('vmhr_pro_gate_v1', '1');
    } catch (_) { /* ignore */ }
  });
}

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
    await safeClick(browseAll);
    await page.waitForTimeout(400);
  }
}

/** Reveal search section via intent card (needed before Find Programs on fresh load). */
export async function revealSearchForTest(page) {
  await closeFilterTrayIfOpen(page);
  const section = page.locator('#searchSection');
  const alreadyRevealed = await section.evaluate((el) => el.classList.contains('is-revealed'));
  if (alreadyRevealed) return;

  const searchPrograms = page.getByRole('button', { name: 'Search programs' });
  if (await searchPrograms.isVisible().catch(() => false)) {
    await safeClick(searchPrograms);
    await page.waitForFunction(
      () => {
        const el = document.getElementById('searchSection');
        if (!el?.classList.contains('is-revealed')) return false;
        const opacity = parseFloat(getComputedStyle(el).opacity);
        return opacity >= 0.99;
      },
      { timeout: 5000 },
    );
    await page.waitForTimeout(900);
  }
}

export async function openAdvancedFilters(page) {
  await revealSearchForTest(page);
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width <= 768;

  if (isMobile) {
    const trayBtn = page.locator('#openFilterTray');
    await trayBtn.waitFor({ state: 'visible', timeout: 5000 });
    await safeClick(trayBtn);
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
    await safeClick(page.locator('#closeFilterTray'));
    await page.waitForTimeout(350);
  }
}

/** Click when sticky header / results panels intercept pointer hit-testing. */
export async function safeClick(locator, scrollContainer) {
  await locator.scrollIntoViewIfNeeded();
  if (scrollContainer) {
    await scrollContainer.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  }
  await locator.evaluate((el) => el.click());
}

/**
 * Reset filters via #resetTop. Uses a DOM click so sticky header / results
 * overlays cannot block pointer hit-testing (search-filter-audit flakiness).
 */
export async function clickResetFilters(page) {
  await revealSearchForTest(page);
  await closeFilterTrayIfOpen(page);
  await safeClick(page.getByTestId('reset-btn'), page.locator('#searchSection'));
  await page.waitForTimeout(400);
}

export async function clickFindPrograms(page) {
  await revealSearchForTest(page);
  await safeClick(page.getByTestId('find-programs-btn'), page.locator('#searchSection'));
  await page.waitForTimeout(500);
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
