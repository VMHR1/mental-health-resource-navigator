import { test, expect } from '@playwright/test';

const STATIC_PAGES = [
  { path: '/', canonical: 'https://viablemhr.com/' },
  { path: '/guides.html', canonical: 'https://viablemhr.com/guides.html', ogTitle: 'Guides for families' },
  { path: '/about.html', canonical: 'https://viablemhr.com/about.html', ogTitle: 'About ViableMHR' },
  { path: '/submit.html', canonical: 'https://viablemhr.com/submit.html' },
  { path: '/privacy.html', canonical: 'https://viablemhr.com/privacy.html' },
  { path: '/terms.html', canonical: 'https://viablemhr.com/terms.html' },
];

test.describe('SEO metadata (Phase 5)', () => {
  for (const pageMeta of STATIC_PAGES) {
    test(`${pageMeta.path} has canonical URL`, async ({ page }) => {
      await page.goto(pageMeta.path);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', pageMeta.canonical);
    });
  }

  test('guides.html includes Statcounter', async ({ page }) => {
    await page.goto('/guides.html');
    await expect(page.locator('script[src*="statcounter.com/counter/counter.js"]')).toHaveCount(1);
  });

  test('sitemap excludes legacy program.html', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).not.toContain('program.html');
    expect(body).toContain('guides.html');
    expect(body).toContain('about.html');
  });

  test('about page has report outdated section', async ({ page }) => {
    await page.goto('/about.html#report-outdated');
    await expect(page.locator('#report-outdated')).toBeVisible();
    await expect(page.locator('a[href*="subject=Outdated"]')).toBeVisible();
  });
});
