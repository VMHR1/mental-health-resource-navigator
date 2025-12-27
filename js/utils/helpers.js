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
  const parts = [safeStr(l.address), safeStr(l.city), safeStr(l.state), safeStr(l.zip)].filter(Boolean);
  return parts.join(", ");
}

function mapsLinkFor(p) {
  const addr = bestAddress(p);
  if (!addr) return "";
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
}

function stableIdFor(p, i) {
  const base = `${safeStr(p.program_id)}|${safeStr(p.program_name)}|${safeStr(p.organization)}|${locLabel(p)}|${safeStr(p.level_of_care)}|${safeStr(p.entry_type)}`.toLowerCase();
  let h = 2166136261;
  for (let k = 0; k < base.length; k++) {
    h ^= base.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return `p_${(h >>> 0).toString(16)}_${i}`;
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

function parseAgeSpec(spec) {
  const s0 = safeStr(spec);
  if (!s0) return [];
  const s = s0.toLowerCase();

  if (s.includes("all ages") || s.includes("any age")) return [[0, 17]];
  if (s.includes("child") && s.includes("adolescent")) return [[0, 17]];

  const norm = s0.toLowerCase().replace(/[\u2013\u2014\u2212\u2015\u2010\u2011]/g, "-").replace(/\s+/g, " ").trim();

  const plus = norm.match(/(\d+)\s*(?:\+|and\s*up|years?\s*and\s*up|yrs?\s*and\s*up)/);
  if (plus) return [[Number(plus[1]), 17]];

  const range = norm.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return [[Number(range[1]), Number(range[2])]];

  const to = norm.match(/(\d+)\s*(?:to|through|thru)\s*(\d+)/);
  if (to) return [[Number(to[1]), Number(to[2])]];

  const nums = (norm.match(/\d+/g) || []).map(n => Number(n)).filter(n => Number.isFinite(n));
  if (nums.length >= 2) return [[Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])]];
  if (nums.length === 1) return [[nums[0], nums[0]]];
  return [];
}

function programServesAge(p, age) {
  const ranges = parseAgeSpec(p.ages_served);
  if (!ranges.length) return false;
  return ranges.some(([min, max]) => age >= min && age <= max);
}

// For non-module environments
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
}


