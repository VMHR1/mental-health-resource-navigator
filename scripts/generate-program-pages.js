/**
 * Phase 2 — Generate one static HTML file per program under dist/programs/{program_id}.html
 * so crawlers and static hosts resolve shareable URLs without SPA rewrites.
 *
 * Each file gets full, unique per-program head tags (title, description, canonical,
 * og:*, JSON-LD) and a fully rendered detail article body — not just the client-side
 * loading shell — via scripts/render-program-detail.js. It also injects
 * <base href="../"> and window.__ViableMHRProgramId for program-detail.js, which a
 * later change will teach to skip re-rendering when it sees data-prerendered="true".
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { HUB_PAGES, DIRECTORY_PAGE } from './hub-config.js';
import { sitemapPages, pagePath } from './page-manifest.js';
import {
  renderProgramHead,
  renderProgramBody,
  programCanonicalUrl,
  programPublicPath,
  bestLastVerified,
} from './render-program-detail.js';
import { fillProfessionalPages } from './render-professional-pages.js';
import { safeStr, escapeHtml } from '../src/js/utils/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const HEAD_MARKER = '<!--vmhr-program-head-->';
const DIRECTORY_LIST_MARKER = '<!--vmhr-directory-list-->';
const HUB_LIST_MARKER = '<!--vmhr-hub-list-->';
const BODY_START_MARKER = '<!--vmhr-program-body-start-->';
const BODY_END_MARKER = '<!--vmhr-program-body-end-->';
const LIST_JSONLD_MARKER = '<!--vmhr-list-jsonld-->';

const SITE_BASE = 'https://viablemhr.com';

// HUB_PAGES lives in scripts/hub-config.js so scripts/render-program-detail.js
// can use the same table to pick each program page's breadcrumb hub.

const KNOWN_TITLE = '<title>Program Details • ViableMHR</title>';
const KNOWN_DESCRIPTION =
  '<meta name="description" content="Detailed information about a Texas youth mental health program on ViableMHR." />';
const KNOWN_OG_TITLE = '<meta property="og:title" content="Program Details • ViableMHR">';
const KNOWN_OG_DESCRIPTION =
  '<meta property="og:description" content="Detailed information about a Texas youth mental health program on ViableMHR.">';
const KNOWN_OG_URL = '<meta property="og:url" content="https://viablemhr.com/program.html">';

/** Replaces the first (and only expected) occurrence of `needle`; throws if absent. */
function mustReplace(html, needle, replacement, label) {
  if (!html.includes(needle)) {
    throw new Error(`generate-program-pages: expected to find ${label} in dist/program.html but it was missing`);
  }
  // Function replacement so a literal $&/$'/$` etc. in data-derived `replacement`
  // can never be interpreted by String.replace's special-pattern substitution.
  return html.replace(needle, () => replacement);
}

function renderProgramPage(templateSource, program, allPrograms) {
  const head = renderProgramHead(program);

  let html = templateSource;
  html = mustReplace(html, KNOWN_TITLE, `<title>${head.title}</title>`, 'the <title> tag');
  html = mustReplace(
    html,
    KNOWN_DESCRIPTION,
    `<meta name="description" content="${head.metaDescriptionEsc}" />`,
    'the meta description tag'
  );
  html = mustReplace(
    html,
    KNOWN_OG_TITLE,
    `<meta property="og:title" content="${head.ogTitle}">`,
    'the og:title tag'
  );
  html = mustReplace(
    html,
    KNOWN_OG_DESCRIPTION,
    `<meta property="og:description" content="${head.ogDescription}">`,
    'the og:description tag'
  );
  html = mustReplace(
    html,
    KNOWN_OG_URL,
    `<meta property="og:url" content="${head.ogUrl}">`,
    'the og:url tag'
  );
  html = mustReplace(html, HEAD_MARKER, head.headHtml, 'the vmhr-program-head marker');

  const bodyStartIdx = html.indexOf(BODY_START_MARKER);
  const bodyEndIdx = html.indexOf(BODY_END_MARKER);
  if (bodyStartIdx === -1 || bodyEndIdx === -1 || bodyEndIdx < bodyStartIdx) {
    throw new Error('generate-program-pages: expected to find vmhr-program-body markers in dist/program.html but they were missing or out of order');
  }
  const bodyHtml = renderProgramBody(program, allPrograms);
  html =
    html.slice(0, bodyStartIdx) +
    bodyHtml +
    html.slice(bodyEndIdx + BODY_END_MARKER.length);

  return html;
}

