import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
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

      // Meta description is program-specific, not the shared template default,
      // and follows the match-facts-first CTR formula: it leads with the level
      // of care and closes with "Verified {Month YYYY}".
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toBeTruthy();
      expect(description).not.toBe(TEMPLATE_DEFAULT_DESCRIPTION);
      expect(description).toMatch(
        /\bVerified (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\.$/
      );
      // The old formula pasted raw pipe-delimited insurance_notes into the
      // snippet ("Plans: ... | Types: ... | ...").
      expect(description).not.toContain('|');
      expect(description.length).toBeLessThanOrEqual(300);

      // JSON-LD parses and describes a MedicalClinic for this program.
      const jsonLdText = await page.locator('#program-jsonld').textContent();
      const jsonLd = JSON.parse(jsonLdText);
      expect(jsonLd['@type']).toBe('MedicalClinic');
      expect(jsonLd.name).toBe(name);
      expect(jsonLd.url).toBe(`https://viablemhr.com/programs/${id}`);
      expect(jsonLd.medicalSpecialty).toBe('Psychiatry');
      // dateModified is the program's best-known last_verified date, which
      // every one of the 112 records has.
      expect(jsonLd.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(jsonLd.parentOrganization).toEqual({
        '@type': 'Organization',
        name: sample.organization,
      });

      // BreadcrumbList is its own block (validate-jsonld.js rejects a
      // top-level array, so the two objects cannot share one script tag).
      const crumbText = await page.locator('#program-breadcrumb-jsonld').textContent();
      const crumbs = JSON.parse(crumbText);
      expect(crumbs['@type']).toBe('BreadcrumbList');
      expect(crumbs.itemListElement).toHaveLength(3);
      expect(crumbs.itemListElement.map((c) => c.position)).toEqual([1, 2, 3]);
      expect(crumbs.itemListElement[0].item).toBe('https://viablemhr.com/');
      expect(crumbs.itemListElement[2].item).toBe(`https://viablemhr.com/programs/${id}`);
      // Middle crumb is a hub or the directory, always extensionless.
      expect(crumbs.itemListElement[1].item).toMatch(
        /^https:\/\/viablemhr\.com\/(php-programs|iop-programs|residential-programs|crisis-resources|directory)$/
      );
    });
  }

  test('every program page emits all locations[] as a PostalAddress array', () => {
    const data = JSON.parse(readFileSync(join(root, 'public', 'data', 'programs.json'), 'utf8'));
    // Cities that stand in for "no street location" (see PSEUDO_LOCATION_CITIES
    // in scripts/render-program-detail.js) never become a PostalAddress.
    const PSEUDO = new Set(['Virtual', 'Multiple', 'National']);
    const offenders = [];

    for (const p of data.programs || []) {
      if (!p.program_id || !/^[a-z0-9_-]+$/i.test(p.program_id)) continue;
      const html = readFileSync(join(distDir, 'programs', `${p.program_id}.html`), 'utf8');
      const m = html.match(
        /<script type="application\/ld\+json" id="program-jsonld">([\s\S]*?)<\/script>/
      );
      const ld = JSON.parse(m[1]);
      const expected = (p.locations || []).filter((l) => {
        const city = (l.city || '').trim();
        return city ? !PSEUDO.has(city) : Boolean((l.address || '').trim());
      }).length;

      if (expected === 0) {
        if (ld.address !== undefined) offenders.push(`${p.program_id}: expected no address, got one`);
        continue;
      }
      if (!Array.isArray(ld.address)) {
        offenders.push(`${p.program_id}: address is not an array`);
        continue;
      }
      if (ld.address.length !== expected) {
        offenders.push(`${p.program_id}: ${ld.address.length} addresses, expected ${expected}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('every dist/programs/*.html has a distinct meta description', () => {
    const programsDir = join(distDir, 'programs');
    const files = readdirSync(programsDir).filter((f) => f.endsWith('.html'));
    expect(files.length).toBeGreaterThan(0);

    const descriptions = files.map((f) => {
      const html = readFileSync(join(programsDir, f), 'utf8');
      const m = html.match(/<meta name="description" content="([^"]*)"/);
      return m ? m[1] : `__MISSING_DESCRIPTION__${f}`;
    });

    expect(new Set(descriptions).size).toBe(files.length);
  });

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

test.describe('List-page ItemList JSON-LD (hubs + directory)', () => {
  const LIST_PAGES = [
    { file: 'php-programs.html', url: 'https://viablemhr.com/php-programs' },
    { file: 'iop-programs.html', url: 'https://viablemhr.com/iop-programs' },
    { file: 'residential-programs.html', url: 'https://viablemhr.com/residential-programs' },
    { file: 'crisis-resources.html', url: 'https://viablemhr.com/crisis-resources' },
    { file: 'directory.html', url: 'https://viablemhr.com/directory' },
  ];

  for (const { file, url } of LIST_PAGES) {
    test(`dist/${file} has an ItemList matching its rendered links`, () => {
      const html = readFileSync(join(distDir, file), 'utf8');
      const m = html.match(/<script type="application\/ld\+json" id="list-jsonld">([\s\S]*?)<\/script>/);
      expect(m, `${file} has no list-jsonld block`).not.toBeNull();

      const ld = JSON.parse(m[1]);
      expect(ld['@type']).toBe('ItemList');
      expect(ld.url).toBe(url);
      expect(ld.itemListElement.length).toBeGreaterThan(0);
      expect(ld.numberOfItems).toBe(ld.itemListElement.length);
      expect(ld.itemListElement.map((i) => i.position)).toEqual(
        ld.itemListElement.map((_, i) => i + 1)
      );

      // Every ItemList url is an extensionless program URL, and the set matches
      // the /programs/ links the page actually renders — the JSON-LD must not
      // advertise a list the page does not show.
      const listUrls = ld.itemListElement.map((i) => i.url);
      for (const u of listUrls) {
        expect(u).toMatch(/^https:\/\/viablemhr\.com\/programs\/[a-z0-9_-]+$/i);
      }
      const renderedHrefs = [...html.matchAll(/<li><a href="(\/programs\/[^"]+)"/g)].map(
        (mm) => `https://viablemhr.com${mm[1]}`
      );
      expect(listUrls.sort()).toEqual(renderedHrefs.sort());
    });
  }
});

