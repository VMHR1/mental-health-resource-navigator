# iPhone Safari Performance Findings

**Date**: 2024  
**Goal**: Identify and fix remaining stutter/jank on iPhone Safari during scrolling and idle

---

## Phase 3: Enumeration of Motion + Expensive Styles

### A) All Keyframes and Usage

1. **`gradientShift`** (18s infinite)
   - Used by: `.bg-gradient` (line 74)
   - Impact: Full-viewport animated background - VERY EXPENSIVE on mobile
   - Status: Already disabled on mobile via `@media (pointer: coarse)`

2. **`pulse`** (2s infinite)
   - Used by: `.btn-emergency` (line 338)
   - Impact: Pulsing scale animation on emergency button
   - Status: Already disabled on mobile

3. **`float`** (6.5s infinite)
   - Used by: `.floating-card` (line 498)
   - Impact: Floating animation with translateY/rotate in hero section
   - Status: Already disabled on mobile

4. **`breathe`** (3s infinite)
   - Used by: `.accuracyStrip` (line 1774)
   - Impact: Breathing opacity animation on verification indicator
   - Status: Already disabled on mobile

5. **`shimmer`** (1.15s infinite)
   - Used by: `.shimmer` (line 1904)
   - Impact: Shimmer effect animation
   - Status: Already disabled on mobile

6. **`rise`** (0.35s, one-time)
   - Used by: `.card` (line 1506)
   - Impact: Entrance animation - acceptable, not infinite

### B) All Rules Using filter/backdrop-filter

1. **`.bg-gradient`** - No filter (already static on mobile)
2. **`.section`** - `backdrop-filter: blur(12px)` (line 436)
3. **`.floating-card`** - `backdrop-filter: blur(14px)` (line 499)
4. **`.search-section`** - `backdrop-filter: blur(16px)` (line 547)
   - Status: Already disabled on mobile (line 562)
5. **`.modal-backdrop`** - `backdrop-filter: blur(10px)` (line 976)
6. **`.dd-menu`** - `backdrop-filter: blur(10px)` (line 1143)
7. **`.section`** (modal) - `backdrop-filter: blur(12px)` (line 1368)
8. **`.privacy-controls`** - `backdrop-filter: blur(8px)` (line 2714)
9. **`.search-suggestions`** - `backdrop-filter: blur(4px)` (line 3306)

**Top Suspects**: `.section` and `.floating-card` still have backdrop-filter on mobile (if hero is visible)

### C) Large box-shadow Rules

**Heavy shadows (>20px blur):**
1. `.crisis-banner` - `0 10px 30px rgba(239,68,68,.18)` (line 142)
   - Status: Reduced on mobile to `0 4px 12px` (line 152)
2. `.hero-copy` - `0 16px 46px rgba(79,209,197,.26)` (line 210)
3. `.btn-emergency:hover` - `0 20px 50px rgba(239,68,68,.40)` (line 349)
4. `.modal-backdrop` - `0 22px 60px rgba(15,23,42,.20)` (line 975)
5. `.modal-content` - `0 20px 60px rgba(0,0,0,.25)` (line 1920)

**Medium shadows (10-20px blur):**
- Multiple `.card`, `.section`, `.search-section` with `var(--shadow-md)` or `var(--shadow-lg)`
- Status: Already reduced to `var(--shadow-sm)` on mobile (line 647)

### D) Fixed/Sticky Elements with Large Backgrounds/Shadows

1. **`.bg-gradient`** (position: fixed, line 66)
   - Full-viewport animated background
   - Status: Static on mobile

2. **`.crisis-banner`** (position: sticky, line 136)
   - Large shadow: `0 10px 30px`
   - Status: Reduced on mobile

3. **`.search-section`** (position: sticky on mobile, line 557)
   - Large shadow: `var(--shadow-lg)`
   - backdrop-filter: `blur(16px)`
   - Status: Shadow reduced, backdrop-filter disabled on mobile

4. **`.modal-backdrop`** (position: fixed, line 1912)
   - Large shadow: `0 22px 60px`
   - backdrop-filter: `blur(10px)`

### E) JS Loops/Timers

1. **`perfTrackFrame()`** - rAF loop (only when `?perf=1`)
2. **`perfUpdateHUD()`** - rAF loop (only when `?perf=1`)
3. **`perfLogInterval`** - setInterval every 10s (only when `?perf=1`)
4. **`updateCrisisBannerOffset()`** - Throttled with rAF + timeout
5. **VisualViewport resize handler** - Throttled with rAF + timeout
6. **Modal resize handler** - Throttled with rAF + timeout

**All timers are properly throttled/debounced.**

---

## Top Suspects (Ranked for iPhone Safari)

### 🔴 CRITICAL
1. **`.section` backdrop-filter** - Still active on mobile, very expensive
2. **`.floating-card` backdrop-filter** - If hero visual is visible, expensive
3. **Sticky elements with shadows** - Crisis banner + search section stacking

### 🟠 HIGH
4. **Card shadows** - Multiple cards with shadows during scroll
5. **Modal backdrop-filter** - If modals are open

### 🟡 MEDIUM
6. **Entrance animations** - `.card` rise animation (one-time, but many cards)
7. **Hover effects** - Transform + shadow changes on cards

---

## Phase 4: Targeted Permanent Fixes

### Fix 1: Disable backdrop-filter on `.section` for mobile
- **Location**: `styles.css` - Add to `@media (pointer: coarse)`
- **Impact**: Removes expensive backdrop-filter from all sections

### Fix 2: Ensure hero visual is completely disabled on mobile
- **Location**: `styles.css` - Verify `.floating-card` has no backdrop-filter on mobile
- **Impact**: Removes expensive backdrop-filter from hero

### Fix 3: Further reduce sticky element shadows
- **Location**: `styles.css` - Further simplify crisis-banner shadow
- **Impact**: Reduces paint cost during scroll

### Fix 4: Simplify card shadows on mobile
- **Location**: `styles.css` - Replace medium shadows with minimal border/shadow
- **Impact**: Reduces paint cost when scrolling through many cards

---

## Kill Switch Testing Results

**To be filled after testing:**
- `?perf=1&noAnim=1` - Expected: Removes all animations
- `?perf=1&noHero=1` - Expected: Hides hero visual
- `?perf=1&noShadow=1` - Expected: Removes all shadows
- `?perf=1&noFixedBg=1` - Expected: Hides background gradient
- `?perf=1&noSticky=1` - Expected: Removes sticky positioning

**Which switch reduced jank the most**: TBD