/**
 * Renders the full static directory list for dist/directory.html: every program,
 * grouped by level_of_care and listed within an unordered list per group so no
 * ordering reads as a ranking.
 *
 * Group order is fixed at build time as a plain alphabetical sort of the
 * level_of_care values present in the data — an arbitrary-but-stable rule
 * chosen only to make output deterministic across builds. It is NOT a ranking
 * of level-of-care importance or urgency. Entries within a group are also
 * alphabetical by program_name, for the same reason.
 *
 * Returns `{ html, entries }` — `entries` is the same programs in the same
 * order the HTML lists them, so the ItemList JSON-LD is generated from the
 * rendered order rather than from a second sort that could drift out of step
 * with it.
 */
export function buildDirectoryListHtml(programs) {
  const list = Array.isArray(programs) ? programs : [];

  const groups = new Map();
  for (const p of list) {
    // Only list programs that actually get a static page written (same id
    // check as the per-program loop below) so every directory link resolves.
    const id = (p.program_id || '').toString().trim();
    if (!id || !/^[a-z0-9_-]+$/i.test(id)) continue;

    const care = safeStr(p.level_of_care) || 'Unspecified';
    if (!groups.has(care)) groups.set(care, []);
    groups.get(care).push(p);
  }

  const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const ordered = [];

  const sections = groupNames.map((care) => {
    const entries = groups.get(care).slice().sort((a, b) =>
      safeStr(a.program_name).localeCompare(safeStr(b.program_name))
    );
    ordered.push(...entries);

    const items = entries.map((p) => {
      const name = escapeHtml(safeStr(p.program_name) || 'Program');
      const org = safeStr(p.organization);
      // programPublicPath() only ever emits `/programs/{id}` where id already
      // passed the `/^[a-z0-9_-]+$/i` filter above, so it is already
      // attribute-safe; escapeHtml() would HTML-entity-encode its slashes
      // (&#x2F;) which is harmless to browsers but breaks plain-text link
      // audits expecting literal href="/programs/...".
      const href = programPublicPath(p.program_id || '');

      const locs = Array.isArray(p.locations) ? p.locations : [];
      const first = locs[0] || {};
      const city = safeStr(first.city);
      const state = safeStr(first.state);
      // escapeHtml() trims via safeStr() first, which would eat a leading
      // space, so the " (" separator is added after escaping, not inside it.
      let locText = '';
      if (city && state) locText = ` (${escapeHtml(city)}, ${escapeHtml(state)})`;
      else if (city) locText = ` (${escapeHtml(city)})`;

      const orgText = org ? ` — ${escapeHtml(org)}` : '';
      return `<li><a href="${href}">${name}</a>${orgText}${locText}</li>`;
    }).join('\n        ');

    return `<div class="directory-group">
      <h2>${escapeHtml(care)}</h2>
      <ul>
        ${items}
      </ul>
    </div>`;
  });

  return { html: sections.join('\n    '), entries: ordered };
}

/**
 * Renders the flat `<li>` items for one level-of-care hub page: every program
 * whose level_of_care satisfies `matches`, alphabetical by program_name (same
 * neutral, non-ranking ordering rule as buildDirectoryListHtml above). Only
 * the `<li>` items are returned — the surrounding `<ul>` lives in the hub's
 * HTML template around the vmhr-hub-list marker.
 *
 * Returns `{ html, count, entries }` — `count` and `entries` are derived from
 * the same filtered list that produced `html`, so callers never need a second,
 * potentially-drifting filter pass just to get a count or to build the
 * matching ItemList JSON-LD.
 */
export function buildHubListHtml(programs, matches) {
  const list = Array.isArray(programs) ? programs : [];

  const entries = list
    .filter((p) => {
      const id = (p.program_id || '').toString().trim();
      if (!id || !/^[a-z0-9_-]+$/i.test(id)) return false;
      return matches(safeStr(p.level_of_care));
    })
    .sort((a, b) => safeStr(a.program_name).localeCompare(safeStr(b.program_name)));

  const html = entries
    .map((p) => {
      const name = escapeHtml(safeStr(p.program_name) || 'Program');
      const org = safeStr(p.organization);
      const href = programPublicPath(p.program_id || '');

      const locs = Array.isArray(p.locations) ? p.locations : [];
      const first = locs[0] || {};
      const city = safeStr(first.city);
      const state = safeStr(first.state);
      let locText = '';
      if (city && state) locText = ` (${escapeHtml(city)}, ${escapeHtml(state)})`;
      else if (city) locText = ` (${escapeHtml(city)})`;

      const orgText = org ? ` — ${escapeHtml(org)}` : '';
      return `<li><a href="${href}">${name}</a>${orgText}${locText}</li>`;
    })
    .join('\n        ');

  return { html, count: entries.length, entries };
}

