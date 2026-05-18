#!/usr/bin/env node
/**
 * Deep automated verification for every program:
 * - URL health (verification, website, insurance source)
 * - Hostname alignment between website and verification
 * - Optional on-page signals (phone, city) when HTML is fetchable
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const programsPath = join(rootDir, 'public', 'data', 'programs.json');
const reportPath = join(rootDir, 'scripts', 'full-program-verification-report.json');

const URL_REGEX = /https?:\/\/[^\s)\]"'<>]+/gi;
const TIMEOUT_MS = 20000;
const CONCURRENCY = 6;
const REVIEW_DATE = '2026-05-17';

function extractUrls(text) {
  if (!text || typeof text !== 'string') return [];
  return [...text.matchAll(URL_REGEX)].map((m) => m[0].replace(/[.,;]+$/, ''));
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function digitsPhone(s) {
  return (s || '').replace(/\D/g, '').slice(-10);
}

function getCheckUrls(program) {
  const set = new Set();
  extractUrls(program.verification_source).forEach((u) => set.add(u));
  if (program.website_url) set.add(program.website_url);
  if (program.website) set.add(program.website);
  if (program.accepted_insurance?.source_url) set.add(program.accepted_insurance.source_url);
  return [...set];
}

const urlCache = new Map();

async function fetchUrl(url, allowAlt = true) {
  if (urlCache.has(url)) return urlCache.get(url);

  const result = {
    url,
    ok: false,
    status: null,
    finalUrl: null,
    html: null,
    error: null,
    note: null,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    result.status = res.status;
    result.finalUrl = res.url;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/html')) {
      const text = await res.text();
      result.html = text.slice(0, 500000);
    }
    result.ok = res.status >= 200 && res.status < 400;
    if (res.status === 403) {
      result.ok = true;
      result.note = '403 (bot protection; likely OK in browser)';
    }
    if (res.status === 429) {
      result.ok = true;
      result.note = '429 (rate limited during automated check)';
    }
  } catch (e) {
    result.error = e.name === 'AbortError' ? 'timeout' : e.message;
  }

  if (!result.ok && result.error && allowAlt) {
    const alt = url.includes('://www.')
      ? url.replace('://www.', '://')
      : url.replace('://', '://www.');
    if (alt !== url) {
      const altResult = await fetchUrl(alt, false);
      if (altResult.ok) {
        result.ok = true;
        result.status = altResult.status;
        result.finalUrl = altResult.finalUrl;
        result.html = altResult.html;
        result.note = `reachable via ${alt}`;
        result.error = null;
      }
    }
  }

  urlCache.set(url, result);
  return result;
}

async function pool(items, fn, limit) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const force = process.argv.includes('--force');
const data = JSON.parse(readFileSync(programsPath, 'utf8'));
const alreadyReviewed = new Set(
  data.programs.filter((p) => p.last_verified === REVIEW_DATE).map((p) => p.program_id),
);

const toReview = force
  ? data.programs
  : data.programs.filter((p) => !alreadyReviewed.has(p.program_id));

if (toReview.length === 0) {
  console.log(
    `All ${data.programs.length} programs already marked ${REVIEW_DATE}. Use --force to re-check URLs.`,
  );
  process.exit(0);
}

console.log(
  `Reviewing ${toReview.length} programs${force ? ' (--force)' : ''} (skipped ${data.programs.length - toReview.length} already marked ${REVIEW_DATE})\n`,
);

const programResults = await pool(
  toReview,
  async (program) => {
    const urls = getCheckUrls(program);
    const urlResults = {};
    const urlIssues = [];
    for (const u of urls) {
      const r = await fetchUrl(u);
      urlResults[u] = {
        ok: r.ok,
        status: r.status,
        error: r.error,
        note: r.note,
        finalUrl: r.finalUrl,
      };
      if (!r.ok) {
        urlIssues.push({ url: u, status: r.status, error: r.error });
      }
    }

    const primaryVerify = extractUrls(program.verification_source)[0] || program.website_url;
    const primaryFetch = primaryVerify ? await fetchUrl(primaryVerify) : null;
    const html = primaryFetch?.html || '';

    const phone10 = digitsPhone(program.phone);
    const phoneOnPage =
      phone10.length === 10 &&
      html &&
      (html.includes(phone10) ||
        html.includes(program.phone) ||
        html.replace(/\D/g, '').includes(phone10));

    const city = program.locations?.[0]?.city;
    const cityOnPage =
      city && html && html.toLowerCase().includes(city.toLowerCase());

    const org = program.organization;
    const orgOnPage =
      org &&
      html &&
      html.toLowerCase().includes(org.split(/[’']/)[0].toLowerCase().slice(0, 12));

    const websiteHost = host(program.website_url || program.website);
    const verifyHosts = extractUrls(program.verification_source).map(host).filter(Boolean);
    const hostMismatch =
      websiteHost &&
      verifyHosts.length > 0 &&
      !verifyHosts.some(
        (vh) =>
          vh === websiteHost ||
          vh.endsWith(websiteHost) ||
          websiteHost.endsWith(vh) ||
          vh.split('.').slice(-2).join('.') === websiteHost.split('.').slice(-2).join('.'),
      );

    const daysSinceVerify = program.last_verified
      ? Math.floor((Date.now() - new Date(program.last_verified)) / 86400000)
      : null;

    const warnings = [];
    if (urlIssues.length) warnings.push('broken_url');
    if (hostMismatch) warnings.push('hostname_mismatch');
    if (primaryFetch?.html && phone10 && !phoneOnPage) warnings.push('phone_not_on_verify_page');
    if (primaryFetch?.html && city && !cityOnPage) warnings.push('city_not_on_verify_page');
    if (daysSinceVerify !== null && daysSinceVerify > 90) warnings.push('stale_last_verified');
    if (!primaryFetch?.html && primaryFetch?.ok) warnings.push('verify_page_not_html');

    return {
      program_id: program.program_id,
      organization: program.organization,
      program_name: program.program_name,
      last_verified: program.last_verified,
      days_since_verified: daysSinceVerify,
      website_url: program.website_url,
      verification_source: program.verification_source,
      url_issues: urlIssues,
      warnings,
      signals: {
        phone_on_page: phoneOnPage || null,
        city_on_page: cityOnPage || null,
        org_on_page: orgOnPage || null,
        primary_verify_status: primaryFetch?.status ?? null,
        primary_verify_note: primaryFetch?.note ?? null,
      },
    };
  },
  CONCURRENCY,
);

const needsFix = programResults.filter((r) => r.url_issues.length > 0);
const needsAttention = programResults.filter(
  (r) => r.warnings.length > 0 && !r.warnings.every((w) => w === 'stale_last_verified'),
);
const staleOnly = programResults.filter(
  (r) => r.warnings.length === 1 && r.warnings[0] === 'stale_last_verified',
);
const clean = programResults.filter((r) => r.warnings.length === 0);

const report = {
  reviewed_at: new Date().toISOString(),
  review_date_target: REVIEW_DATE,
  programs_reviewed: toReview.length,
  summary: {
    clean: clean.length,
    stale_only: staleOnly.length,
    needs_attention: needsAttention.length,
    broken_urls: needsFix.length,
  },
  broken_urls: needsFix,
  needs_attention: needsAttention,
  stale_only_ids: staleOnly.map((r) => r.program_id),
  all_results: programResults,
};

writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`=== Full review summary (${programResults.length} programs) ===`);
console.log(`Clean (links OK, signals OK): ${clean.length}`);
console.log(`Stale date only (links OK): ${staleOnly.length}`);
console.log(`Needs attention: ${needsAttention.length}`);
console.log(`Broken URLs: ${needsFix.length}`);
console.log(`Report: ${reportPath}\n`);

if (needsFix.length) {
  console.log('--- Broken URLs ---');
  for (const r of needsFix) {
    console.log(`${r.program_id}: ${r.url_issues.map((u) => `${u.url} (${u.status || u.error})`).join('; ')}`);
  }
}

if (needsAttention.length) {
  console.log('\n--- Needs attention (non-stale) ---');
  for (const r of needsAttention) {
    if (r.url_issues.length) continue;
    console.log(`${r.program_id} — ${r.warnings.join(', ')}`);
  }
}
