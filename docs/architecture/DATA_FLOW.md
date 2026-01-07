# Data Flow

## Canonical data
- Identify the “source of truth” JSON used for program listings (commonly `programs.json`).

## Derived artifacts (if present)
- Geocoded programs (for “near me” features)
- Region indexes/details under `data/regions/` (for faster loading)

## Typical workflow
1. Update canonical program data
2. Run validation scripts (in `scripts/`)
3. Run geocoding/indexing scripts (if applicable)
4. Run tests (`npm run verify`)
5. Commit changes
