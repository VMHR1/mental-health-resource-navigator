# Regional gap snapshot — operating runbook

This folder holds the human-readable summaries for ViableMHR regional gap snapshots, plus the methodology for generating them. The published JSON lives at `public/data/regional_gap_snapshot.json` (served on `regional-snapshot.html`).

## Purpose

Give partner organizations (hospitals, LMHAs, coalitions) a non-PHI view of:

- Total programs in the directory
- Stale-data counts (programs not re-verified in 90+ days)
- Missing-field trends (website, insurance clarity, intake labels, care level)
- Thin coverage (city × care-level pairs with two or fewer programs)
- Top zero-result filter signatures (when optional metrics are folded in)

We do **not** publish raw search queries, IPs, or any data that could identify a patient.

## Cadence

- **Weekly (internal):** Run the script against the current `programs.json` to catch regressions.
- **Quarterly (published):** Tag a snapshot for partners, write a short markdown summary in this folder, and commit both files.

## How to run

```bash
node scripts/aggregate-gap-snapshot.js --period 2026-Q2
```

To fold in optional zero-result metrics from a staging browser:

```bash
# In a browser dev console on a staging build:
copy(VMHRProductMetrics.exportMetricsJson())
# Save the JSON as e.g. metrics-2026-Q2.json
node scripts/aggregate-gap-snapshot.js --metrics metrics-2026-Q2.json --period 2026-Q2
```

This rewrites `public/data/regional_gap_snapshot.json`. Commit the change as part of the same PR that bumps the quarterly summary in this folder.

## What goes in the quarterly markdown summary

Each quarter, copy `_TEMPLATE.md` to `REGIONAL_GAP_<YYYY>-Q<n>.md` and fill in:

1. The headline counts (lift them from the published JSON).
2. Two or three bullet observations about thin-coverage hotspots or trends.
3. A short paragraph on data-collection priorities for the next quarter (which cities or care levels we plan to verify or expand).
4. A reminder that the snapshot is informational, not a quality ranking.

Avoid mentioning specific patients, requestors, or hospitals by name. Keep observations bucket-level.

## Privacy guardrails

- The script only reads `public/data/programs.json` and (optionally) an already-exported metrics file. It never opens a network connection.
- The output schema is enumerable and reviewed in `scripts/aggregate-gap-snapshot.js`. Adding new fields requires a privacy review.
- Filter signatures encode filter names/values, never raw query text or user IDs. The metrics export is already constrained by `src/js/modules/product-metrics.js`.
- Snapshots are committed to the same git repository as the rest of the site. Anything published here is fully public.

## After legal review (deferred)

If a hospital or coalition requests a per-system view (for example, "show coverage gaps in Collin County only"), that becomes a custom report and requires a documented agreement covering attribution, licensing, and use. The public snapshot remains region-wide.
