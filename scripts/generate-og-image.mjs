/**
 * Regenerates public/og-image.png (1200x630), the site-wide Open Graph /
 * Twitter link-preview card.
 *
 * RUN MANUALLY — this is not part of `npm run build`. The PNG is committed;
 * only re-run this when the brand mark, palette, or tagline changes:
 *
 *   node scripts/generate-og-image.mjs
 *
 * There is no image tooling in devDependencies, so the card is rendered as
 * HTML and screenshotted with the Playwright chromium that the e2e suite
 * already installs. Colors are copied from the real tokens in
 * public/phase1-design.css (:root) so the card matches the site rather than
 * inventing a new look; the mark is public/brand-mark.svg inlined.
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const OUT = join(root, 'public', 'og-image.png');

// public/phase1-design.css :root
const BG = '#f7f6f3';
const INK = '#1c2434';
const MUTED = '#4a5362';
const ACCENT = '#2a9d8f';
const BLUE = '#4a7fd4';
const BORDER = 'rgba(28, 36, 52, 0.1)';

const brandMark = readFileSync(join(root, 'public', 'brand-mark.svg'), 'utf8');

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500;9..40,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: ${BG};
    color: ${INK};
    font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 88px;
    position: relative;
    overflow: hidden;
  }
  .accent-bar {
    position: absolute; top: 0; left: 0; right: 0; height: 10px;
    background: linear-gradient(90deg, ${ACCENT}, ${BLUE});
  }
  .brand { display: flex; align-items: center; gap: 22px; margin-bottom: 40px; }
  .brand svg { width: 88px; height: 88px; display: block; }
  .wordmark {
    font-family: "DM Sans", "Inter", sans-serif;
    font-weight: 700;
    font-size: 62px;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .tagline {
    font-size: 40px;
    line-height: 1.32;
    font-weight: 500;
    max-width: 22ch;
    letter-spacing: -0.01em;
  }
  .rule { width: 132px; height: 5px; border-radius: 3px; background: ${ACCENT}; margin: 36px 0 28px; }
  .foot {
    font-size: 27px;
    color: ${MUTED};
    letter-spacing: 0.01em;
  }
  .edge {
    position: absolute; right: -170px; bottom: -230px;
    width: 620px; height: 620px; border-radius: 50%;
    border: 2px solid ${BORDER};
  }
  .edge::after {
    content: ""; position: absolute; inset: 78px;
    border-radius: 50%; border: 2px solid ${BORDER};
  }
</style></head>
<body>
  <div class="accent-bar"></div>
  <div class="edge" aria-hidden="true"></div>
  <div class="brand">${brandMark}<span class="wordmark">ViableMHR</span></div>
  <p class="tagline">Youth mental health programs in Dallas&#8211;Fort Worth &#8212; searchable by insurance, age, and level of care</p>
  <div class="rule"></div>
  <p class="foot">viablemhr.com</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
// Web fonts load over the network; make sure they are applied before capture.
await page.evaluate(() => document.fonts.ready);
mkdirSync(dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();
console.log(`Wrote ${OUT} (1200x630)`);
