#!/usr/bin/env node
/**
 * Check verification_source, website_url, and insurance source URLs for all programs.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const programsPath = join(rootDir, 'public', 'data', 'programs.json');
const reportPath = join(rootDir, 'scripts', 'link-verification-report.json');

const URL_REGEX = /https?:\/\/[^\s)\]"'<>]+/gi;
const TIMEOUT_MS = 15000;
const CONCURRENCY = 8;

function extractUrlsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  return [...text.matchAll(URL_REGEX)].map((m) => m[0].replace(/[.,;]+$/, ''));
}

function getProgramUrls(program) {
  const fields = {};
  const add = (name, value) => {
    const urls = extractUrlsFromText(value);
    if (urls.length) fields[name] = urls;
  };
  add('verification_source', program.verification_source);
  add('website_url', program.website_url);
  add('website', program.website);
  if (program.accepted_insurance?.source_url) {
    add('accepted_insurance.source_url', program.accepted_insurance.source_url);
  }
  return fields;
}

const cache = new Map();

async function checkUrl(url, allowAlt = true) {
  if (cache.has(url)) return cache.get(url);

  const result = { url, ok: false, status: null, finalUrl: null, error: null };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ResourceNavigator/1.0; +https://viablemhr.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    result.status = res.status;
    result.finalUrl = res.url;
    result.ok = res.status >= 200 && res.status < 400;
    // Some provider sites return 403 to automated clients but serve browsers fine.
    if (!result.ok && res.status === 403) {
      result.ok = true;
      result.note = '403 (likely bot protection; manual/browser check recommended)';
    }
    if (!result.ok && res.status === 429) {
      result.ok = true;
      result.note = '429 rate limited during automated check';
    }
    if (!result.ok && res.status === 405) {
      const headRes = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResourceNavigator/1.0)' },
      });
      result.status = headRes.status;
      result.finalUrl = headRes.url;
      result.ok = headRes.status >= 200 && headRes.status < 400;
    }
  } catch (e) {
    result.error = e.name === 'AbortError' ? 'timeout' : e.message;
  }

  if (!result.ok && result.error && allowAlt) {
    try {
      const alt = url.includes('://www.')
        ? url.replace('://www.', '://')
        : url.replace('://', '://www.');
      if (alt !== url && !cache.has(alt)) {
        const altResult = await checkUrl(alt, false);
        if (altResult.ok) {
          result.ok = true;
          result.status = altResult.status;
          result.finalUrl = altResult.finalUrl;
          result.note = `reachable via alternate host: ${alt}`;
          result.error = null;
        }
      }
    } catch {
      /* ignore */
    }
  }

  cache.set(url, result);
  return result;
}

async function pool(items, fn, limit) {
  const results = [];
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

const data = JSON.parse(readFileSync(programsPath, 'utf8'));
const allUrls = new Set();
for (const p of data.programs) {
  const fields = getProgramUrls(p);
  for (const urls of Object.values(fields)) urls.forEach((u) => allUrls.add(u));
}

console.log(`Checking ${allUrls.size} unique URLs across ${data.programs.length} programs...\n`);

const urlList = [...allUrls];
const urlResults = await pool(urlList, (url) => checkUrl(url), CONCURRENCY);
const urlMap = Object.fromEntries(urlList.map((u, i) => [u, urlResults[i]]));

const programReports = [];

for (const program of data.programs) {
  const fields = getProgramUrls(program);
  const issues = [];
  for (const [field, urls] of Object.entries(fields)) {
    for (const url of urls) {
      const r = urlMap[url];
      if (!r.ok) {
        issues.push({
          field,
          url,
          status: r.status,
          error: r.error,
          finalUrl: r.finalUrl,
        });
      }
    }
  }
  const website = program.website_url || program.website;
  const verifyUrls = extractUrlsFromText(program.verification_source);
  const websiteMismatch =
    website &&
    verifyUrls.length > 0 &&
    !verifyUrls.some((u) => {
      try {
        const w = new URL(website.startsWith('http') ? website : `https://${website}`);
        const v = new URL(u);
        return w.hostname.replace(/^www\./, '') === v.hostname.replace(/^www\./, '');
      } catch {
        return false;
      }
    }) &&
    !verifyUrls.some((u) => website.includes(u) || u.includes(website));

  if (issues.length || websiteMismatch) {
    programReports.push({
      program_id: program.program_id,
      organization: program.organization,
      program_name: program.program_name,
      last_verified: program.last_verified,
      website_url: program.website_url,
      issues,
      website_hostname_mismatch: websiteMismatch || undefined,
    });
  }
}

const brokenUrlCount = Object.values(urlMap).filter((r) => !r.ok).length;
const summary = {
  checked_at: new Date().toISOString(),
  programs_total: data.programs.length,
  unique_urls: allUrls.size,
  broken_urls: brokenUrlCount,
  programs_with_issues: programReports.length,
  programs: programReports,
  broken_by_url: Object.values(urlMap)
    .filter((r) => !r.ok)
    .map((r) => ({ url: r.url, status: r.status, error: r.error })),
};

writeFileSync(reportPath, JSON.stringify(summary, null, 2));

console.log('=== Summary ===');
console.log(`Programs with issues: ${programReports.length}`);
console.log(`Broken unique URLs: ${brokenUrlCount}`);
console.log(`Report: ${reportPath}\n`);

for (const p of programReports) {
  console.log(`${p.program_id} — ${p.organization}`);
  for (const i of p.issues) {
    console.log(`  ✗ ${i.field}: ${i.url} → ${i.status || i.error}`);
  }
  if (p.website_hostname_mismatch) console.log(`  ⚠ website hostname differs from verification_source`);
}