/**
 * ItemList JSON-LD for a list page (the 4 level-of-care hubs and /directory).
 *
 * `position` is the 1-based index in the alphabetical order the page already
 * renders — schema.org requires ItemList positions to be sequential, and the
 * pages state in visible copy that entries are alphabetical, not ranked. The
 * neutrality claim is unaffected: nothing here encodes preference, payment, or
 * a quality score, and the order comes from the same array that produced the
 * visible `<li>` items.
 *
 * Emitted as a single top-level object (not an array) because
 * scripts/validate-jsonld.js rejects a top-level array in any ld+json block.
 */
export function buildItemListJson(entries, listName, pageUrl) {
  const list = Array.isArray(entries) ? entries : [];
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    url: pageUrl,
    numberOfItems: list.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: list.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: safeStr(p.program_name) || 'Program',
      url: `${SITE_BASE}${programPublicPath(p.program_id || '')}`,
    })),
  };
  return JSON.stringify(ld).replace(/</g, '\\u003c');
}

/** Injects an ItemList block at the vmhr-list-jsonld marker of a built list page. */
function injectListJsonLd(distPath, relLabel, entries, listName, pageUrl) {
  const source = readFileSync(distPath, 'utf8');
  if (!source.includes(LIST_JSONLD_MARKER)) {
    throw new Error(
      `generate-program-pages: expected to find the vmhr-list-jsonld marker in dist/${relLabel} but it was missing`
    );
  }
  const script = `<script type="application/ld+json" id="list-jsonld">${buildItemListJson(entries, listName, pageUrl)}</script>`;
  // Function replacement so a literal $&/$'/$` in program data embedded in the
  // JSON can never be interpreted by String.replace's special-pattern rules.
  writeFileSync(distPath, source.replace(LIST_JSONLD_MARKER, () => script), 'utf8');
}

/**
 * `<lastmod>` for a static page: the commit date of its source file, so a page
 * that has not changed does not claim to be fresh. Falls back to the build date
 * when git is unavailable or the file has no commit yet (a new page in a dirty
 * tree, or a CI checkout with no history for it).
 */
function sourceLastModified(srcRelPath, fallbackDate) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', srcRelPath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch (_) {
    /* git missing, not a repo, or no commit touching this path */
  }
  return fallbackDate;
}

/**
 * dist/sitemap-pages.xml, generated from the shared page manifest
 * (scripts/page-manifest.js) instead of the hand-maintained
 * public/sitemap-pages.xml, whose 20 `<lastmod>` values were all frozen at
 * 2026-08-19 and had no mechanical link to the pages the build actually ships.
 */
