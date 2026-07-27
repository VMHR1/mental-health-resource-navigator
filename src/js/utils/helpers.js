// ========== Utility Functions ==========

function safeStr(x) {
  return (x ?? "").toString().trim();
}

function escapeHtml(s) {
  const str = safeStr(s);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\//g, "&#x2F;");
}

function safeUrl(u) {
  const s = safeStr(u);
  if (!s) return "";
  // Use validateUrl from security.js if available
  if (typeof window.validateUrl === 'function' && !window.validateUrl(s)) {
    if (typeof window.logSecurityEvent === 'function') {
      window.logSecurityEvent('invalid_url_attempt', { url: s.substring(0, 100) });
    }
    return "";
  }
  try {
    const parsed = new URL(s, window.location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch (_) {
    if (typeof window.logSecurityEvent === 'function') {
      window.logSecurityEvent('url_parse_failed', { url: s.substring(0, 100) });
    }
  }
  return "";
}

function domainFromUrl(url) {
  try {
    const u = new URL(url);
    return (u.hostname || "").replace(/^www\./i, "");
  } catch (_) {
    return "";
  }
}

function normalizePhoneForTel(phone) {
  const raw = safeStr(phone);
  if (!raw) return "";
  const plus = raw.trim().startsWith("+") ? "+" : "";
  const digits = raw.replace(/[^\d]/g, "");
  return (plus + digits);
}

function bestAddress(p) {
  const locs = Array.isArray(p.locations) ? p.locations : [];
  const l = locs[0] || {};
  // Only include location if it has a street address
  if (!safeStr(l.address)) return "";
  const parts = [safeStr(l.address), safeStr(l.city), safeStr(l.state), safeStr(l.zip)].filter(Boolean);
  return parts.join(", ");
}

function mapsLinkFor(p) {
  const locs = Array.isArray(p.locations) ? p.locations : [];
  const l = locs[0] || {};
  // Only generate map link if there's a street address
  if (!safeStr(l.address)) return "";
  const parts = [safeStr(l.address), safeStr(l.city), safeStr(l.state), safeStr(l.zip)].filter(Boolean);
  const addr = parts.join(", ");
  if (!addr) return "";
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
}

// Stable, cross-sort/cross-filter identifier.
// IMPORTANT: Do not include the current list index; it changes whenever results are
// sorted/filtered, which breaks Saved/Compare state.
function stableIdFor(p, _i) {
  const pid = safeStr(p.program_id);
  if (pid) return `p_${pid}`;

  // Fallback (should be rare): hash the core identifying fields.
  const base =
    `${safeStr(p.program_name)}|${safeStr(p.organization)}|${locLabel(p)}|${safeStr(p.level_of_care)}|${safeStr(p.entry_type)}`
    .toLowerCase();

  let h = 2166136261;
  for (let k = 0; k < base.length; k++) {
    h ^= base.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return `p_${(h >>> 0).toString(16)}`;
}

function locLabel(p) {
  const locs = Array.isArray(p.locations) ? p.locations : [];
  const first = locs[0] || {};
  const city = safeStr(first.city);
  const state = safeStr(first.state);
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  return "Location not listed";
}

function isCrisis(p) {
  return safeStr(p.entry_type).toLowerCase() === "crisis service";
}

function hasVirtual(p) {
  const setting = safeStr(p.service_setting).toLowerCase();
  if (setting.includes("virtual") || setting.includes("tele")) return true;
  const locs = Array.isArray(p.locations) ? p.locations : [];
  return locs.some(l => safeStr(l.city).toLowerCase() === "virtual");
}

/** Upper bound for open-ended "N+" age strings in this youth-focused directory. */
const DIRECTORY_MAX_AGE = 24;

function parseAgeSpec(spec) {
  const s0 = safeStr(spec);
  if (!s0) return [];
  const s = s0.toLowerCase();

  if (s === 'unknown') return [];

  if (s.includes('all ages') || s.includes('any age')) return [[0, DIRECTORY_MAX_AGE]];

  if (
    (s.includes('child') && s.includes('adolescent')) ||
    s.includes('children & adolescents') ||
    s.includes('children and adolescents') ||
    (s.includes('child') && s.includes('adolescent') && s.includes('services'))
  ) {
    return [[0, 17]];
  }

  if (/\bteen(s)?\b/.test(s) || /\badolescent(s)?\b/.test(s)) {
    return [[13, 17]];
  }

  const norm = s0
    .toLowerCase()
    .replace(/[\u2013\u2014\u2212\u2015\u2010\u2011]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const plus = norm.match(/(\d+)\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up)/);
  if (plus) return [[Number(plus[1]), DIRECTORY_MAX_AGE]];

  const range = norm.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return [[Number(range[1]), Number(range[2])]];

  const to = norm.match(/(\d+)\s*(?:to|through|thru)\s*(\d+)/);
  if (to) return [[Number(to[1]), Number(to[2])]];

  const nums = (norm.match(/\d+/g) || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  if (nums.length >= 2) {
    return [[Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])]];
  }
  if (nums.length === 1) return [[nums[0], nums[0]]];
  return [];
}

/**
 * @returns {boolean|null} true/false when ages_served is parseable; null when unknown (do not exclude).
 */
function programServesAge(p, age) {
  const ranges = parseAgeSpec(p.ages_served);
  if (!ranges.length) return null;
  return ranges.some(([min, max]) => age >= min && age <= max);
}

function isHttpUrl(url) {
  const s = safeStr(url);
  if (!s) return false;
  try {
    const parsed = new URL(s, window.location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function resolveVerificationUrl(program) {
  // Priority: verification_source_url > accepted_insurance.source_url > website
  if (program.verification_source_url) {
    const url = safeUrl(program.verification_source_url);
    if (url && isHttpUrl(url)) return url;
  }
  if (program.accepted_insurance && program.accepted_insurance.source_url) {
    const url = safeUrl(program.accepted_insurance.source_url);
    if (url && isHttpUrl(url)) return url;
  }
  if (program.website_url || program.website) {
    const url = safeUrl(program.website_url || program.website);
    if (url && isHttpUrl(url)) return url;
  }
  return "";
}

/** Root-relative program detail URL (Phase 2 slug pages). */
function programPublicPath(programId) {
  const id = safeStr(programId);
  if (!id) return '/program.html';
  return `/programs/${encodeURIComponent(id)}.html`;
}

function newTabSrHtml() {
  return '<span class="sr-only"> (opens in new tab)</span>';
}

function newTabAccessibleLabel(visibleLabel) {
  const label = safeStr(visibleLabel);
  return label ? `${label} (opens in new tab)` : 'Opens in new tab';
}

/**
 * Verification freshness for cards and detail (Phase 7.2).
 * @returns {'recent'|'fresh'|'stale'|'missing'}
 */
function getVerificationFreshness(lastVerified, options = {}) {
  const recentDays = options.recentDays ?? 60;
  const staleDays = options.staleDays ?? 90;
  const raw = safeStr(lastVerified);
  if (!raw) return 'missing';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'missing';
  const daysSince = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < recentDays) return 'recent';
  if (daysSince <= staleDays) return 'fresh';
  return 'stale';
}

export {
  safeStr,
  escapeHtml,
  safeUrl,
  domainFromUrl,
  normalizePhoneForTel,
  bestAddress,
  mapsLinkFor,
  stableIdFor,
  locLabel,
  isCrisis,
  hasVirtual,
  parseAgeSpec,
  programServesAge,
  isHttpUrl,
  resolveVerificationUrl,
  programPublicPath,
  newTabSrHtml,
  newTabAccessibleLabel,
  getVerificationFreshness,
};

// For classic-script (non-module) consumers not yet converted
if (typeof window !== 'undefined') {
  window.safeStr = safeStr;
  window.escapeHtml = escapeHtml;
  window.safeUrl = safeUrl;
  window.domainFromUrl = domainFromUrl;
  window.normalizePhoneForTel = normalizePhoneForTel;
  window.bestAddress = bestAddress;
  window.mapsLinkFor = mapsLinkFor;
  window.stableIdFor = stableIdFor;
  window.locLabel = locLabel;
  window.isCrisis = isCrisis;
  window.hasVirtual = hasVirtual;
  window.parseAgeSpec = parseAgeSpec;
  window.programServesAge = programServesAge;
  window.isHttpUrl = isHttpUrl;
  window.resolveVerificationUrl = resolveVerificationUrl;
  window.programPublicPath = programPublicPath;
  window.newTabSrHtml = newTabSrHtml;
  window.newTabAccessibleLabel = newTabAccessibleLabel;
  window.getVerificationFreshness = getVerificationFreshness;
}


