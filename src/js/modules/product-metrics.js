// ========== Product metrics (Phase 7.1) ==========
// Privacy-preserving local rollup — no raw search queries, no third-party events.

import { safeStr } from '../utils/helpers.js';

const METRICS_KEY = 'vmhr_product_metrics_v1';
const MAX_EVENTS = 200;
const DEBOUNCE_MS = 2500;

let lastRecordKey = '';
let lastRecordAt = 0;

function bucketResultsCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) return 'unknown';
  if (n === 0) return '0';
  if (n <= 5) return '1-5';
  if (n <= 20) return '6-20';
  return '21+';
}

/** Stable filter signature without query text (aligned with ANALYTICS_PLAN). */
function filterSignature(filters) {
  const f = filters || {};
  const parts = [
    f.care ? `care:${f.care}` : '',
    f.location ? 'loc:1' : '',
    f.age ? `age:${f.age}` : '',
    f.insurance ? 'ins:1' : '',
    f.onlyVirtual ? 'virtual:1' : '',
    f.serviceDomain ? `domain:${f.serviceDomain}` : '',
    f.verificationRecency ? `ver:${f.verificationRecency}` : '',
    f.showCrisis ? 'crisis:1' : '',
    Array.isArray(f.selectedServiceDomains) && f.selectedServiceDomains.length
      ? `sud:${f.selectedServiceDomains.length}`
      : '',
  ].filter(Boolean);
  return parts.length ? parts.join('|') : 'none';
}

function loadStore() {
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (!raw) {
      return { version: 1, searches: [], zeroResults: [], updatedAt: null };
    }
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      searches: Array.isArray(parsed.searches) ? parsed.searches : [],
      zeroResults: Array.isArray(parsed.zeroResults) ? parsed.zeroResults : [],
      updatedAt: parsed.updatedAt || null,
    };
  } catch (_) {
    return { version: 1, searches: [], zeroResults: [], updatedAt: null };
  }
}

function saveStore(store) {
  try {
    store.updatedAt = new Date().toISOString();
    localStorage.setItem(METRICS_KEY, JSON.stringify(store));
    return true;
  } catch (_) {
    return false;
  }
}

function trimEvents(list) {
  if (list.length <= MAX_EVENTS) return list;
  return list.slice(list.length - MAX_EVENTS);
}

function recordSearchOutcome({ resultsCount, filters, showCrisis }) {
  if (typeof localStorage === 'undefined') return;

  const bucket = bucketResultsCount(resultsCount);
  const sig = filterSignature(filters);
  const key = `${showCrisis ? 'crisis' : 'treatment'}|${sig}|${bucket}`;
  const now = Date.now();
  if (key === lastRecordKey && now - lastRecordAt < DEBOUNCE_MS) return;
  lastRecordKey = key;
  lastRecordAt = now;

  const store = loadStore();
  const entry = {
    ts: new Date().toISOString(),
    results_bucket: bucket,
    filter_signature: sig,
    has_location: Boolean(safeStr(filters?.location)),
    has_care: Boolean(safeStr(filters?.care)),
    has_insurance: Boolean(safeStr(filters?.insurance)),
    surface: showCrisis ? 'crisis' : 'treatment',
  };

  store.searches = trimEvents([...store.searches, entry]);

  if (bucket === '0' && !showCrisis) {
    store.zeroResults = trimEvents([
      ...store.zeroResults,
      {
        ts: entry.ts,
        filter_signature: sig,
        has_location: entry.has_location,
        has_care: entry.has_care,
      },
    ]);
  }

  saveStore(store);
}

function getMetricsSummary() {
  const store = loadStore();
  const zeroBySig = {};
  const searchByBucket = {};

  store.zeroResults.forEach((e) => {
    const sig = e.filter_signature || 'none';
    zeroBySig[sig] = (zeroBySig[sig] || 0) + 1;
  });

  store.searches.forEach((e) => {
    const b = e.results_bucket || 'unknown';
    searchByBucket[b] = (searchByBucket[b] || 0) + 1;
  });

  const topZero = Object.entries(zeroBySig)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([signature, count]) => ({ signature, count }));

  const totalSearches = store.searches.length;
  const zeroCount = store.zeroResults.length;
  const zeroRate =
    totalSearches > 0 ? Math.round((zeroCount / totalSearches) * 1000) / 10 : null;

  return {
    updatedAt: store.updatedAt,
    totalSearches,
    zeroResultEvents: zeroCount,
    approximateZeroRatePercent: zeroRate,
    resultsBuckets: searchByBucket,
    topZeroResultSignatures: topZero,
  };
}

function exportMetricsJson() {
  const store = loadStore();
  const summary = getMetricsSummary();
  return JSON.stringify({ summary, store }, null, 2);
}

function clearMetrics() {
  try {
    localStorage.removeItem(METRICS_KEY);
    lastRecordKey = '';
    lastRecordAt = 0;
    return true;
  } catch (_) {
    return false;
  }
}

export { recordSearchOutcome, getMetricsSummary, exportMetricsJson, clearMetrics };

// For classic-script (non-module) consumers not yet converted
if (typeof window !== 'undefined') {
  window.VMHRProductMetrics = {
    recordSearchOutcome,
    getMetricsSummary,
    exportMetricsJson,
    clearMetrics,
  };
}