export function buildPagesSitemap(fallbackDate) {
  const body = sitemapPages()
    .map(({ src, dest, sitemap }) => {
      const loc = `${SITE_BASE}${pagePath(dest)}`;
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${sourceLastModified(src, fallbackDate)}</lastmod>
    <changefreq>${sitemap.changefreq}</changefreq>
    <priority>${sitemap.priority}</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function generateProgramPages() {
  const dataPath = join(root, 'public', 'data', 'programs.json');
  const templatePath = join(root, 'dist', 'program.html');
  if (!existsSync(templatePath)) {
    throw new Error('generate-program-pages: dist/program.html missing; cannot generate slug pages');
  }
  const data = JSON.parse(readFileSync(dataPath, 'utf8'));
  const programs = data.programs || [];
  const templateSource = readFileSync(templatePath, 'utf8');

  const outDir = join(root, 'dist', 'programs');
  mkdirSync(outDir, { recursive: true });

  const baseUrl = 'https://viablemhr.com';
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];

  let written = 0;
  for (const p of programs) {
    const id = (p.program_id || '').toString().trim();
    if (!id || !/^[a-z0-9_-]+$/i.test(id)) continue;

    const inject =
      `<base href="../">\n` +
      `<script>window.__ViableMHRProgramId=${JSON.stringify(id)};</script>\n`;
    const marker = '<!--viablemhr-program-base-->';
    let html = templateSource.includes(marker)
      ? templateSource.replace(marker, inject)
      : templateSource.replace('<head>', `<head>\n${inject}`);

    html = renderProgramPage(html, p, programs);

    writeFileSync(join(outDir, `${id}.html`), html, 'utf8');

    const lastVerified = bestLastVerified(p);
    const lastmod = lastVerified || today;
    urls.push({ loc: programCanonicalUrl(id), lastmod });
    written += 1;
  }

  // Fill the static directory page (dist/directory.html) with the same
  // program list, in the same data pass, so it and the per-program pages
  // never drift out of sync.
  const directoryPath = join(root, 'dist', 'directory.html');
  if (existsSync(directoryPath)) {
    const directorySource = readFileSync(directoryPath, 'utf8');
    if (!directorySource.includes(DIRECTORY_LIST_MARKER)) {
      throw new Error(
        'generate-program-pages: expected to find the vmhr-directory-list marker in dist/directory.html but it was missing'
      );
    }
    const { html: directoryListHtml, entries: directoryEntries } = buildDirectoryListHtml(programs);
    // Function replacement so a literal $&/$'/$` etc. in program data embedded
    // within directoryListHtml can never be interpreted by String.replace's
    // special-pattern substitution (see mustReplace() above for the same fix).
    const filledDirectory = directorySource.replace(DIRECTORY_LIST_MARKER, () => directoryListHtml);
    writeFileSync(directoryPath, filledDirectory, 'utf8');
    injectListJsonLd(
      directoryPath,
      DIRECTORY_PAGE.file,
      directoryEntries,
      DIRECTORY_PAGE.listName,
      `${baseUrl}${DIRECTORY_PAGE.path}`
    );
    console.log(`Directory page: dist/directory.html filled with ${programs.length} programs + ItemList JSON-LD (${directoryEntries.length} items)`);
  } else {
    throw new Error('generate-program-pages: dist/directory.html missing; cannot fill directory list');
  }

  // Fill the 4 level-of-care hub pages in the same data pass so they never
  // drift from the directory/program pages. A hub whose predicate matches
  // zero programs fails the build loudly rather than shipping silently empty.
  for (const hub of HUB_PAGES) {
    const hubPath = join(root, 'dist', hub.file);
    if (!existsSync(hubPath)) {
      throw new Error(`generate-program-pages: dist/${hub.file} missing; cannot fill hub list`);
    }
    const hubSource = readFileSync(hubPath, 'utf8');
    if (!hubSource.includes(HUB_LIST_MARKER)) {
      throw new Error(
        `generate-program-pages: expected to find the vmhr-hub-list marker in dist/${hub.file} but it was missing`
      );
    }
    const { html: hubListHtml, count: matchCount, entries: hubEntries } = buildHubListHtml(programs, hub.matches);
    if (matchCount === 0) {
      throw new Error(
        `generate-program-pages: hub dist/${hub.file} (${hub.label}) matched 0 programs; a level-of-care hub must never ship empty`
      );
    }
    // Function replacement so a literal $&/$'/$` etc. in program data
    // embedded within hubListHtml can never be interpreted by
    // String.replace's special-pattern substitution (see mustReplace() above).
    const filledHub = hubSource.replace(HUB_LIST_MARKER, () => hubListHtml);
    writeFileSync(hubPath, filledHub, 'utf8');
    injectListJsonLd(hubPath, hub.file, hubEntries, hub.listName, `${baseUrl}${hub.path}`);
    console.log(`Hub page: dist/${hub.file} filled with ${matchCount} programs + ItemList JSON-LD (${hub.label})`);
  }

  const sitemapBody = urls
    .map(
      ({ loc, lastmod }) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.75</priority>
  </url>`
    )
    .join('\n');

  const programsSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapBody}
</urlset>
`;
  writeFileSync(join(root, 'dist', 'sitemap-programs.xml'), programsSitemap, 'utf8');

  // dist/sitemap-pages.xml is generated here from the shared page manifest,
  // replacing the hand-maintained public/sitemap-pages.xml.
  const pagesSitemap = buildPagesSitemap(today);
  writeFileSync(join(root, 'dist', 'sitemap-pages.xml'), pagesSitemap, 'utf8');
  const pageUrlCount = sitemapPages().length;

  // Emit dist/sitemap.xml as a sitemap index referencing /sitemap-pages.xml
  // and /sitemap-programs.xml. The build copies public/sitemap.xml ->
  // dist/sitemap.xml before this generator runs (scripts/build.js), so this
  // write is the one that ships.
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap-pages.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-programs.xml</loc>
  </sitemap>
</sitemapindex>
`;
  writeFileSync(join(root, 'dist', 'sitemap.xml'), sitemapIndex, 'utf8');

  // Fill the three professional-layer pages (boards, changelog,
  // regional-snapshot) with build-time rendered content in the same pass —
  // see scripts/render-professional-pages.js for the pro-gate exposure
  // analysis behind rendering these fully rather than a gated subset.
  fillProfessionalPages({ readFileSync, writeFileSync, join, root });

  console.log(`Program slug pages: ${written} files → dist/programs/*.html`);
  console.log(`Sitemap: dist/sitemap-programs.xml (${written} URLs)`);
  console.log(`Sitemap: dist/sitemap-pages.xml (${pageUrlCount} URLs, generated from scripts/page-manifest.js)`);
  console.log('Sitemap index: dist/sitemap.xml (references sitemap-pages.xml + sitemap-programs.xml)');
  return { count: written };
}
