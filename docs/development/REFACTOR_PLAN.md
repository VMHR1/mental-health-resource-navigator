# Refactor Plan

**Generated**: 2026-01-XX  
**Branch**: `refactor/structure-and-modules`  
**Goal**: Incremental, safe refactoring with zero user-facing behavior changes (unless required for correctness).

---

## Principles

1. **One slice at a time** - Complete each slice fully before moving to the next
2. **Run `npm run verify` after every change-set** - Fix regressions immediately
3. **Small, isolated commits** - One commit per slice with clear message format: `refactor(slice): <description>`
4. **Preserve public APIs** - Keep `window.*` exports or provide thin adapters
5. **No behavior changes** - Unless fixing correctness bugs
6. **Cloudflare Pages compatible** - Maintain static hosting compatibility

---

## Refactor Slices (Ranked by Impact and Risk)

### Slice 1: Extract Search Module Duplicates from app.js
**Priority**: HIGH (High Impact, Low Risk)  
**Goal**: Remove duplicate search functions from `app.js`, use `js/modules/search.js` exclusively

**Files Touched**:
- `app.js` (remove lines 789-1045: duplicate `levenshteinDistance`, `fuzzyMatch`, `parseSmartSearch`)
- `js/modules/search.js` (ensure all needed functions are exported)

**Risks**:
- Low: Functions already exist in module, just need to remove duplicates
- Risk: Function signatures might differ slightly

**Rollback Plan**:
- Git revert commit
- Verify: `npm run verify`

**Commands/Tests**:
```bash
# Before
npm run verify

# After changes
npm run verify
npm run test:e2e
# Manual: Test search input, autocomplete, smart search parsing
```

**Validation**:
- Search input works
- Autocomplete suggestions appear
- Smart search parsing (e.g., "IOP in Plano for 14-year-old") works
- Filter presets work

---

### Slice 2: Extract Helper Function Duplicates from app.js
**Priority**: HIGH (High Impact, Low Risk)  
**Goal**: Remove duplicate helper functions from `app.js`, use `js/utils/helpers.js` exclusively

**Files Touched**:
- `app.js` (remove lines 1226-1323: duplicate helpers)
- `js/utils/helpers.js` (ensure all needed functions are exported)

**Risks**:
- Low: Functions already exist in module
- Risk: Some helpers might be inline-only (check usage)

**Rollback Plan**:
- Git revert commit

**Commands/Tests**:
```bash
npm run verify
npm run test:e2e
# Manual: Test all UI rendering, card creation, program display
```

**Validation**:
- Program cards render correctly
- Location labels display
- Phone/URL links work
- Age parsing works in filters

---

### Slice 3: Extract DOM Event Handlers to Separate Module
**Priority**: MEDIUM (Medium Impact, Medium Risk)  
**Goal**: Extract event listener setup from `app.js` to `js/modules/events.js`

**Files Touched**:
- `app.js` (extract event listeners, lines ~2620-5600)
- `js/modules/events.js` (new file - event handler setup)
- Keep `els` object in `app.js` or move to shared state

**Risks**:
- Medium: Event handlers are tightly coupled to DOM structure
- Risk: Timing issues if DOM not ready when handlers attach
- Risk: Closure dependencies on `app.js` variables

**Strategy**:
- Create `setupEventHandlers(els, state, callbacks)` function
- Pass callbacks for state updates, rendering
- Keep DOM element references in `els` object (can stay in `app.js`)

**Rollback Plan**:
- Git revert commit

**Commands/Tests**:
```bash
npm run verify
npm run test:e2e
# Manual: Test all interactions (search, filters, modals, keyboard shortcuts)
```

**Validation**:
- All buttons/inputs respond
- Keyboard shortcuts work (/, ?, Escape, Arrow keys)
- Modals open/close
- Filter changes update results
- Location consent flow works

---

### Slice 4: Extract Rendering Functions to Separate Module
**Priority**: MEDIUM (Medium Impact, Medium Risk)  
**Goal**: Extract card rendering and UI update functions from `app.js`

**Files Touched**:
- `app.js` (extract rendering functions)
- `js/modules/render.js` (new file - rendering functions)

**Functions to Extract**:
- `createCard(p, idx)` (lines 1877-2082)
- `renderSkeletons()` (lines 2083-2095)
- `updateStats()` (lines 2113-2125)
- `renderComparison()` (lines 2171-2287)
- `showToast(message, type)` (lines 2364-2375)
- `showModal(modalEl)` / `hideModal(modalEl)` (lines 2376-2425)

**Risks**:
- Medium: Rendering functions depend on DOM structure and state
- Risk: Closure dependencies on `app.js` variables (favorites, comparison, etc.)

