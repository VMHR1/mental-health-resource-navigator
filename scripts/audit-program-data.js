#!/usr/bin/env node
/**
 * Full-directory data audit: URL health, on-page signals, verification metadata.
 * Updates programs.json (and mirrors) with verification block + last_verified.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const AUDIT_DATE = process.env.AUDIT_DATE || new Date().toISOString().split('T')[0];
const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

const PROGRAMS_PATH = join(rootDir, 'public', 'data', 'programs.json');
const REPORT_PATH = join(rootDir, 'scripts', 'data-audit-summary.json');
// Audit reports are gitignored, so failure history needs its own committed file
// to survive between runs — without it the two-strikes rule below has no memory.
const URL_HEALTH_PATH = join(rootDir, 'scripts', 'state', 'url-health.json');
const URL_REGEX = /https?:\/\/[^\s)\]"'<>]+/gi;
const TIMEOUT_MS = 20000;
const CONCURRENCY = 6;

// A transient outage should not be able to rewrite the directory's verification
// status. Two defences: retry inside a run, and require failures in two
// consecutive runs before a program is flipped to unable_to_verify.
const FETCH_ATTEMPTS = 2;
const RETRY_BASE_MS = 1500;
const RETRY_JITTER_MS = 750;
const STRIKES_BEFORE_DOWN = 2;

// Was a local copy of this list, declared and never read. It is now the shared
// allowlist and it is actually enforced below, so a typo in a classifier branch
// fails the run instead of writing a bogus status onto every record it touches.
const { VALID_VERIFICATION_STATUSES } = await import(
  pathToFileURL(join(rootDir, 'src', 'js', 'config', 'validation-schema.js')).href
);
const VALID_STATUSES = new Set(VALID_VERIFICATION_STATUSES);

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
};

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

function collectSourceUrls(program) {
  const set = new Set();
  extractUrls(program.verification_source).forEach((u) => set.add(u));
  if (program.verification_source_url) set.add(program.verification_source_url);
  if (program.website_url) set.add(program.website_url);
  if (program.website) set.add(program.website);
  if (program.accepted_insurance?.source_url) set.add(program.accepted_insurance.source_url);
  if (program.verification?.source_urls) {
    program.verification.source_urls.forEach((u) => set.add(u));
  }
  return [...set];
}

const urlCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function attemptFetch(url) {
  const result = {
    url,
    ok: false,
    status: null,
    finalUrl: null,
    html: null,
    error: null,
    note: null,
    botBlocked: false,
    attempts: 1,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: UA,
    });
    clearTimeout(timer);
    result.status = res.status;
    result.finalUrl = res.url;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/html')) {
      result.html = (await res.text()).slice(0, 500000);
    }
    result.ok = res.status >= 200 && res.status < 400;

    // 403/429 mean "we were refused", not "the page is fine". They used to be
    // coerced to ok with no marker, so a site that blocks bots read as a healthy
    // verification. They are now bot_blocked: not counted as a broken link, not
    // counted as a successful verification, and routed to the manual queue.
    if (res.status === 403 || res.status === 429) {
      result.botBlocked = true;
      result.ok = false;
      result.note = res.status === 403 ? '403 bot protection' : '429 rate limited';
    }
  } catch (e) {
    result.error = e.name === 'AbortError' ? 'timeout' : e.message;
  }

  return result;
}

// Retry only what can plausibly succeed on a second try. A 404 is an answer;
// a timeout, a connection error, a 5xx or a rate-limit is noise.
function isTransient(result) {
  if (result.ok) return false;
  if (result.error) return true;
  if (result.status === 429) return true;
  return typeof result.status === 'number' && result.status >= 500;
}

async function fetchUrl(url, allowAlt = true) {
  if (urlCache.has(url)) return urlCache.get(url);

  let result = await attemptFetch(url);
  for (let attempt = 2; attempt <= FETCH_ATTEMPTS && isTransient(result); attempt++) {
    // Jitter so a whole wave of URLs on one host does not retry in lockstep.
    await sleep(RETRY_BASE_MS * (attempt - 1) + Math.floor(Math.random() * RETRY_JITTER_MS));
    const retry = await attemptFetch(url);
    retry.attempts = attempt;
    result = retry;
  }

  if (!result.ok && !result.botBlocked && allowAlt) {
    const alt = url.includes('://www.')
      ? url.replace('://www.', '://')
      : url.replace('://', '://www.');
    if (alt !== url) {
      const altResult = await fetchUrl(alt, false);
      if (altResult.ok) {
        Object.assign(result, {
          ok: true,
          status: altResult.status,
          finalUrl: altResult.finalUrl,
          html: altResult.html,
          note: `reachable via ${alt}`,
          error: null,
          botBlocked: altResult.botBlocked,
        });
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

function isCrisisOrNavigation(program) {
  return (
    program.entry_type === 'Crisis Service' ||
    program.entry_type === 'Navigation' ||
    program.level_of_care === 'Crisis Hotline' ||
    program.level_of_care === 'Mobile Crisis' ||
    program.level_of_care === 'Navigation'
  );
}

function insuranceNeedsCall(program) {
  const ins = program.accepted_insurance?.status;
  return (
    ins === 'not_listed_on_website' ||
    ins === 'contact_for_info' ||
    ins === 'varies_by_service' ||
    (program.insurance_notes || '').toLowerCase().includes('call to verify') ||
    (program.insurance_notes || '').toLowerCase().includes('contact for')
  );
}

// Failure history carried between runs. Only URLs whose most recent check failed
// are kept; a URL is dropped the moment it succeeds again.
const priorHealth = existsSync(URL_HEALTH_PATH)
  ? JSON.parse(readFileSync(URL_HEALTH_PATH, 'utf8'))
  : { urls: {} };
const priorUrls = priorHealth.urls || {};
const nextHealthUrls = {};
const checkedUrls = new Set();

function strikesFor(url, result) {
  if (result.ok) return 0;
  return (priorUrls[url]?.consecutive_failures || 0) + 1;
}

function classifyProgram(program, urlResults, signals) {
  const issues = [];
  // A URL that is down for the first time is a warning, not a verdict. Only a
  // URL that also failed the previous run is treated as genuinely broken.
  const urlIssues = urlResults.filter((r) => !r.ok && !r.botBlocked);
  const confirmedDown = urlIssues.filter((r) => r.strikes >= STRIKES_BEFORE_DOWN);
  const firstStrike = urlIssues.filter((r) => r.strikes < STRIKES_BEFORE_DOWN);
  const blocked = urlResults.filter((r) => r.botBlocked);
  if (confirmedDown.length > 0) {
    issues.push(`broken_urls:${confirmedDown.map((u) => u.url).join(',')}`);
  }

  const websiteHost = program.website_url ? host(program.website_url) : null;
  const verifyHost = extractUrls(program.verification_source)[0]
    ? host(extractUrls(program.verification_source)[0])
    : null;
  if (
    websiteHost &&
    verifyHost &&
    websiteHost !== verifyHost &&
    !websiteHost.includes(verifyHost.split('.')[0]) &&
    !verifyHost.includes(websiteHost.split('.')[0])
  ) {
    issues.push('hostname_mismatch');
  }

  const botBlocked = blocked.length > 0;
  const thinHtml = urlResults.some((r) => r.ok && (!r.html || r.html.length < 500));

  if (issues.some((i) => i.startsWith('broken_urls'))) {
    return {
      status: 'unable_to_verify',
      notes:
        `Could not reach source URL(s) in ${STRIKES_BEFORE_DOWN} consecutive runs. ${issues.join('; ')}`,
      needsManual: true,
      manualReasons: ['source_url_down_two_consecutive_runs'],
    };
  }

  // Held cases: this run learned nothing about the program, so it must not
  // overwrite what the last successful run established. The caller keeps the
  // prior status and prior last_verified and records why.
  if (firstStrike.length > 0) {
    return {
      status: 'partially_verified',
      notes:
        `Source URL(s) failed this run only (strike 1 of ${STRIKES_BEFORE_DOWN}): ` +
        `${firstStrike.map((u) => `${u.url} (${u.status || u.error})`).join('; ')}. ` +
        'Prior verification held pending the next run.',
      needsManual: true,
      manualReasons: ['url_failed_single_run'],
      hold: true,
      holdReason: 'url_failed_single_run',
    };
  }

  if (botBlocked) {
    return {
      status: 'partially_verified',
      notes:
        `Source site refused the automated fetch (${blocked.map((u) => u.note || u.status).join('; ')}). ` +
        'This is not a verification — check the page in a browser. Prior verification held.',
      needsManual: true,
      manualReasons: ['site_blocks_automated_checks'],
      hold: true,
      holdReason: 'bot_blocked',
    };
  }

  if (issues.includes('hostname_mismatch')) {
    return {
      status: 'conflicting_information',
      notes: `Website host (${websiteHost}) differs from verification source host (${verifyHost}). Review canonical URL.`,
      needsManual: true,
    };
  }

  const crisis = isCrisisOrNavigation(program);
  const phoneOk = signals.phoneOnPage || crisis || !program.phone;
  const cityOk = signals.cityOnPage || crisis || !program.locations?.[0]?.city;
  const insStatus = program.accepted_insurance?.status;

  const manualReasons = [];
  if (insuranceNeedsCall(program)) {
    manualReasons.push('insurance_requires_phone_confirmation');
  }
  // botBlocked already returned above; a page that answers 200 with almost no
  // HTML is the other shape of "the fetch told us nothing".
  if (thinHtml) {
    manualReasons.push('source_page_returned_no_readable_content');
  }
  if (!phoneOk && program.phone && !crisis) {
    manualReasons.push('phone_not_confirmed_on_source_page');
  }

  if (manualReasons.length > 0 || !phoneOk || !cityOk) {
    const parts = [];
    if (!phoneOk && program.phone) parts.push('Phone not found on fetched source page.');
    if (!cityOk && program.locations?.[0]?.city) parts.push('City not found on fetched source page.');
    if (insStatus === 'not_listed_on_website') {
      parts.push('Insurance not listed on public website; call provider to verify benefits.');
    }
    if (insStatus === 'contact_for_info') {
      parts.push('Insurance details require call to admissions.');
    }
    if (insStatus === 'varies_by_service') {
      parts.push('Insurance varies by service/location; confirm with provider.');
    }
    if (thinHtml) parts.push('Source page returned no readable content; manual browser check advised.');

    return {
      status: 'partially_verified',
      notes: parts.join(' ') || 'Some fields could not be confirmed automatically.',
      needsManual: manualReasons.length > 0,
      manualReasons,
    };
  }

  if (insStatus === 'verified_on_website' || insStatus === 'not_applicable') {
    return {
      status: 'verified',
      notes: crisis
        ? 'Crisis/navigation entry; contact and hours should be confirmed by phone.'
        : 'Core fields match official source URLs fetched during audit.',
      needsManual: crisis,
    };
  }

  return {
    status: 'partially_verified',
    notes: 'Program links reachable; insurance or eligibility may need direct confirmation.',
    needsManual: true,
    manualReasons: ['insurance_or_eligibility_unconfirmed'],
  };
}

async function auditProgram(program) {
  const sourceUrls = collectSourceUrls(program);
  const urlResults = [];
  for (const url of sourceUrls) {
    const result = await fetchUrl(url);
    // strikesFor reads the committed prior-run history, so this is the same
    // number no matter which program reaches the URL first.
    const strikes = strikesFor(url, result);
    checkedUrls.add(url);
    if (strikes > 0) {
      nextHealthUrls[url] = {
        consecutive_failures: strikes,
        last_status: result.status,
        last_error: result.error,
        last_note: result.note,
        bot_blocked: result.botBlocked,
        first_failed_at: priorUrls[url]?.first_failed_at || AUDIT_DATE,
        last_checked: AUDIT_DATE,
      };
    }
    urlResults.push({ ...result, strikes });
  }

  const primary =
    extractUrls(program.verification_source)[0] || program.website_url || sourceUrls[0];
  const primaryFetch = primary ? await fetchUrl(primary) : null;
  const html = primaryFetch?.html || '';

  const phone10 = digitsPhone(program.phone);
  const phoneOnPage =
    phone10.length === 10 &&
    html &&
    (html.replace(/\D/g, '').includes(phone10) || html.includes(program.phone));

  const city = program.locations?.[0]?.city;
  const cityOnPage = city && html && html.toLowerCase().includes(city.toLowerCase());

  // Folded in from the retired verify-all-programs.js: whether the organization
  // name appears on its own source page. Reported, not scored — a page can be
  // legitimately branded differently from the record's organization field.
  const orgRoot = (program.organization || '').split(/[’']/)[0].toLowerCase().slice(0, 12);
  const orgOnPage = Boolean(orgRoot && html && html.toLowerCase().includes(orgRoot));

  const classification = classifyProgram(program, urlResults, { phoneOnPage, cityOnPage });

  return {
    program_id: program.program_id,
    organization: program.organization,
    source_urls: sourceUrls,
    url_checks: urlResults.map((r) => ({
      url: r.url,
      ok: r.ok,
      status: r.status,
      note: r.note,
      error: r.error,
      attempts: r.attempts,
      bot_blocked: r.botBlocked,
      consecutive_failures: r.strikes,
    })),
    signals: {
      phone_on_page: Boolean(phoneOnPage),
      city_on_page: Boolean(cityOnPage),
      org_on_page: orgOnPage,
    },
    verification_status: classification.status,
    verification_notes: classification.notes,
    needs_manual: classification.needsManual,
    manual_reasons: classification.manualReasons || [],
    hold: Boolean(classification.hold),
    hold_reason: classification.holdReason || null,
  };
}

const data = JSON.parse(readFileSync(PROGRAMS_PATH, 'utf8'));
const allPrograms = data.programs;

// --wave N limits the run to one rolling verification wave (see
// scripts/assign-verification-waves.js) so the scheduled job re-verifies a
// slice each week instead of the whole directory at once.
//
// Anything approaching expiry is always included regardless of wave, so a
// skipped or failed run can never let a program quietly cross 90 days.
const CATCH_UP_DAYS = 80;

function waveArg() {
  const i = process.argv.indexOf('--wave');
  if (i === -1 || i === process.argv.length - 1) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isInteger(n) ? n : null;
}

const WAVE = waveArg();
let programs = allPrograms;

if (WAVE !== null) {
  const ageInDays = (p) => {
    const raw = p.last_verified || p.verification?.last_verified_at;
    const d = raw ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return Infinity;
    return Math.floor((new Date(AUDIT_DATE) - d) / 86400000);
  };
  const inWave = [];
  const catchUp = [];
  for (const p of allPrograms) {
    if (p.verification_wave === WAVE) inWave.push(p);
    else if (ageInDays(p) >= CATCH_UP_DAYS) catchUp.push(p);
  }
  programs = [...inWave, ...catchUp];
  console.log(
    `Wave ${WAVE}: ${inWave.length} program(s) due` +
    (catchUp.length ? `, plus ${catchUp.length} catch-up (>=${CATCH_UP_DAYS}d old)` : '') +
    ` of ${allPrograms.length} total.`,
  );
  if (programs.length === 0) {
    console.log('Nothing due in this wave. Exiting without changes.');
    process.exit(0);
  }
}

console.log(`Auditing ${programs.length} programs (audit date: ${AUDIT_DATE})...\n`);

const auditResults = await pool(programs, auditProgram, CONCURRENCY);

const byStatus = {
  verified: [],
  partially_verified: [],
  conflicting_information: [],
  unable_to_verify: [],
};
const needsManual = [];

for (const r of auditResults) {
  if (!VALID_STATUSES.has(r.verification_status)) {
    console.error(
      `✗ ${r.program_id}: classifier produced status "${r.verification_status}", ` +
        `which is not in the allowlist (${[...VALID_STATUSES].join(', ')}). Refusing to write.`,
    );
    process.exit(1);
  }
  byStatus[r.verification_status].push(r.program_id);
  if (r.needs_manual) {
    needsManual.push({
      program_id: r.program_id,
      organization: r.organization,
      reasons: r.manual_reasons,
      notes: r.verification_notes,
    });
  }
}

if (!DRY_RUN) {
  const auditById = new Map(auditResults.map((r) => [r.program_id, r]));
  const files = [
    'public/data/programs.json',
    'public/data/programs.geocoded.json',
    'public/data/regions/dfw.details.json',
  ];

  for (const rel of files) {
    const path = join(rootDir, rel);
    if (!existsSync(path)) continue;
    const fileData = JSON.parse(readFileSync(path, 'utf8'));
    fileData.programs = fileData.programs.map((p) => {
      const audit = auditById.get(p.program_id);
      if (!audit) return p;
      const shouldUpdate =
        FORCE || !p.verification?.status || p.last_verified !== AUDIT_DATE;
      if (!shouldUpdate && !FORCE) return p;

      const sourceUrls = audit.source_urls;

      // A held run learned nothing: the source refused the fetch, or failed for
      // the first time and is one strike short of being called down. Stamping
      // AUDIT_DATE here would advertise a verification that did not happen, so
      // last_verified and the prior status are both left alone and the reason is
      // recorded for the manual queue.
      if (audit.hold) {
        return {
          ...p,
          verification: {
            ...(p.verification || {}),
            last_verified_at: p.verification?.last_verified_at || p.last_verified || null,
            source_urls: sourceUrls,
            status: p.verification?.status || 'partially_verified',
            notes: audit.verification_notes,
            audited_at: new Date().toISOString(),
            last_attempted_at: AUDIT_DATE,
            hold_reason: audit.hold_reason,
            signals: audit.signals,
          },
        };
      }

      const next = {
        ...p,
        last_verified: AUDIT_DATE,
        verification: {
          last_verified_at: AUDIT_DATE,
          source_urls: sourceUrls,
          status: audit.verification_status,
          notes: audit.verification_notes,
          audited_at: new Date().toISOString(),
          signals: audit.signals,
        },
      };
      if (next.accepted_insurance && typeof next.accepted_insurance === 'object') {
        next.accepted_insurance = {
          ...next.accepted_insurance,
          last_verified: AUDIT_DATE,
        };
      }
      return next;
    });
    if (rel.endsWith('programs.json')) {
      // Count from the file as written, not from this run's results. A wave run
      // touches a slice of the directory, so run-scoped counts would describe
      // ~9 programs while appearing to describe all of them — the drift that
      // left these counters reading 74/38 against an actual 105/6/1.
      const tally = { verified: 0, partially_verified: 0, unable_to_verify: 0, conflicting_information: 0 };
      for (const p of fileData.programs) {
        const s = p.verification?.status;
        if (s && s in tally) tally[s]++;
      }

      fileData.metadata = {
        ...fileData.metadata,
        last_directory_review_notes: WAVE === null
          ? `Automated data audit ${AUDIT_DATE}. See scripts/data-audit-summary.json.`
          : `Automated wave ${WAVE} audit ${AUDIT_DATE} (${programs.length} of ${fileData.programs.length} programs). See scripts/data-audit-summary.json.`,
        audit_verified: tally.verified,
        audit_partially_verified: tally.partially_verified,
        audit_unable_to_verify: tally.unable_to_verify,
        audit_conflicting: tally.conflicting_information,
      };

      // Only a full sweep may claim a full verification.
      if (WAVE === null) {
        fileData.metadata.last_full_verification = AUDIT_DATE;
      } else {
        fileData.metadata.last_wave_verification = AUDIT_DATE;
        fileData.metadata.last_wave_verified = WAVE;
      }
    }
    writeFileSync(path, `${JSON.stringify(fileData, null, 2)}\n`, 'utf8');
    console.log(`Updated ${rel}`);
  }
}

// Carry forward history for URLs this run never touched (a wave run checks a
// slice), keep the ones that failed again, and drop the ones that recovered.
// Entries for URLs no longer referenced by any program are pruned against the
// whole directory, not just the audited slice — otherwise a URL that was fixed
// by editing the record would keep its failure history forever.
const liveUrls = new Set(allPrograms.flatMap(collectSourceUrls));
const nextHealth = {};
const stale = [];
for (const [url, record] of Object.entries(priorUrls)) {
  if (checkedUrls.has(url)) continue;
  if (!liveUrls.has(url)) {
    stale.push(url);
    continue;
  }
  nextHealth[url] = record;
}
Object.assign(nextHealth, nextHealthUrls);

const recovered = [...checkedUrls].filter((u) => priorUrls[u] && !nextHealthUrls[u]);
const held = auditResults.filter((r) => r.hold);

if (!DRY_RUN) {
  writeFileSync(
    URL_HEALTH_PATH,
    `${JSON.stringify(
      {
        _comment: priorHealth._comment,
        updated_at: AUDIT_DATE,
        urls: nextHealth,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(
    `Updated scripts/state/url-health.json (${Object.keys(nextHealth).length} URL(s) with open failures` +
      (stale.length ? `, ${stale.length} pruned as no longer referenced` : '') +
      ')',
  );
}

const report = {
  audited_at: new Date().toISOString(),
  audit_date: AUDIT_DATE,
  programs_total: programs.length,
  summary: {
    verified: byStatus.verified.length,
    partially_verified: byStatus.partially_verified.length,
    conflicting_information: byStatus.conflicting_information.length,
    unable_to_verify: byStatus.unable_to_verify.length,
    needs_manual_phone_or_email: needsManual.length,
    held_pending_next_run: held.length,
  },
  url_health: {
    strikes_before_down: STRIKES_BEFORE_DOWN,
    urls_with_open_failures: Object.keys(nextHealth).length,
    first_strike_this_run: Object.entries(nextHealthUrls)
      .filter(([, r]) => r.consecutive_failures < STRIKES_BEFORE_DOWN)
      .map(([url]) => url),
    confirmed_down: Object.entries(nextHealthUrls)
      .filter(([, r]) => r.consecutive_failures >= STRIKES_BEFORE_DOWN)
      .map(([url]) => url),
    bot_blocked: Object.entries(nextHealthUrls)
      .filter(([, r]) => r.bot_blocked)
      .map(([url]) => url),
    recovered_this_run: recovered,
  },
  held_programs: held.map((r) => ({
    program_id: r.program_id,
    organization: r.organization,
    hold_reason: r.hold_reason,
    notes: r.verification_notes,
  })),
  fully_verified: byStatus.verified,
  partially_verified: byStatus.partially_verified,
  conflicting_information: byStatus.conflicting_information,
  unable_to_verify: byStatus.unable_to_verify,
  needs_manual_confirmation: needsManual,
  schema_recommendations: [
    'verification object is now populated on all programs (status, source_urls, notes, last_verified_at).',
    'Consider adding optional fields: hours_of_operation, referral_requirements, self_pay_sliding_scale (boolean + notes).',
    'Split insurance into structured payer_categories: medicaid, chip, medicare, tricare, commercial, self_pay, sliding_scale.',
    'Keep ages_served as stated on source; add ages_served_verified (boolean) when only qualitative wording exists.',
  ],
  per_program: auditResults,
};

writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nReport: ${REPORT_PATH}`);
console.log('Summary:', report.summary);
console.log('URL health:', {
  open_failures: report.url_health.urls_with_open_failures,
  first_strike: report.url_health.first_strike_this_run.length,
  confirmed_down: report.url_health.confirmed_down.length,
  bot_blocked: report.url_health.bot_blocked.length,
  recovered: recovered.length,
});

if (held.length > 0) {
  console.log(`\n--- Held (prior verification kept, nothing re-verified) ---`);
  for (const r of report.held_programs) {
    console.log(`${r.program_id}: ${r.hold_reason}`);
  }
}

if (DRY_RUN) {
  console.log('\n(dry run — no data files or URL health state modified)');
}
