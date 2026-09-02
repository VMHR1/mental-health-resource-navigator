#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
// Reads the audit report written by scripts/audit-program-data.js. It used to
// read full-program-verification-report.json from verify-all-programs.js, which
// was retired (dead REVIEW_DATE skip logic; 403/429 coerced to "ok").
const REPORT_PATH = join(rootDir, 'scripts/data-audit-summary.json');
if (!existsSync(REPORT_PATH)) {
  console.error(
    'scripts/data-audit-summary.json not found.\n' +
      'Generate it first: node scripts/audit-program-data.js --dry-run',
  );
  process.exit(1);
}
const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
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
    // 403/429 mean the site refused us, not that the page checks out. This is a
    // manual-review tool, so a refusal has to surface rather than read as OK.
    const botBlocked = r.status === 403 || r.status === 429;
    return { ok: r.ok, botBlocked, status: r.status, url: r.url, html };
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

const queue = report.needs_manual_confirmation || [];
if (queue.length === 0) {
  console.log('No programs in the audit report need manual confirmation. Nothing to spot-check.');
}

for (const { program_id } of queue) {
  const program = data.programs.find((p) => p.program_id === program_id);
  if (!program) {
    console.warn(`Skipping ${program_id}: not in programs.json`);
    continue;
  }
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
  const statusOk = fetches.every((f) => f.ok);
  const botBlocked = fetches.some((f) => f.botBlocked);

  const issues = [];
  if (botBlocked) issues.push('bot_blocked_check_in_browser');
  else if (!statusOk) issues.push('url_unreachable');
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
