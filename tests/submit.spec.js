import { test, expect } from '@playwright/test';

test.describe('Submit wizard (Phase 6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/submit.html');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => localStorage.removeItem('directoryDraft'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('header Back to search returns to homepage', async ({ page }) => {
    await page.getByRole('link', { name: 'Back to search' }).click();
    await expect(page).toHaveURL(/\/(index\.html)?$/);
  });

  test('Next on empty step 1 shows required-field alert', async ({ page }) => {
    await expect(page.locator('#stepTitle')).toHaveText('Organization basics');
    await page.locator('#nextBtn').scrollIntoViewIfNeeded();
    await page.locator('#nextBtn').click();
    await expect(page.locator('#alert')).toContainText(/required/i, { timeout: 5000 });
    await expect(page.locator('#stepTitle')).toHaveText('Organization basics');
  });

  test('valid step 1 advances to program overview', async ({ page }) => {
    await page.locator('[name="org_name"]').fill('Test Organization');
    await page.locator('[name="org_type"]').selectOption('Nonprofit');
    await page.locator('[name="general_phone"]').fill('(214) 555-0100');
    await page.locator('[name="admin_contact_name"]').fill('Test Admin');
    await page.locator('[name="admin_contact_email"]').fill('admin@example.org');
    await page.locator('#nextBtn').click();
    await expect(page.locator('#stepTitle')).toHaveText('Program overview');
  });

  test('does not POST to Formspree when validation fails', async ({ page }) => {
    let formspreeHit = false;
    await page.route('**/formspree.io/**', (route) => {
      formspreeHit = true;
      route.abort();
    });
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(300);
    expect(formspreeHit).toBe(false);
  });
});
