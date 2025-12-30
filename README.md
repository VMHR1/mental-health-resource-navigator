# mental-health-resource-navigator
Neutral post-discharge mental health resource navigator for Dallas-FortWorth area youth

## Geocoding for Distance Features

The "Near Me" feature requires geocoded location data. To generate it:

```bash
node scripts/geocode-programs.js
```

This will:
- Read `programs.json`
- Geocode all program addresses using Nominatim OpenStreetMap (free, open-source)
- Generate `programs.geocoded.json` with latitude/longitude coordinates
- Respect rate limits (1 request/second as required by Nominatim ToS)

**Note:** The geocoding script uses Nominatim, which requires:
- Proper User-Agent header (included)
- Rate limiting (1 req/sec, enforced)
- Attribution: © OpenStreetMap contributors

After generating, commit and push `programs.geocoded.json` to make distance sorting available to all visitors.
