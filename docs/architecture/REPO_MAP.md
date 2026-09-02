# Repository Map

**Generated**: 2026-01-XX  
**Purpose**: Comprehensive mapping of entrypoints, dependencies, and business domain locations for refactoring planning.

---

## Entry Points

### HTML Pages

1. **`index.html`** (Main Search Interface)
   - **Scripts loaded (in order)**:
     - `security.js?v=2` (defer)
     - `js/data-validator.js?v=4` (type="module"; imports `js/config/validation-schema.js?v=1`)
     - `js/config/constants.js?v=3` (defer)
     - `js/utils/helpers.js?v=3` (defer)
     - `js/modules/storage.js?v=3` (defer)
     - `js/modules/search.js?v=3` (defer)
     - `js/modules/distance.js?v=2` (defer)
     - `js/state-manager.js?v=3` (defer)
     - `app.js?v=14` (defer) - **Main application entry**
   - **Dependencies**: All modules above, plus `programs.json` (data)
   - **Purpose**: Main search interface with filters, results grid, modals

2. **`program.html`** (Program Detail Page)
   - **Scripts loaded**:
     - `security.js?v=2`
     - `js/data-validator.js`
     - `js/config/constants.js`
     - `js/utils/helpers.js`
     - `js/modules/storage.js`
     - `js/modules/search.js`
     - `js/state-manager.js`
     - `js/program-detail.js` - **Page-specific entry**
   - **Dependencies**: `programs.json`, helper functions from `js/utils/helpers.js`
   - **Purpose**: Display single program details with related programs

3. **`submit.html`** (Program Submission Form)
   - **Scripts loaded**:
     - `security.js` (inline script for form submission)
   - **Dependencies**: Formspree API endpoint, security validation functions
   - **Purpose**: Multi-step wizard for program submission (no shared JS modules)

4. **`admin.html`** (Admin Dashboard)
   - **Scripts loaded**:
     - `security.js` (inline script for dashboard)
   - **Dependencies**: Security log functions from `security.js`
   - **Purpose**: Security event monitoring dashboard

5. **`privacy.html`**, **`terms.html`** (Static Pages)
   - **No JavaScript dependencies**
   - **Purpose**: Legal/terms pages

---

## JavaScript Entry Scripts

### Main Application (`app.js`)
- **Size**: ~5,600 lines (largest file)
- **Dependencies**:
  - `window.loadEncryptedData` / `window.saveEncryptedData` (from `js/modules/storage.js`)
  - `window.parseSmartSearch` (from `js/modules/search.js`)
  - `window.calculateProgramDistance` (from `js/modules/distance.js`)
  - `window.escapeHtml`, `window.safeStr`, etc. (from `js/utils/helpers.js`)
  - `window.CITIES`, `window.LEVELS_OF_CARE` (from `js/config/constants.js`)
  - `window.validateProgramSchema` (from `js/data-validator.js`)
  - Security functions from `security.js`
- **Responsibilities**:
  - DOM event listeners (search, filters, modals, keyboard shortcuts)
  - State management (programs array, filters, sort, user location)
  - UI rendering (cards, results grid, active filters, modals)
  - Mobile performance optimizations (text scale detection, viewport resize handling)
  - Progressive loading
  - Favorites/comparison/history management
  - Search autocomplete
  - Location-based sorting

### Program Detail (`js/program-detail.js`)
- **Size**: ~260 lines
- **Dependencies**:
  - `programs.json` (data)
  - Helper functions from `js/utils/helpers.js` (via `window.*`)
- **Responsibilities**:
  - Load and find program by ID
  - Render program detail view
  - Find related programs (by location, care level, organization)

---

## Business Domain Locations

### a) Program Validation

**Primary Location**: `js/data-validator.js`
- **Functions**:
  - `validateProgramSchema(program, index)` - Schema validation
  - `validateProgramsData(data)` - Batch validation
  - `checkDataFreshness(programs, thresholdDays)` - 90-day reverification check
  - `normalizeCityName(city)` - City name normalization
  - `normalizePhoneNumber(phone)` - Phone normalization
- **Schema Source**: `js/config/validation-schema.js`, imported directly (the inline fallback was removed — it was the only schema that ever ran, since no page loaded validation-schema.js)
- **Constants**:
  - `PROGRAM_SCHEMA` - Required/optional fields, types
  - `VALID_SERVICE_DOMAINS` - mental_health, substance_use, co_occurring, eating_disorders
  - `VALID_VERIFICATION_STATUSES` - verified, partially_verified, unable_to_verify, conflicting_information
  - `REVERIFICATION_THRESHOLD_DAYS` - 90 days
