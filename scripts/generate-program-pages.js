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
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  renderProgramHead,
  renderProgramBody,
  programCanonicalUrl,
  programPublicPath,
  bestLastVerified,
} from './render-program-detail.js';
import { safeStr, escapeHtml } from '../src/js/utils/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const HEAD_MARKER = '<!--vmhr-program-head-->';
const DIRECTORY_LIST_MARKER = '<!--vmhr-directory-list-->';
const HUB_LIST_MARKER = '<!--vmhr-hub-list-->';
const BODY_START_MARKER = '<!--vmhr-program-body-start-->';
const BODY_END_MARKER = '<!--vmhr-program-body-end-->';

/**
 * Level-of-care hub pages (Task 7 / Phase 2). Each hub is a plain alphabetical
 * list of programs matching an explicit `matches` predicate over
 * `level_of_care` — never a fuzzy/substring match, so it's obvious from
 * reading the code exactly which data rows land on which hub.
 *
 * Threshold defense: every hub here has >=5 matching listings against the
 * current public/data/programs.json (PHP 44, IOP 45, Residential 5, Crisis
 * aggregate 11 = Mobile Crisis 5 + Crisis Hotline 4 + Walk-In Crisis / Urgent 1
 * + Psychiatric Triage 1). Outpatient (2) and Navigation (3) stay below the
 * >=5 threshold and intentionally do NOT get hub pages — they remain
 * reachable only via /directory. A hub whose predicate matches zero programs
 * throws at build time (see generateProgramPages()) rather than shipping a
 * silently empty page.
 */
const HUB_PAGES = [
  {
    file: 'php-programs.html',
    label: 'PHP',
    matches: (careLevel) => careLevel === 'Partial Hospitalization (PHP)',
  },
  {
    file: 'iop-programs.html',
    label: 'IOP',
    matches: (careLevel) => careLevel === 'Intensive Outpatient (IOP)',
  },
  {
    file: 'residential-programs.html',
    label: 'Residential',
    matches: (careLevel) => careLevel === 'Residential',
  },
  {
    file: 'crisis-resources.html',
    label: 'Crisis',
    // Explicit allowlist of the crisis-ish level_of_care strings present in
    // public/data/programs.json — deliberately not a fuzzy/substring match
    // (e.g. "Walk-In Outpatient" must NOT match this hub).
    matches: (careLevel) =>
      careLevel === 'Mobile Crisis' ||
      careLevel === 'Crisis Hotline' ||
      careLevel === 'Walk-In Crisis / Urgent' ||
      careLevel === 'Psychiatric Triage',
  },
];

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

  const sections = groupNames.map((care) => {
    const entries = groups.get(care).slice().sort((a, b) =>
      safeStr(a.program_name).localeCompare(safeStr(b.program_name))
    );

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

  return sections.join('\n    ');
}

/**
 * Renders the flat `<li>` items for one level-of-care hub page: every program
 * whose level_of_care satisfies `matches`, alphabetical by program_name (same
 * neutral, non-ranking ordering rule as buildDirectoryListHtml above). Only
 * the `<li>` items are returned — the surrounding `<ul>` lives in the hub's
 * HTML template around the vmhr-hub-list marker.
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

  return entries
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
    const directoryListHtml = buildDirectoryListHtml(programs);
    // Function replacement so a literal $&/$'/$` etc. in program data embedded
    // within directoryListHtml can never be interpreted by String.replace's
    // special-pattern substitution (see mustReplace() above for the same fix).
    const filledDirectory = directorySource.replace(DIRECTORY_LIST_MARKER, () => directoryListHtml);
    writeFileSync(directoryPath, filledDirectory, 'utf8');
    console.log(`Directory page: dist/directory.html filled with ${programs.length} programs`);
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
    const hubListHtml = buildHubListHtml(programs, hub.matches);
    const matchCount = programs.filter((p) => {
      const id = (p.program_id || '').toString().trim();
      return id && /^[a-z0-9_-]+$/i.test(id) && hub.matches(safeStr(p.level_of_care));
    }).length;
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
    console.log(`Hub page: dist/${hub.file} filled with ${matchCount} programs (${hub.label})`);
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

  // Emit dist/sitemap.xml as a sitemap index referencing /sitemap-pages.xml
  // (a later PR generates that file) and /sitemap-programs.xml. The build
  // copies public/sitemap.xml -> dist/sitemap.xml before this generator runs
  // (scripts/build.js), so this write is the one that ships.
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

  console.log(`Program slug pages: ${written} files → dist/programs/*.html`);
  console.log(`Sitemap: dist/sitemap-programs.xml (${written} URLs)`);
  console.log('Sitemap index: dist/sitemap.xml (references sitemap-pages.xml + sitemap-programs.xml)');
  return { count: written };
}