**Strategy**:
- Create `renderCard(program, index, options)` - options include favorites/comparison state
- Pass state as parameters
- Export rendering functions, import in `app.js`

**Rollback Plan**:
- Git revert commit

**Commands/Tests**:
```bash
npm run verify
npm run test:e2e
# Manual: Visual inspection of cards, modals, toasts
```

**Validation**:
- Cards render with correct data
- Favorites/comparison badges show correctly
- Modals display properly
- Toast notifications appear

---

### Slice 5: Extract Mobile Performance Code to Separate Module
**Priority**: LOW (Low Impact, Low Risk)  
**Goal**: Extract text scale detection and viewport resize handling to `js/modules/performance.js`

**Files Touched**:
- `app.js` (extract lines 83-573: performance code)
- `js/modules/performance.js` (new file)

**Functions to Extract**:
- `updateTextScaleClass()` (lines 95-172)
- `initTextScaleDetection()` (lines 175-237)
- `handleBannerOffsetResize()` (lines 308-330)
- Scroll/viewport resize handlers (lines 245-407)

**Risks**:
- Low: Performance code is mostly isolated
- Risk: Dependencies on DOM structure (crisis banner, documentElement)

**Strategy**:
- Create `initPerformanceOptimizations(options)` function
- Pass DOM element references as options
- Keep performance flags/state in module scope

**Rollback Plan**:
- Git revert commit

**Commands/Tests**:
```bash
npm run verify
npm run test:mobile
# Manual: Test on iOS Safari - text size changes, viewport resize
```

**Validation**:
- Text scale detection works (iOS Safari aA menu)
- No stuttering during text size changes
- Crisis banner offset correct
- Scroll performance acceptable

---

### Slice 6: Centralize Configuration and Constants
**Priority**: MEDIUM (Medium Impact, Low Risk)  
**Goal**: Consolidate magic strings and configuration values

**Files Touched**:
- `app.js` (replace magic strings with constants)
- `js/config/constants.js` (add missing constants)
- `js/config/validation-schema.js` (ensure schema is used)

**Constants to Extract**:
- Sort options: `['relevance', 'name', 'verified', 'location', 'distance']`
- Default values: `INITIAL_LOAD_COUNT = 20`, `PROGRESSIVE_LOAD_INCREMENT = 20`
- CSS class names: `'text-small'`, `'is-scrolling'`, `'vv-changing'`, etc.
- Storage keys: `'favorites'`, `'recentSearches'`, etc.

**Risks**:
- Low: Simple string replacements
- Risk: Typos in constant names

**Rollback Plan**:
- Git revert commit

**Commands/Tests**:
```bash
npm run verify
npm run test:e2e
```

**Validation**:
- All functionality works as before
- No broken references

---

### Slice 7: Integrate StateManager into app.js
**Priority**: MEDIUM (Medium Impact, Medium Risk)  
**Goal**: Replace inline state variables with `StateManager` class

**Files Touched**:
- `app.js` (replace state variables with StateManager)
- `js/state-manager.js` (extend if needed)

**State to Migrate**:
- `programs`, `ready`, `openId`, `currentSort`, `userLocation`
- `filters` object
- `progressiveLoad` object
- `favorites`, `recentSearches`, `callHistory`, etc. (already using storage, but can use StateManager)

**Risks**:
- Medium: State management is core to app behavior
- Risk: State updates might trigger different behavior
- Risk: Need to ensure all state reads/writes go through StateManager

**Strategy**:
- Create StateManager instance early
- Migrate state variables one at a time
- Use `stateManager.getState()` / `stateManager.setState()` throughout
- Ensure listeners are set up correctly

**Rollback Plan**:
- Git revert commit

**Commands/Tests**:
```bash
npm run verify
npm run test:e2e
# Manual: Test state persistence (refresh page, check filters/sort persist)
```

**Validation**:
- State persists across page reloads
- Filter changes update state correctly
- Sort changes update state correctly
- No state corruption

---

### Slice 8: Extract Filter Logic to Pure Functions
**Priority**: MEDIUM (Medium Impact, Low Risk)  
**Goal**: Extract `matchesFilters()` and filter-related logic to `js/modules/filters.js`

**Files Touched**:
- `app.js` (extract `matchesFilters()` and related functions, lines 1504-1767)
- `js/modules/filters.js` (new file - pure filter functions)

**Functions to Extract**:
- `matchesFilters(p)` - Main filter matching logic
- Age range matching
- Location matching
- Care level matching
- Insurance matching
- Crisis/virtual toggles

**Risks**:
- Low: Filter logic is mostly pure (depends on program data and filter state)
- Risk: Dependencies on helper functions (parseAgeSpec, etc.)

