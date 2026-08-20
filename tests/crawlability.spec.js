/**
 * Filesystem-based crawlability/SEO-safety checks against the built `dist/`
 * output — no browser, so these run fast and exercise exactly what a crawler
 * or static host would see. Run `npm run build` before this spec; it reads
 * whatever is currently in dist/, it does not build.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { renderProgramBody } from '../scripts/render-program-detail.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');

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

/** Extracts every href attribute value from a raw HTML string. */
function extractHrefs(html) {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Maps an href found in the built HTML to the dist/ file it resolves to, or
 * null if it's not a same-site page link (external, mailto:, tel:, sms:,
 * anchor-only, or a data file).
 */
function hrefToDistFile(href) {
  if (!href || /^(https?:)?\/\//.test(href) || /^(mailto|tel|sms|javascript):/.test(href) || href.startsWith('#')) {
    return null;
  }
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return null;

  if (clean === '/' ) return 'index.html';
  if (clean === '/directory' || clean === 'directory.html') return 'directory.html';

  const programMatch = clean.match(/^\/programs\/([a-z0-9_-]+)$/i);
  if (programMatch) return join('programs', `${programMatch[1]}.html`);

  if (clean.endsWith('.html')) {
    return clean.replace(/^\//, '');
  }
  return null;
}

test.describe('Crawlability: link graph', () => {
  test('homepage -> /directory -> every program id, all within 2 hops', () => {
    expect(existsSync(distDir)).toBeTruthy();

    const homeHtml = readDist('index.html');
    const homeHrefs = extractHrefs(homeHtml).map(hrefToDistFile).filter(Boolean);
    expect(homeHrefs).toContain('directory.html');

    const directoryHtml = readDist('directory.html');
    const directoryHrefs = extractHrefs(directoryHtml).map(hrefToDistFile).filter(Boolean);
    const programHrefsFromDirectory = directoryHrefs.filter((f) => f.startsWith(`programs${'/'}`));

    // Every program page that actually exists on disk must be linked from
    // the directory page (home -> directory -> program = 2 hops).
    const programFilesOnDisk = readdirSync(join(distDir, 'programs')).filter((f) => f.endsWith('.html'));
    expect(programFilesOnDisk.length).toBeGreaterThan(0);

    const linkedProgramFiles = new Set(programHrefsFromDirectory.map((f) => f.replace(/^programs\//, '')));
    const unreachable = programFilesOnDisk.filter((f) => !linkedProgramFiles.has(f));

    expect(unreachable).toEqual([]);
    expect(linkedProgramFiles.size).toBe(programFilesOnDisk.length);
  });
});

test.describe('Crawlability: crisis line presence', () => {
  const htmlFiles = listFiles(distDir, (name) => name.endsWith('.html')).filter(
    (relPath) => !relPath.split(/[\\/]/).includes('admin.html')
  );

  test('at least one page was found to check (sanity)', () => {
    expect(htmlFiles.length).toBeGreaterThan(50); // homepage, directory, static pages, 100+ program pages
  });

  for (const relPath of htmlFiles) {
    test(`${relPath} contains the 988 crisis line`, () => {
      const html = readDist(relPath);
      expect(html).toContain('988');
    });
  }
});

test.describe('Crawlability: no ranking/sponsorship language', () => {
  // The directory's neutrality disclaimer ("This site does not rank or
  // recommend one program as best.") legitimately contains the words
  // "recommend" and "best" while explicitly disclaiming ranking — a known
  // false positive for the naive word-boundary regex below. It is stripped
  // before scanning so the assertion still tests real generated program/
  // directory copy rather than being weakened to always pass.
  const RANKING_LANGUAGE = /\b(best|top[- ]?rated|top \d|recommended|#1|sponsored)\b/i;
  const NEUTRALITY_DISCLAIMER = 'This site does not rank or recommend one program as best.';

  test('no ranking/sponsorship language in dist/directory.html (excluding the neutrality disclaimer)', () => {
    const html = readDist('directory.html').split(NEUTRALITY_DISCLAIMER).join('');
    expect(html).not.toMatch(RANKING_LANGUAGE);
  });

  test('no ranking/sponsorship language in any dist/programs/*.html', () => {
    const programFiles = readdirSync(join(distDir, 'programs')).filter((f) => f.endsWith('.html'));
    expect(programFiles.length).toBeGreaterThan(0);
    const offenders = programFiles.filter((f) => RANKING_LANGUAGE.test(readDist(join('programs', f))));
    expect(offenders).toEqual([]);
  });
});

test.describe('Crawlability: XSS-safe program rendering', () => {
  test('renderProgramBody escapes a malicious program record (no unescaped <script)', () => {
    const maliciousProgram = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'malicious-program.json'), 'utf8')
    );
    const html = renderProgramBody(maliciousProgram, [maliciousProgram]);

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    // The dangerous payloads should still be present, just neutralized as
    // escaped text — the raw "onerror=" substring is expected to survive
    // (harmless once its surrounding `<img ...>` is HTML-escaped), so the
    // real assertion is that the tag delimiters themselves never survive.
    expect(html).toContain('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // phone/website_url both carry a javascript: payload in the fixture;
    // normalizePhoneForTel/safeHttpUrl must neutralize both so no href
    // attribute in the output ever resolves to a javascript: URL (see M9).
    expect(html).not.toMatch(/href="javascript:/i);
  });
});