- **Usage**: Called during data load in `app.js`, validation scripts

**Secondary**: `app.js` (lines 1431-1503)
- `calculateRelevanceScore()` - Search relevance calculation
- `matchesFilters()` - Filter matching logic

### b) Search/Matching

**Primary Location**: `js/modules/search.js`
- **Functions**:
  - `levenshteinDistance(str1, str2)` - Edit distance algorithm
  - `fuzzyMatch(query, text, threshold)` - Fuzzy text matching
  - `fuzzyMatchSingleWord(query, text, threshold)` - Single word fuzzy match
  - `findBestCityMatch(query, cities)` - City name matching
  - `parseSmartSearch(query, cities)` - Natural language query parsing
- **Exports**: Functions attached to `window.*` for global access
- **Usage**: Called from `app.js` for search input parsing and autocomplete

**Secondary**: `app.js` (lines 789-1045)
- Duplicate implementations of `levenshteinDistance`, `fuzzyMatch`, `parseSmartSearch` (code duplication)
- `buildAutocompleteIndexes()` - Autocomplete index building
- Search input event handlers

### c) Storage/Encryption

**Primary Location**: `js/modules/storage.js`
- **Functions**:
  - `loadEncryptedData(key, defaultValue)` - Load with migration support
  - `saveEncryptedData(key, data)` - Save with encryption
  - `UserDataStorage` class - User data management (favorites, searches, history, notes, tags)
- **Dependencies**: `window.decryptData`, `window.encryptData` (from `security.js`)
- **Migration**: Handles migration from old encryption keys

**Security Module**: `security.js`
- **Functions**:
  - `encryptData(data)` - AES-GCM encryption
  - `decryptData(encryptedData)` - Decryption with migration support
  - `getEncryptionKey()` - Key management (IndexedDB)
  - `validateUrl(url)`, `validateEmail(email)`, `sanitizeText(text)` - Input validation
  - `checkRateLimit(key, maxAttempts, windowMs)` - Rate limiting
  - `logSecurityEvent(type, details)` - Security event logging
- **Storage**: IndexedDB for encryption keys, localStorage for encrypted data

**Secondary**: `app.js` (lines 30-78)
- Direct usage of `loadEncryptedData`/`saveEncryptedData` (before modules load)
- Inline storage initialization

### d) Geo/Distance

**Primary Location**: `js/modules/distance.js`
- **Functions**:
  - `haversineDistance(lat1, lng1, lat2, lng2)` - Distance calculation
  - `calculateProgramDistance(program, userLat, userLng)` - Program distance
  - `hasValidLocation(program)` - Location validation
- **Exports**: Functions attached to `window.*`
- **Usage**: Called from `app.js` for "Near Me" sorting

**Secondary**: `app.js` (lines 2426-2510)
- `sortPrograms(list)` - Sorting logic including distance sorting

### e) UI Rendering + DOM Wiring

**Primary Location**: `app.js` (distributed throughout)
- **DOM Element References**: `els` object (lines 596-788) - All DOM element references
- **Event Listeners** (lines 2620-5600+):
  - Search input (`q`) - autocomplete, smart search
  - Filter controls (location, age, care, insurance, crisis, virtual)
  - Sort dropdown
  - Modal triggers (favorites, history, comparison, share)
  - Keyboard shortcuts (/, ?, Escape, Arrow keys)
  - Location consent ("Near Me" button)
  - Filter presets
  - Reset buttons
- **Rendering Functions**:
  - `createCard(p, idx)` (lines 1877-2082) - Program card HTML generation
  - `renderSkeletons()` (lines 2083-2095) - Loading skeletons
  - `updateStats()` (lines 2113-2125) - Results count display
  - `renderComparison()` (lines 2171-2287) - Comparison modal
  - `showToast(message, type)` (lines 2364-2375) - Toast notifications
  - `showModal(modalEl)` / `hideModal(modalEl)` (lines 2376-2425) - Modal management
- **State Updates**: Direct DOM manipulation throughout

**Secondary**: `js/program-detail.js`
- `renderProgramDetail(program)` - Program detail page rendering

### f) Performance Toggles / Resize / Mobile Text-Size Stutter

**Primary Location**: `app.js` (lines 83-407)
- **Text Scale Detection** (lines 83-237):
  - `updateTextScaleClass()` - Detects iOS Safari text size changes
  - `initTextScaleDetection()` - Initialization
  - Circuit breaker pattern to prevent feedback loops
  - Throttling with `TEXT_SCALE_CHECK_INTERVAL` (200ms)
  - Stabilization delay (800ms) before checking
