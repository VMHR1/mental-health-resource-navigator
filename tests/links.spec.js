import { test, expect } from '@playwright/test';

const PRIORITY_PAGES = [
  '/',
  '/guides.html',
  '/about.html',
  '/submit.html',
  '/privacy.html',
  '/terms.html',
];

const NON_FATAL_CONSOLE = [
  'favicon',
  'third-party',
  'analytics',
  'statcounter',
  'net::err',
];

function isFatalConsoleMessage(text) {
  const lower = text.toLowerCase();
  return !NON_FATAL_CONSOLE.some((fragment) => lower.includes(fragment));
}

/** Normalize href to path-only for same-origin static links. */
function normalizeInternalHref(href, baseURL) {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return null;
  }
  if (href.startsWith('javascript:')) return null;

  let url;
  try {
    url = new URL(href, baseURL);
  } catch {
    return null;
  }

  const base = new URL(baseURL);
  if (url.origin !== base.origin) return null;

  let path = url.pathname;
  if (path.endsWith('/')) path = `${path}index.html`;
  if (path === '/') path = '/index.html';
  return path;
}

test.describe('Link crawl and console errors (Phase 6)', () => {
  test('priority pages have no broken same-origin links', async ({ page, baseURL }) => {
    const checked = new Set();
    const broken = [];

    for (const startPath of PRIORITY_PAGES) {
      await page.goto(startPath);
      await page.waitForLoadState('domcontentloaded');

      const hrefs = await page.locator('a[href]').evaluateAll((anchors) =>
        anchors.map((a) => a.getAttribute('href')).filter(Boolean),
      );

      for (const href of hrefs) {
        const path = normalizeInternalHref(href, baseURL);
        if (!path || checked.has(path)) continue;
        checked.add(path);

        const response = await page.request.get(path);
        if (!response.ok()) {
          broken.push({ from: startPath, href, status: response.status() });
        }
      }
    }

    expect(broken, JSON.stringify(broken, null, 2)).toEqual([]);
  });

  test('sample program slug page loads', async ({ page, request }) => {
    const res = await request.get('/programs.json');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const programId = data.programs?.[0]?.program_id;
    expect(programId).toBeTruthy();

    const slugRes = await request.get(`/programs/${encodeURIComponent(programId)}.html`);
    expect(slugRes.ok()).toBeTruthy();

    await page.goto(`/programs/${encodeURIComponent(programId)}.html`);
    await expect(page.locator('#programDetail .program-detail-title, #programDetail h1')).toBeVisible();
  });

  for (const path of PRIORITY_PAGES) {
    test(`${path} has no fatal console errors`, async ({ page }) => {
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(err.message));

      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);

      const fatal = consoleErrors.filter(isFatalConsoleMessage);
      expect(fatal, fatal.join('\n')).toEqual([]);
    });
  }
});
