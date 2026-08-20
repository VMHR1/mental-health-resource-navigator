import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** First 6 valid program ids from public/data/programs.json, in file order (deterministic). */
function sampleProgramIds(count = 6) {
  const data = JSON.parse(readFileSync(join(root, 'public', 'data', 'programs.json'), 'utf8'));
  const programs = data.programs || [];
  return programs
    .filter((p) => p.program_id && /^[a-z0-9_-]+$/i.test(p.program_id))
    .slice(0, count)
    .map((p) => ({
      id: p.program_id,
      name: p.program_name,
      organization: p.organization,
      city: Array.isArray(p.locations) && p.locations[0] ? p.locations[0].city : '',
    }));
}

/** Mirrors composeDisambiguatedName() in scripts/render-program-detail.js (C1). */
function expectedDisambiguatedName({ name, organization, city }) {
  const tail = [organization, city].filter(Boolean).join(', ');
  const parts = [name];
  if (tail) parts.push(tail);
  return parts.filter(Boolean).join(' — ');
}

const STATIC_PAGES = [
  { path: '/', canonical: 'https://viablemhr.com/' },
  { path: '/guides.html', canonical: 'https://viablemhr.com/guides', ogTitle: 'Guides for families' },
  { path: '/about.html', canonical: 'https://viablemhr.com/about', ogTitle: 'About ViableMHR' },
  { path: '/submit.html', canonical: 'https://viablemhr.com/submit' },
  { path: '/privacy.html', canonical: 'https://viablemhr.com/privacy' },
  { path: '/terms.html', canonical: 'https://viablemhr.com/terms' },
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

  test('sitemap.xml is an index referencing sitemap-pages.xml and sitemap-programs.xml', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).not.toContain('program.html');
    expect(body).toContain('<sitemapindex');
    expect(body).toContain('https://viablemhr.com/sitemap-pages.xml');
    expect(body).toContain('https://viablemhr.com/sitemap-programs.xml');
    // Index itself lists only the two children, not a handoff to program.html or /sitemap.xml itself.
    const locMatches = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locMatches.sort()).toEqual(
      ['https://viablemhr.com/sitemap-pages.xml', 'https://viablemhr.com/sitemap-programs.xml'].sort()
    );
  });

  test('sitemap-pages.xml lists extensionless static page locs', async ({ request }) => {
    const res = await request.get('/sitemap-pages.xml');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain('https://viablemhr.com/guides');
    expect(body).toContain('https://viablemhr.com/about');
    expect(body).toContain('https://viablemhr.com/directory');
    expect(body).not.toContain('.html');
  });

  test('sampleProgramIds() sanity: yields the expected count', () => {
    expect(sampleProgramIds().length).toBe(6);
  });

  test('sitemap-programs.xml lists all programs with extensionless canonical locs', async ({ request }) => {
    const programIds = sampleProgramIds().map((p) => p.id);
    const res = await request.get('/sitemap-programs.xml');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).not.toContain('.html');
    for (const id of programIds) {
      expect(body).toContain(`https://viablemhr.com/programs/${id}</loc>`);
    }
  });

  test('about page has report outdated section', async ({ page }) => {
    await page.goto('/about.html#report-outdated');
    await expect(page.locator('#report-outdated')).toBeVisible();
    await expect(page.locator('a[href*="subject=Outdated"]')).toBeVisible();
  });
});

test.describe('Program detail page SEO (per-program static pages)', () => {
  const TEMPLATE_DEFAULT_DESCRIPTION =
    'Detailed information about a Texas youth mental health program on ViableMHR.';

  for (const sample of sampleProgramIds()) {
    const { id, name } = sample;
    test(`/programs/${id} has unique SEO metadata and rendered content`, async ({ page }) => {
      await page.goto(`/programs/${id}`);

      // Unique, disambiguated title (program_name alone collapses across
      // programs that share a level-of-care label — see C1).
      await expect(page).toHaveTitle(`${expectedDisambiguatedName(sample)} • ViableMHR`);

      // Extensionless canonical pointing at this program.
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://viablemhr.com/programs/${id}`
      );

      // H1 is the real program name, not the client-side loading shell.
      const h1 = page.locator('h1').first();
      await expect(h1).toHaveText(name);
      await expect(h1).not.toHaveText(/loading/i);

      // Meta description is program-specific, not the shared template default.
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toBeTruthy();
      expect(description).not.toBe(TEMPLATE_DEFAULT_DESCRIPTION);

      // JSON-LD parses and describes a MedicalOrganization for this program.
      const jsonLdText = await page.locator('#program-jsonld').textContent();
      const jsonLd = JSON.parse(jsonLdText);
      expect(jsonLd['@type']).toBe('MedicalOrganization');
      expect(jsonLd.name).toBe(name);
      expect(jsonLd.url).toBe(`https://viablemhr.com/programs/${id}`);
    });
  }

  test('every dist/programs/*.html has a distinct <title>', () => {
    const programsDir = join(root, 'dist', 'programs');
    const files = readdirSync(programsDir).filter((f) => f.endsWith('.html'));
    expect(files.length).toBeGreaterThan(0);

    const titles = files.map((f) => {
      const html = readFileSync(join(programsDir, f), 'utf8');
      const m = html.match(/<title>([^<]*)<\/title>/);
      return m ? m[1] : `__MISSING_TITLE__${f}`;
    });

    expect(new Set(titles).size).toBe(files.length);
  });
});