- **Viewport Resize Handling** (lines 331-573):
  - `handleBannerOffsetResize()` - Crisis banner offset calculation
  - Window resize throttling
  - Visual viewport resize handling (disabled, was causing issues)
  - `is-resizing` class management
- **Scroll Performance** (lines 245-275):
  - `is-scrolling` class management
  - Throttled scroll handler
- **Crisis Banner Offset** (lines 277-330):
  - Dynamic height calculation for fixed positioning

**Documentation**: `docs/performance/TEXT_SIZE_STUTTER_FIX.md`, `docs/performance/STUTTER_ROOT_CAUSE.md`

---

## Module Dependencies Graph

```
index.html
├── security.js (encryption, validation, rate limiting)
├── js/data-validator.js (program schema validation)
├── js/config/constants.js (CITIES, LEVELS_OF_CARE, FILTER_PRESETS, FEATURE_FLAGS)
├── js/utils/helpers.js (safeStr, escapeHtml, safeUrl, parseAgeSpec, etc.)
├── js/modules/storage.js
│   └── depends on: security.js (encryptData, decryptData)
├── js/modules/search.js (fuzzy matching, smart parsing)
├── js/modules/distance.js (haversine distance)
├── js/state-manager.js (StateManager class - currently unused in app.js)
└── app.js (main application)
    ├── uses: storage.js functions (loadEncryptedData, saveEncryptedData)
    ├── uses: search.js functions (parseSmartSearch)
    ├── uses: distance.js functions (calculateProgramDistance)
    ├── uses: helpers.js functions (escapeHtml, safeStr, etc.)
    ├── uses: constants.js (CITIES, LEVELS_OF_CARE)
    ├── uses: data-validator.js (validateProgramSchema)
    └── uses: security.js (validation, rate limiting)

program.html
├── security.js
├── js/data-validator.js
├── js/config/constants.js
├── js/utils/helpers.js
├── js/modules/storage.js
├── js/modules/search.js
├── js/state-manager.js
└── js/program-detail.js
    └── uses: helpers.js functions (via window.*)
```

---

## Data Files

- **`programs.json`**: Main program data (loaded by `app.js`, `program-detail.js`)
- **`programs.geocoded.json`**: Geocoded coordinates (optional, loaded by `app.js`)
- **`data/regions/`**: Regional data (DFW details/index, manifest)

---

## Build System

**`build.js`**:
- **Entry Points**: 
  - `app.js`
  - `js/modules/search.js`
  - `js/modules/storage.js`
  - `js/utils/helpers.js`
  - `js/config/constants.js`
  - `js/state-manager.js`
  - `js/data-validator.js`
- **Output**: `dist/` directory
- **Process**: esbuild for minification, static asset copying
- **Legacy Bundle**: Creates `dist/js/bundle.js` (concatenated, non-minified)

---

## Code Duplication Issues

1. **Search Functions**: `levenshteinDistance`, `fuzzyMatch`, `parseSmartSearch` duplicated in `app.js` and `js/modules/search.js`
2. **Helper Functions**: Some helpers duplicated in `app.js` (e.g., `safeStr`, `escapeHtml`, `parseAgeSpec`)
3. **State Management**: `StateManager` class exists but `app.js` uses inline state variables instead

---

## File Size Summary

- **`app.js`**: ~5,600 lines (largest, needs decomposition)
- **`js/data-validator.js`**: ~416 lines
- **`js/modules/search.js`**: ~238 lines
- **`js/modules/storage.js`**: ~154 lines
- **`js/modules/distance.js`**: ~99 lines
- **`js/state-manager.js`**: ~201 lines
- **`js/program-detail.js`**: ~260 lines
- **`js/utils/helpers.js`**: ~149 lines
- **`js/config/constants.js`**: ~63 lines
- **`security.js`**: ~650+ lines
- **Total JS**: ~8,155 lines (excluding build scripts, tests)

---

## Notes

- **Module System**: Uses global `window.*` exports (not ES modules) for browser compatibility
- **Defer Loading**: All scripts use `defer` attribute for non-blocking load
- **Version Query Strings**: Scripts include `?v=N` for cache busting
- **Cloudflare Pages**: Static hosting compatible (no server-side rendering)
- **State Management**: `StateManager` class exists but is not used in `app.js` (opportunity for refactor)