**Strategy**:
- Create pure functions: `matchesFilters(program, filters, options)`
- Options include helper functions (parseAgeSpec, etc.)
- Import in `app.js`, call with current filter state

**Rollback Plan**:
- Git revert commit

**Commands/Tests**:
```bash
npm run verify
npm run validate-filters
npm run test:e2e
# Manual: Test all filter combinations
```

**Validation**:
- All filters work correctly
- Filter combinations work (e.g., location + age + care level)
- Filter presets work
- Active filter chips display correctly

---

### Slice 9: Extract Sorting Logic to Pure Functions
**Priority**: LOW (Low Impact, Low Risk)  
**Goal**: Extract `sortPrograms()` to `js/modules/sort.js`

**Files Touched**:
- `app.js` (extract `sortPrograms()`, lines 2426-2510)
- `js/modules/sort.js` (new file - sorting functions)

**Risks**:
- Low: Sorting is pure function (programs array + sort type + user location)
- Risk: Dependencies on distance calculation

**Strategy**:
- Create `sortPrograms(programs, sortType, userLocation, options)`
- Options include distance calculation function
- Import in `app.js`

**Rollback Plan**:
- Git revert commit

**Commands/Tests**:
```bash
npm run verify
npm run test:e2e
# Manual: Test all sort options (relevance, name, verified, location, distance)
```

**Validation**:
- All sort options work
- Distance sorting works (with location consent)
- Sort persists across filter changes

---

### Slice 10: Normalize Directory Structure (Optional)
**Priority**: LOW (Low Impact, Medium Risk)  
**Goal**: Reorganize to `/src`, `/public`, `/scripts`, `/tests`, `/docs` structure

**Files Touched**:
- All files (move to new structure)
- `build.js` (update paths)
- HTML files (update script paths)
- `package.json` (update script paths if needed)

**New Structure**:
```
/src
  /js (all JS modules)
  /html (all HTML files)
/public (static assets: styles.css, icon.png, etc.)
/scripts (build scripts, validation scripts)
/tests (Playwright tests)
/docs (documentation)
```

**Risks**:
- Medium: Many path references to update
- Risk: Build process might break
- Risk: Cloudflare Pages might need configuration

**Strategy**:
- Move files incrementally
- Update `build.js` to handle new structure
- Test build output in `dist/`
- Ensure Cloudflare Pages serves from correct root

**Rollback Plan**:
- Git revert commit (or keep both structures temporarily)

**Commands/Tests**:
```bash
npm run build
npm run verify
# Manual: Test all pages load, scripts load, assets load
```

**Validation**:
- All pages load correctly
- All scripts load
- All assets (CSS, images) load
- Build output is correct

---

## Execution Order (Recommended)

1. **Slice 1** (Search duplicates) - Quick win, low risk
2. **Slice 2** (Helper duplicates) - Quick win, low risk
3. **Slice 6** (Constants) - Low risk, sets foundation
4. **Slice 8** (Filter logic) - Medium risk, but isolated
5. **Slice 9** (Sort logic) - Low risk, isolated
6. **Slice 4** (Rendering) - Medium risk, but improves structure
7. **Slice 3** (Event handlers) - Medium risk, depends on rendering
8. **Slice 7** (StateManager) - Medium risk, depends on events/rendering
9. **Slice 5** (Performance) - Low risk, can be done anytime
10. **Slice 10** (Directory structure) - Optional, can be deferred

---

## Testing Strategy

After each slice:
1. Run `npm run verify` (build + validate-data + test:e2e + audit)
2. Manual smoke test:
   - Load homepage
   - Perform search
   - Apply filters
   - Open program detail
   - Test modals (favorites, comparison, share)
   - Test keyboard shortcuts
   - Test mobile (if applicable)
3. Check browser console for errors
4. Verify no regressions in existing functionality

---

## Risk Mitigation

- **Small commits**: Each slice is one commit, easy to revert
- **Verify after each**: Catch regressions immediately
- **Preserve APIs**: Keep `window.*` exports for compatibility
- **Test thoroughly**: Manual + automated tests
- **Document changes**: Clear commit messages

---

## Success Criteria

- ✅ All tests pass after each slice
- ✅ No user-facing behavior changes (unless fixing bugs)
- ✅ Code is more modular and maintainable
- ✅ `app.js` is significantly smaller (< 3000 lines)
- ✅ Clear separation of concerns
- ✅ Easier to add unit tests for pure functions

---

## Notes

- **StateManager**: Currently exists but unused - opportunity to integrate
- **Code Duplication**: Search and helper functions duplicated - high priority to fix
- **Large app.js**: 5,600 lines is too large - needs decomposition
- **Performance Code**: Mobile optimizations are complex but isolated - good candidate for extraction

