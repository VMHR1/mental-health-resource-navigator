/**
 * Single source of truth for the HTML pages this site ships.
 *
 * `scripts/build.js` reads this to know what to copy into `dist/` and which
 * CSP profile each page gets; `scripts/generate-program-pages.js` reads the
 * same list to emit `dist/sitemap-pages.xml`. Keeping one list means a new
 * page cannot ship without also appearing in (or being explicitly excluded
 * from) the sitemap — the previous hand-maintained `public/sitemap-pages.xml`
 * had every `<lastmod>` frozen at 2026-08-19 and no mechanical link to the
 * pages actually built.
 *
 * `sitemap: false` means the page is deliberately not listed:
 *   - `admin.html`   — only built with INCLUDE_ADMIN=1, never public.
 *   - `program.html` — the client-side shell; the indexable form of every
 *                      program is /programs/{id} in sitemap-programs.xml.
 *   - `handoff.html` — `<meta name="robots" content="noindex">` (pro-gated).
 *   - `404.html`     — error page, must never be indexed.
 * Everything else carries `{ priority, changefreq }` used verbatim in the
 * generated sitemap. The resulting URL set is the same 20 URLs the
 * hand-maintained file listed.
 */

/** @type {{src: string, dest: string, csp: string, adminOnly?: boolean, sitemap: false | {priority: string, changefreq: string}}[]} */
export const PAGES = [
  { src: 'src/html/index.html', dest: 'index.html', csp: 'standard', sitemap: { priority: '1.0', changefreq: 'weekly' } },
  { src: 'src/html/admin.html', dest: 'admin.html', csp: 'admin', adminOnly: true, sitemap: false },
  { src: 'src/html/program.html', dest: 'program.html', csp: 'eval', sitemap: false },
  { src: 'src/html/submit.html', dest: 'submit.html', csp: 'submit', sitemap: { priority: '0.7', changefreq: 'monthly' } },
  { src: 'src/html/guides.html', dest: 'guides.html', csp: 'standard', sitemap: { priority: '0.8', changefreq: 'monthly' } },
  { src: 'src/html/guide-how-to-search.html', dest: 'guide-how-to-search.html', csp: 'standard', sitemap: { priority: '0.7', changefreq: 'monthly' } },
  { src: 'src/html/guide-levels-of-care.html', dest: 'guide-levels-of-care.html', csp: 'standard', sitemap: { priority: '0.7', changefreq: 'monthly' } },
  { src: 'src/html/guide-what-to-ask.html', dest: 'guide-what-to-ask.html', csp: 'standard', sitemap: { priority: '0.7', changefreq: 'monthly' } },
  { src: 'src/html/directory.html', dest: 'directory.html', csp: 'standard', sitemap: { priority: '0.9', changefreq: 'weekly' } },
  { src: 'src/html/php-programs.html', dest: 'php-programs.html', csp: 'standard', sitemap: { priority: '0.7', changefreq: 'weekly' } },
  { src: 'src/html/iop-programs.html', dest: 'iop-programs.html', csp: 'standard', sitemap: { priority: '0.7', changefreq: 'weekly' } },
  { src: 'src/html/residential-programs.html', dest: 'residential-programs.html', csp: 'standard', sitemap: { priority: '0.7', changefreq: 'weekly' } },
  { src: 'src/html/crisis-resources.html', dest: 'crisis-resources.html', csp: 'standard', sitemap: { priority: '0.7', changefreq: 'weekly' } },
  { src: 'src/html/about.html', dest: 'about.html', csp: 'eval', sitemap: { priority: '0.6', changefreq: 'monthly' } },
  { src: 'src/html/privacy.html', dest: 'privacy.html', csp: 'eval', sitemap: { priority: '0.3', changefreq: 'yearly' } },
  { src: 'src/html/terms.html', dest: 'terms.html', csp: 'eval', sitemap: { priority: '0.3', changefreq: 'yearly' } },
  { src: 'src/html/professionals.html', dest: 'professionals.html', csp: 'standard', sitemap: { priority: '0.8', changefreq: 'monthly' } },
  { src: 'src/html/boards.html', dest: 'boards.html', csp: 'standard', sitemap: { priority: '0.7', changefreq: 'monthly' } },
  { src: 'src/html/report-outdated.html', dest: 'report-outdated.html', csp: 'standard', sitemap: { priority: '0.5', changefreq: 'monthly' } },
  // The hand-maintained file said changefreq "quarterly", which is not one of
  // the seven values the sitemaps.org 0.9 schema allows; "monthly" is the
  // nearest legal value.
  { src: 'src/html/regional-snapshot.html', dest: 'regional-snapshot.html', csp: 'standard', sitemap: { priority: '0.5', changefreq: 'monthly' } },
  { src: 'src/html/changelog.html', dest: 'changelog.html', csp: 'standard', sitemap: { priority: '0.4', changefreq: 'monthly' } },
  { src: 'src/html/export.html', dest: 'export.html', csp: 'standard', sitemap: { priority: '0.4', changefreq: 'monthly' } },
  { src: 'src/html/handoff.html', dest: 'handoff.html', csp: 'standard', sitemap: false },
  { src: 'src/html/404.html', dest: '404.html', csp: 'standard', sitemap: false },
];

/** The pages build.js should copy for this run (admin only when INCLUDE_ADMIN=1). */
export function buildPages(includeAdmin) {
  return PAGES.filter((p) => !p.adminOnly || includeAdmin).map(({ src, dest, csp }) => ({ src, dest, csp }));
}

/** Extensionless site path for a built page (`index.html` -> `/`). */
export function pagePath(dest) {
  if (dest === 'index.html') return '/';
  return `/${dest.replace(/\.html$/, '')}`;
}

/** The sitemap-listed pages, in manifest order. */
export function sitemapPages() {
  return PAGES.filter((p) => p.sitemap && !p.adminOnly);
}
