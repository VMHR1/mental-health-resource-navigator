# Regional gap snapshot — 2026-Q2

**Period:** 2026-Q2
**Generated:** 2026-05-25
**Programs in directory:** 112

## Headline counts

| Metric | Count |
|--------|-------|
| Stale programs (over 90 days) | 0 |
| Recently updated (≤ 30 days) | 112 |
| Missing website | 0 |
| Insurance unclear | 10 |
| Intake phone unlabeled | 112 |
| Care level missing | 0 |

## Observations

- The directory completed a full re-verification wave in May 2026; no listings are currently over the 90-day refresh threshold.
- Insurance details remain unclear for ten programs. Most are providers whose websites direct families to call billing rather than publish a plan list. These cards now surface an operational "Insurance unclear" caveat in navigator mode.
- No program records currently carry a labeled `intake_phone` field. Every card will surface the "Intake phone not labeled" caveat in navigator mode until the data model is backfilled. This is a known follow-up for Q3.
- Thin coverage is concentrated in smaller cities (Bedford, Burleson, Corsicana, Forney, Mansfield, Mesquite, Rockwall) where most care levels are represented by one or two listings.

## Data-collection priorities next quarter

- Add `intake_phone` / `phone_labels` to the program records, starting with PHP and IOP providers most commonly used in discharge handoffs.
- Re-verify the ten programs flagged with unclear insurance details and capture either a confirmed plan list or an explicit "call to verify" annotation.
- Investigate thin coverage in Mansfield, Burleson, and Rockwall for outpatient and IOP services.

## Methodology reminder

- Counts and buckets only — no patient identifiers, no raw search queries.
- Stale = `last_verified` more than 90 days ago or missing.
- Thin coverage = a (city, care level) pair with two or fewer programs.
- Snapshot is informational, not a quality ranking.

## How to reproduce

```bash
node scripts/aggregate-gap-snapshot.js --period 2026-Q2
```
