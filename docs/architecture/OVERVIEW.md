# Architecture Overview

## What this repo contains
- Frontend static site (HTML/CSS/JS)
- Program datasets (JSON) used by the UI
- Serverless/API endpoints under `functions/`
- Scripts under `scripts/` for validation/geocoding/build tasks
- Tests under `tests/`

## Primary entry points
- UI entry: `index.html`
- Main JS: `app.js` (and supporting modules under `js/`)
- Data: `programs.json` (and any derived artifacts such as geocoded/region files)
- API: `functions/api/*`

## Where to look for…
- UI rendering/filtering behavior: `app.js`, `js/`
- Data transformations/validation: `scripts/`
- API endpoints: `functions/api/`
- E2E regression coverage: `tests/`
