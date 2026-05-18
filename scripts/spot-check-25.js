#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const report = JSON.parse(
  readFileSync(join(rootDir, 'scripts/full-program-verification-report.json'), 'utf8'),
);
const data = JSON.parse(readFileSync(join(rootDir, 'public/data/programs.json'), 'utf8'));

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html',
};

function digits(s) {
  return (s || '').replace(/\D/g, '');
}

function norm(s) {
  return (s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchHtml(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const html = (await r.text()).slice(0, 600000);
    return { ok: r.ok || r.status === 403, status: r.status, url: r.url, html };
  } catch (e) {
    return { ok: false, error: e.message, html: '' };
  }
}

function checkInHtml(html, program) {
  const d = digits(program.phone);
  const last10 = d.length >= 10 ? d.slice(-10) : d;
  const phoneOk =
    !last10 ||
    last10.length < 10 ||
    digits(html).includes(last10) ||
    (program.phone && html.includes(program.phone.replace(/\d/g, (x, i, s) => s)));

  const city = program.locations?.[0]?.city;
  const cityOk = !city || city === 'Multiple' || city === 'National' || norm(html).includes(norm(city));

  const addr = program.locations?.[0]?.address;
  const addrParts = addr ? addr.split(/[\s,]+/).filter((w) => w.length > 4) : [];
  const addrOk =
    !addr ||
    addrParts.length === 0 ||
    addrParts.filter((p) => norm(html).includes(norm(p))).length >= Math.min(2, addrParts.length);

  const orgRoot = norm(program.organization).split(' ')[0];
  const orgOk = orgRoot.length < 4 || norm(html).includes(orgRoot);

  return { phoneOk, cityOk, addrOk, orgOk };
}

const results = [];

for (const { program_id } of report.needs_attention) {
  const program = data.programs.find((p) => p.program_id === program_id);
  const urls = [
    program.verification_source?.match(/https?:\/\/[^\s;]+/)?.[0],
    program.website_url,
    program.website,
  ].filter(Boolean);
  const uniqueUrls = [...new Set(urls)];

  const fetches = [];
  for (const u of uniqueUrls) {
    fetches.push({ label: 'primary', url: u, ...(await fetchHtml(u)) });
  }

  const combinedHtml = fetches.map((f) => f.html).join('\n');
  const checks = checkInHtml(combinedHtml, program);
  const statusOk = fetches.every((f) => f.ok || f.status === 403 || f.status === 429);

  const issues = [];
  if (!statusOk) issues.push('url_unreachable');
  if (!checks.phoneOk && program.phone && !program.phone.includes('Text')) issues.push('phone_unverified');
  if (!checks.cityOk) issues.push('city_unverified');
  if (!checks.addrOk && program.locations?.[0]?.address) issues.push('address_unverified');
  if (!checks.orgOk) issues.push('org_unverified');

  results.push({
    program_id,
    organization: program.organization,
    phone: program.phone,
    city: program.locations?.[0]?.city,
    address: program.locations?.[0]?.address,
    urls: fetches.map((f) => ({ url: f.url, status: f.status, final: f.url })),
    checks,
    issues,
    verdict: issues.length === 0 ? 'OK' : issues.join(', '),
  });
}

writeFileSync(join(rootDir, 'scripts/spot-check-25-report.json'), JSON.stringify(results, null, 2));

for (const r of results) {
  const icon = r.verdict === 'OK' ? '✓' : '⚠';
  console.log(`${icon} ${r.program_id}: ${r.verdict}`);
  if (r.verdict !== 'OK') {
    console.log(`    phone:${r.checks.phoneOk} city:${r.checks.cityOk} addr:${r.checks.addrOk} org:${r.checks.orgOk}`);
  }
}

const needsFix = results.filter((r) => r.verdict !== 'OK');
console.log(`\n${results.length - needsFix.length}/${results.length} OK; ${needsFix.length} need review`);