test.describe('sitemap-pages.xml is generated from the page manifest', () => {
  test('lastmod values are not all one hardcoded date', () => {
    // In a shallow clone (CI's default checkout) git log reports the tip
    // commit date for every file, so date variety cannot be observed there.
    // Full local checkouts and `npm run verify` still enforce it.
    let shallow = 'false';
    try {
      shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch (_) {
      /* not a git checkout at all — treat like shallow: variety unobservable */
      shallow = 'true';
    }
    test.skip(shallow === 'true', 'shallow git clone: per-file commit dates unavailable');
    const xml = readFileSync(join(distDir, 'sitemap-pages.xml'), 'utf8');
    const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    expect(lastmods.length).toBe(20);
    for (const d of lastmods) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The hand-maintained file had all 20 frozen at 2026-08-19; per-page git
    // commit dates must produce more than one distinct value.
    expect(new Set(lastmods).size).toBeGreaterThan(1);
  });

  test('changefreq values are legal sitemaps.org 0.9 values', () => {
    const xml = readFileSync(join(distDir, 'sitemap-pages.xml'), 'utf8');
    const legal = new Set(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']);
    const values = [...xml.matchAll(/<changefreq>([^<]+)<\/changefreq>/g)].map((m) => m[1]);
    expect(values.filter((v) => !legal.has(v))).toEqual([]);
  });

  test('every listed page resolves to a file the build actually wrote', () => {
    const xml = readFileSync(join(distDir, 'sitemap-pages.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const missing = locs.filter((loc) => {
      const path = loc.replace('https://viablemhr.com', '');
      const file = path === '/' || path === '' ? 'index.html' : `${path.replace(/^\//, '')}.html`;
      return !existsSync(join(distDir, file));
    });
    expect(missing).toEqual([]);
  });

  test('noindex/shell pages stay out of the page sitemap', () => {
    const xml = readFileSync(join(distDir, 'sitemap-pages.xml'), 'utf8');
    // handoff.html is noindex, program.html is the client shell (the indexable
    // form is /programs/{id}), 404.html is an error page, admin is never public.
    for (const excluded of ['/handoff', '/program<', '/404', '/admin']) {
      expect(xml).not.toContain(`https://viablemhr.com${excluded}`);
    }
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
