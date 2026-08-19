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
import { renderProgramHead, renderProgramBody, programCanonicalUrl, bestLastVerified } from './render-program-detail.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const HEAD_MARKER = '<!--vmhr-program-head-->';
const BODY_START_MARKER = '<!--vmhr-program-body-start-->';
const BODY_END_MARKER = '<!--vmhr-program-body-end-->';

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
  return html.replace(needle, replacement);
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

export function generateProgramPages() {
  const dataPath = join(root, 'public', 'data', 'programs.json');
  const templatePath = join(root, 'dist', 'program.html');
  if (!existsSync(templatePath)) {
    console.warn('generate-program-pages: dist/program.html missing; skip slug generation');
    return { count: 0 };
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
