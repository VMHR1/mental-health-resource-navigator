// ========== Canonical Content-Security-Policy profiles ==========
// Injected into HTML at build time. Edit here only — not per-page copies.

const STATCOUNTER = 'https://www.statcounter.com';
const STATCOUNTER_C = 'https://c.statcounter.com';
const CF_INSIGHTS = 'https://static.cloudflareinsights.com';
const FONTS_CSS = 'https://fonts.googleapis.com';
const FONTS_FILES = 'https://fonts.gstatic.com';

function buildDirective(parts) {
  return Object.entries(parts)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ');
}

/** @type {Record<string, string>} */
export const CSP_PROFILES = {
  /** Search, handoff, pro pages — no unsafe-eval */
  standard: buildDirective({
    'default-src': "'self'",
    'script-src': `'self' 'unsafe-inline' ${STATCOUNTER} ${CF_INSIGHTS}`,
    'style-src': `'self' 'unsafe-inline' ${FONTS_CSS}`,
    'img-src': "'self' data: https: " + STATCOUNTER_C,
    'connect-src': `'self' https://api.github.com https://formspree.io https://api.qrserver.com ${STATCOUNTER} ${STATCOUNTER_C}`,
    'font-src': `'self' data: ${FONTS_FILES}`,
    'base-uri': "'self'",
    'form-action': "'self' https://formspree.io",
  }),

  /** Legacy bundles on program/submit/about that may use eval */
  eval: buildDirective({
    'default-src': "'self'",
    'script-src': `'self' 'unsafe-inline' 'unsafe-eval' ${STATCOUNTER} ${CF_INSIGHTS}`,
    'style-src': `'self' 'unsafe-inline' ${FONTS_CSS}`,
    'img-src': "'self' data: https: " + STATCOUNTER_C,
    'connect-src': `'self' https://api.github.com https://formspree.io https://api.qrserver.com ${STATCOUNTER} ${STATCOUNTER_C}`,
    'font-src': `'self' data: ${FONTS_FILES}`,
    'base-uri': "'self'",
    'form-action': "'self' https://formspree.io",
  }),

  /** Submit wizard — Formspree only for connect */
  submit: buildDirective({
    'default-src': "'self'",
    'script-src': `'self' 'unsafe-inline' 'unsafe-eval' ${STATCOUNTER} ${CF_INSIGHTS}`,
    'style-src': `'self' 'unsafe-inline' ${FONTS_CSS}`,
    'img-src': "'self' data: https: " + STATCOUNTER_C,
    'connect-src': `'self' https://formspree.io ${STATCOUNTER} ${STATCOUNTER_C}`,
    'font-src': `'self' data: ${FONTS_FILES}`,
    'base-uri': "'self'",
    'form-action': "'self' https://formspree.io",
  }),

  /** Admin dashboard — no public form intake */
  admin: buildDirective({
    'default-src': "'self'",
    'script-src': `'self' 'unsafe-inline' 'unsafe-eval' ${STATCOUNTER} ${CF_INSIGHTS}`,
    'style-src': `'self' 'unsafe-inline' ${FONTS_CSS}`,
    'img-src': "'self' data: https: " + STATCOUNTER_C,
    'connect-src': `'self' ${STATCOUNTER} ${STATCOUNTER_C}`,
    'font-src': `'self' data: ${FONTS_FILES}`,
    'base-uri': "'self'",
  }),
};

/**
 * @param {string} profile
 * @returns {string}
 */
export function getCspMetaTag(profile) {
  const content = CSP_PROFILES[profile] || CSP_PROFILES.standard;
  return `<meta http-equiv="Content-Security-Policy" content="${content}">`;
}

/**
 * Replace <!-- VMHR_CSP:profile --> or any existing CSP meta in HTML.
 * @param {string} html
 * @param {string} profile
 */
export function applyCspToHtml(html, profile) {
  const meta = getCspMetaTag(profile);
  if (/<!-- VMHR_CSP:\w+ -->/.test(html)) {
    return html.replace(/<!-- VMHR_CSP:\w+ -->/, meta);
  }
  return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, meta);
}
