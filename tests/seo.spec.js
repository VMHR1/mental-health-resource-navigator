import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');

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

test.describe('Site-wide title/canonical/JSON-LD guarantees (Task 13)', () => {
  /** Recursively list files under `dir` matching `predicate`, relative to `dir`. */
  function listFiles(dir, predicate) {
    const out = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        out.push(...listFiles(full, predicate).map((f) => join(entry, f)));
      } else if (predicate(entry)) {
        out.push(entry);
      }
    }
    return out;
  }

  function readDist(relPath) {
    return readFileSync(join(distDir, relPath), 'utf8');
  }

  // All non-admin pages: dist/*.html plus dist/programs/*.html. admin.html
  // only exists in dist at all when built with INCLUDE_ADMIN=1, but it's
  // excluded explicitly here rather than relying on that.
  const ALL_PAGES = listFiles(distDir, (name) => name.endsWith('.html')).filter(
    (relPath) => !relPath.split(/[\\/]/).includes('admin.html')
  );

  /** Decodes the small set of HTML entities escapeHtml() can produce, so an
   * og:url that went through escapeHtml() (which entity-encodes `/` as
   * `&#x2F;`) can still be compared byte-for-byte against a canonical that
   * did not. Both sides of every comparison below are decoded the same way. */
  function decodeEntities(s) {
    return s
      .replace(/&#x2F;/gi, '/')
      .replace(/&#47;/g, '/')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function extractAll(html, re) {
    return [...html.matchAll(re)].map((m) => m[1]);
  }

  test('sanity: found pages to scan', () => {
    expect(ALL_PAGES.length).toBeGreaterThan(100); // 20+ static/hub pages + 112 program pages
  });

  test('every page has exactly one <title>', () => {
    const offenders = [];
    for (const relPath of ALL_PAGES) {
      const html = readDist(relPath);
      const count = extractAll(html, /<title>([^<]*)<\/title>/g).length;
      if (count !== 1) offenders.push(`${relPath} (${count} <title> tags)`);
    }
    expect(offenders).toEqual([]);
  });

  test('titles are unique across the entire non-admin site', () => {
    const byTitle = new Map();
    for (const relPath of ALL_PAGES) {
      const html = readDist(relPath);
      const m = html.match(/<title>([^<]*)<\/title>/);
      const title = m ? m[1] : `__MISSING_TITLE__${relPath}`;
      if (!byTitle.has(title)) byTitle.set(title, []);
      byTitle.get(title).push(relPath);
    }
    const duplicates = [...byTitle.entries()].filter(([, pages]) => pages.length > 1);
    expect(duplicates).toEqual([]);
  });

  test('every page with a canonical has og:url equal to it (entities decoded)', () => {
    const mismatches = [];
    for (const relPath of ALL_PAGES) {
      const html = readDist(relPath);
      const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
      if (!canonicalMatch) continue; // no canonical on this page -- covered by the "required canonicals" test below
      const ogUrlMatch = html.match(/<meta property="og:url" content="([^"]+)"/);
      if (!ogUrlMatch) {
        mismatches.push(`${relPath}: has a canonical but no og:url tag`);
        continue;
      }
      const canonical = decodeEntities(canonicalMatch[1]);
      const ogUrl = decodeEntities(ogUrlMatch[1]);
      if (canonical !== ogUrl) {
        mismatches.push(`${relPath}: canonical="${canonical}" og:url="${ogUrl}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  // handoff.html is noindex (`<meta name="robots" content="noindex">`) and
  // its canonical is legitimately the .html URL rather than the extensionless
  // form every indexable page uses -- it is never meant to be crawled or
  // ranked, so there is no pretty-URL canonical for it to point at. Exempted
  // here (test file only; the page itself is untouched per Task 13 scope).
  const EXTENSION_EXEMPT_CANONICALS = new Set(['handoff.html']);

  test('every canonical is extensionless and on the https://viablemhr.com origin', () => {
    const offenders = [];
    for (const relPath of ALL_PAGES) {
      if (EXTENSION_EXEMPT_CANONICALS.has(relPath)) continue;
      const html = readDist(relPath);
      const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
      if (!canonicalMatch) continue;
      const canonical = decodeEntities(canonicalMatch[1]);
      if (!canonical.startsWith('https://viablemhr.com/')) {
        offenders.push(`${relPath}: canonical "${canonical}" is not on the https://viablemhr.com origin`);
        continue;
      }
      if (/\.html$/.test(canonical)) {
        offenders.push(`${relPath}: canonical "${canonical}" is not extensionless`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /** Extensionless page paths listed in dist/sitemap-pages.xml, mapped to the
   * dist/ file that must serve them (mirrors the mapping in
   * scripts/generate-program-pages.js / the sitemap generator). */
  function sitemapPageFiles() {
    const xml = readFileSync(join(distDir, 'sitemap-pages.xml'), 'utf8');
    const locs = extractAll(xml, /<loc>([^<]+)<\/loc>/g);
    return locs.map((loc) => {
      const path = loc.replace('https://viablemhr.com', '');
      if (path === '/' || path === '') return 'index.html';
      return `${path.replace(/^\//, '')}.html`;
    });
  }

  test('every page required to have a canonical (sitemap-pages.xml + all programs) has one', () => {
    expect(existsSync(join(distDir, 'sitemap-pages.xml'))).toBeTruthy();
    const requiredFiles = [...sitemapPageFiles()];
    if (existsSync(join(distDir, 'programs'))) {
      const programFiles = readdirSync(join(distDir, 'programs')).filter((f) => f.endsWith('.html'));
      requiredFiles.push(...programFiles.map((f) => join('programs', f)));
    }
    expect(requiredFiles.length).toBeGreaterThan(100); // 20+ static/hub pages + 112 programs

    const missingCanonical = requiredFiles.filter((relPath) => {
      const html = readDist(relPath);
      return !/<link rel="canonical" href="[^"]+"/.test(html);
    });
    expect(missingCanonical).toEqual([]);
  });
});
