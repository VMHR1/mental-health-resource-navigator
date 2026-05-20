/**
 * Phase 2 — Generate one static HTML file per program under dist/programs/{program_id}.html
 * so crawlers and static hosts resolve shareable URLs without SPA rewrites.
 * Each file injects <base href="../"> and window.__ViableMHRProgramId for program-detail.js.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

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
  const urls = [];

  let written = 0;
  for (const p of programs) {
    const id = (p.program_id || '').toString().trim();
    if (!id || !/^[a-z0-9_-]+$/i.test(id)) continue;

    const inject =
      `<base href="../">\n` +
      `<script>window.__ViableMHRProgramId=${JSON.stringify(id)};</script>\n`;
    const marker = '<!--viablemhr-program-base-->';
    const html = templateSource.includes(marker)
      ? templateSource.replace(marker, inject)
      : templateSource.replace('<head>', `<head>\n${inject}`);

    writeFileSync(join(outDir, `${id}.html`), html, 'utf8');
    urls.push(`${baseUrl}/programs/${encodeURIComponent(id)}.html`);
    written += 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  const sitemapBody = urls
    .map(
      (loc) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.75</priority>
  </url>`
    )
    .join('\n');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapBody}
</urlset>
`;
  writeFileSync(join(root, 'dist', 'sitemap-programs.xml'), sitemap, 'utf8');
  console.log(`Program slug pages: ${written} files → dist/programs/*.html`);
  console.log(`Sitemap: dist/sitemap-programs.xml (${written} URLs)`);
  return { count: written };
}
