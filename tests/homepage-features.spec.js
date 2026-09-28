import { test, expect } from '@playwright/test';
import { waitForPrograms, showAllResults, revealSearchForTest, safeClick, openResultsAction } from './helpers/ui.js';

// Characterization tests for homepage features that had no e2e coverage
// before the app.js decomposition. They pin CURRENT behavior; if one fails
// after a refactor, the refactor changed behavior.

async function openHomeWithResults(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await waitForPrograms(page);
  await revealSearchForTest(page);
  await showAllResults(page);
  await expect(page.locator('#treatmentGrid .card').first()).toBeVisible();
}

/**
 * The results toolbar's secondary buttons (#viewComparison, #shareFilters) are
 * `display:none` at <=640px (public/phase1-design.css:1709), where the same
 * actions live in the #resultsMoreMenu overflow menu. tests/helpers/ui.js only
 * covers favorites/history, so this covers comparison/share the same way.
 */
async function openResultsToolbarAction(page, action, directId) {
  const direct = page.locator(`#${directId}`);
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    return;
  }
  await page.getByTestId('results-more-btn').click();
  await page.locator(`#resultsMoreMenu [data-results-action="${action}"]`).click();
}

test.describe('homepage features', () => {
  test('favorite persists across reload and updates the count badge', async ({ page }) => {
    await openHomeWithResults(page);
    await expect(page.locator('#favoritesCount')).toHaveText('0');

    const firstFav = page.locator('.card-action-btn.favorite').first();
    await safeClick(firstFav);
    await expect(firstFav).toHaveClass(/active/);
    await expect(page.locator('#favoritesCount')).toHaveText('1');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);
    await expect(page.locator('#favoritesCount')).toHaveText('1');

    // The saved program is actually in the favorites modal, not just a counter.
    await openResultsAction(page, 'favorites');
    const favoritesModal = page.getByTestId('favorites-modal');
    await expect(favoritesModal).toHaveAttribute('aria-hidden', 'false');
    await expect(favoritesModal.locator('.card')).toHaveCount(1);
  });

  test('comparison adds a program, shows it in the modal, and clears', async ({ page }) => {
    await openHomeWithResults(page);
    await expect(page.locator('#comparisonCount')).toHaveText('0');

    const firstCompare = page.locator('.card-action-btn.compare-btn').first();
    await safeClick(firstCompare);
    await expect(page.locator('.card-action-btn.compare-btn').first()).toHaveClass(/active/);
    await expect(page.locator('#comparisonCount')).toHaveText('1');

    await openResultsToolbarAction(page, 'comparison', 'viewComparison');
    await expect(page.locator('#comparisonModal')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#comparisonList .comparison-program-header')).toHaveCount(1);

    await page.locator('#clearComparison').click();
    await expect(page.locator('#comparisonCount')).toHaveText('0');
    await expect(page.locator('#comparisonList .comparison-program-header')).toHaveCount(0);
    await expect(page.locator('#comparisonList')).toContainText(/No programs selected/i);
  });

  test('typing in search shows autocomplete suggestions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);
    await revealSearchForTest(page);

    const suggestions = page.locator('#search-suggestions');
    await expect(suggestions).toBeHidden();

    await page.locator('#q').fill('pla');
    await expect(suggestions).toBeVisible();
    const options = suggestions.locator('[role="option"]');
    await expect(options.first()).toBeVisible();
    // Suggestions are derived from the loaded programs, not a static list.
    await expect(options.first()).toContainText(/pla/i);
    await expect(page.locator('#q')).toHaveAttribute('aria-expanded', 'true');
  });

  test('a completed search is recorded in recent searches', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);
    await revealSearchForTest(page);

    const recent = page.locator('#recentSearchesContainer');
    await expect(recent).toBeHidden();

    await page.locator('#q').fill('iop plano');
    // addRecentSearch runs on the 300ms input debounce (js/modules/events.js).
    await expect(recent).toBeVisible();
    await expect(recent.locator('.recent-search-tag')).toHaveText([/iop plano/i]);

    // It is persisted, so it survives a reload.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);
    await expect(page.locator('#recentSearchesContainer .recent-search-tag'))
      .toHaveText([/iop plano/i]);
  });

  test('share filters opens the share modal with the current URL', async ({ page }) => {
    await page.goto('/?q=iop');
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);
    // The URL params were restored into the live controls...
    await expect(page.locator('#q')).toHaveValue('iop');
    // ...and a control changed after load must also reach the shared URL,
    // proving the link is rebuilt from state rather than echoing location.href.
    await page.locator('#sortSelect').selectOption('name');

    await openResultsToolbarAction(page, 'share', 'shareFilters');

    await expect(page.locator('#shareModal')).toHaveAttribute('aria-hidden', 'false');
    const shareUrl = page.locator('#shareUrlInput');
    await expect(shareUrl).toBeVisible();
    await expect(shareUrl).toHaveValue(/q=iop/);
    await expect(shareUrl).toHaveValue(/sort=name/);
  });

  test('near me shows the consent modal; allowing switches sort to distance', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 32.7767, longitude: -96.797 }); // Dallas
    await openHomeWithResults(page);

    const consent = page.locator('#locationConsentModal');
    await expect(consent).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#sortSelect')).toHaveValue('relevance');

    await page.locator('#nearMeBtn').click();
    await expect(consent).toHaveAttribute('aria-hidden', 'false');

    await page.locator('#locationConsentAllow').click();
    await expect(consent).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#stopLocationBtn')).toBeVisible();
    await expect(page.locator('#nearMeBtn')).toBeHidden();
    await expect(page.locator('#sortSelect')).toHaveValue('distance');
  });

  test('clicking a call link records a call attempt', async ({ page }) => {
    await openHomeWithResults(page);
    // Prevent navigation to tel: while still firing the delegated click handler.
    await page.evaluate(() => {
      document.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="tel:"]');
        if (a) e.preventDefault();
      }, true);
    });

    const callLink = page.locator('#treatmentGrid .btn-call-program[data-program-id]').first();
    await expect(callLink).toBeVisible();
    await safeClick(callLink);

    // showCallConfirmation() appends a transient `.call-toast`, it does not use
    // the shared #toast element.
    const callToast = page.locator('.call-toast');
    await expect(callToast).toContainText(/Calling/i);
    await expect(callToast).toContainText(/Insurance card/i);

    // ...and the attempt is written to the persisted call history.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForPrograms(page);
    await openResultsAction(page, 'history');
    const historyModal = page.getByTestId('history-modal');
    await expect(historyModal).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#historyList')).not.toContainText(/No call history yet/i);
    await expect(page.locator('#historyList .card').first()).toBeVisible();
  });
});
