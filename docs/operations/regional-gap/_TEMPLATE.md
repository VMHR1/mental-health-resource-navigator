# Regional gap snapshot — YYYY-QN

**Period:** YYYY-QN
**Generated:** YYYY-MM-DD
**Programs in directory:** _fill in_

## Headline counts

| Metric | Count |
|--------|-------|
| Stale programs (over 90 days) | _fill in_ |
| Recently updated (≤ 30 days) | _fill in_ |
| Missing website | _fill in_ |
| Insurance unclear | _fill in_ |
| Intake phone unlabeled | _fill in_ |
| Care level missing | _fill in_ |

## Observations

- _One or two bullets on coverage hotspots or trends._
- _Note any cities or care levels with persistent thin coverage._
- _Highlight progress since last quarter when relevant._

## Data-collection priorities next quarter

- _Programs we intend to re-verify._
- _Cities or care levels we plan to expand._

## Methodology reminder

- Counts and buckets only — no patient identifiers, no raw search queries.
- Stale = `last_verified` more than 90 days ago or missing.
- Thin coverage = a (city, care level) pair with two or fewer programs.
- Snapshot is informational, not a quality ranking.

## How to reproduce

```bash
node scripts/aggregate-gap-snapshot.js --period YYYY-QN
```
