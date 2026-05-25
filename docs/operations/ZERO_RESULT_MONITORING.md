# Zero-result search monitoring (Phase 7.1)

**Status:** Active post-launch  
**Last updated:** 2026-05-23

## What runs automatically

The homepage records **privacy-preserving** search outcomes in the browser (`localStorage` key `vmhr_product_metrics_v1`):

- **No raw search queries** are stored.
- Each event stores a **filter signature** (care level, location set, age, insurance present, etc.) and a **results bucket** (`0`, `1-5`, `6-20`, `21+`).
- Zero-result events are copied to a dedicated `zeroResults` list for weekly review.

Module: `src/js/modules/product-metrics.js`  
API: `window.VMHRProductMetrics`

## Weekly review (15 minutes)

1. Open the live site (or staging) in Chrome.
2. DevTools → Console.
3. Run:

```javascript
const summary = VMHRProductMetrics.getMetricsSummary();
console.table(summary.topZeroResultSignatures);
console.log(summary);
```

4. Optional full export:

```javascript
copy(VMHRProductMetrics.exportMetricsJson());
```

Paste into a spreadsheet or `docs/operations/reports/zero-results-YYYY-MM-DD.json` (create folder as needed).

## What to do with findings

| Pattern | Action |
|---------|--------|
| Same `filter_signature` repeats in top 10 | Tune presets, city list, or smart-search parsing in `search.js` / `constants.js` |
| `loc:1` + `care:…` with zero results | Check `programs.json` coverage for that city/care level |
| `none` with zero results | Review default unlock path; may be edge-case UI state |

## Monthly report template

| Week | Top signature | Count | Action taken |
|------|---------------|-------|--------------|
| | | | |

Target from [Launch scope](../product/LAUNCH_SCOPE.md): zero-result rate **&lt; 15%** of unlocked searches (approximate via `approximateZeroRatePercent` in summary).

## Clearing test data

```javascript
VMHRProductMetrics.clearMetrics();
```

Use only on your own browser after QA sessions.

## Future automation

See [Analytics plan](../product/ANALYTICS_PLAN.md) for Statcounter goals or first-party aggregation after privacy review. Do not send raw queries to third parties.

## Related

- [Phased Launch Build Plan](../product/ViableMHR-Phased-Launch-Build-Plan.md) — Phase 7.1
- [Submit-to-publish runbook](./SUBMIT_TO_PUBLISH_RUNBOOK.md) — data fixes after zero-result review
