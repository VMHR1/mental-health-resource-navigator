# Mobile Performance Optimization Guide

## Overview

This document describes the mobile performance optimizations implemented in the mental-health-resource-navigator and how to test them.

## Performance Monitoring (Phase 0)

### Enabling Performance Mode

Add `?perf=1` to any URL to enable performance monitoring:

```
https://your-site.com/?perf=1
```

### Performance HUD

When perf mode is enabled, a small HUD appears in the top-right corner showing:

- **FPS**: Current frames per second (target: 60)
- **Jank (10s)**: Number of frames that took >50ms in the last 10 seconds (target: 0)
- **Worst Frame**: Longest frame time in the last 10 seconds (target: <16ms)
- **Animations**: Count of active CSS animations (target: 0 on mobile)
- **Viewport**: Current viewport/visualViewport heights
- **DOM Nodes**: Number of DOM nodes in the grid
- **Cards**: Number of rendered cards
- **Timers**: Active setTimeout/setInterval count
- **Last Render**: Duration of last render() call in ms

### Console Logging

Every 10 seconds, perf mode logs detailed metrics to the console:

```json
{
  "fps": 60,
  "jankCount": 0,
  "worstFrame": 12.5,
  "activeAnimations": 0,
  "viewportHeight": 844,
  "visualViewportHeight": 844,
  "domNodes": 245,
  "cardCount": 20,
  "activeTimers": 2,
  "lastRenderDuration": 8,
  "lastProgressiveDuration": 12,
  "timestamp": 1234567890
}
```

### Kill Switches

Use query parameters to isolate performance issues (only works in perf mode):

- `?perf=1&noAnim=1` - Disable all animations
- `?perf=1&noHero=1` - Hide hero section floating cards
- `?perf=1&noShadow=1` - Remove all box-shadows
- `?perf=1&noFixedBg=1` - Hide fixed background
- `?perf=1&noSticky=1` - Disable sticky positioning

**Example test URLs:**
```
/?perf=1
/?perf=1&noAnim=1
/?perf=1&noAnim=1&noShadow=1
/?perf=1&noFixedBg=1&noSticky=1
```

## Infinite Animations Inventory

### Desktop-Only Animations (Disabled on Mobile)

The following infinite animations are **disabled on mobile** (`@media (pointer: coarse)`) to prevent idle jank:

1. **`.bg-gradient`** - `gradientShift` (18s infinite)
   - **Desktop**: Animated background with scale/rotate/opacity
   - **Mobile**: Static solid color (`var(--bg0)`)
   - **Selector**: `.bg-gradient`

2. **`.floating-card`** - `float` (6.5s infinite)
   - **Desktop**: Floating animation with translateY/rotate
   - **Mobile**: Static, no animation
   - **Selector**: `.floating-card` (in hero-visual section)

3. **`.btn-emergency`** - `pulse` (2s infinite)
   - **Desktop**: Pulsing scale animation
   - **Mobile**: Static, no animation
   - **Selector**: `.btn-emergency` (Call 988 Now button)

4. **`.accuracyStrip`** - `breathe` (3s infinite)
   - **Desktop**: Breathing opacity animation
   - **Mobile**: Static, no animation
   - **Selector**: `.accuracyStrip` (verification indicator)

5. **`.shimmer`** - `shimmer` (1.15s infinite)
   - **Desktop**: Shimmer effect animation
   - **Mobile**: Static, no animation
   - **Selector**: `.shimmer` (loading shimmer effect)

### Non-Infinite Animations (Allowed on Mobile)

These animations are **one-time** and allowed on mobile:

- **`.card`** - `rise` (0.35s, runs once on mount)
  - Fade-in and slide-up animation
  - Uses CSS variable `--enter-delay` for staggered effect
  - **Mobile**: Disabled during viewport changes only

## Mobile Performance Policy

### Core Principles

On coarse pointer devices (mobile/tablet):

1. **No infinite background animations**
   - Full-viewport animated backgrounds are disabled
   - Background uses solid color instead of gradients

2. **No moving shadow animations**
   - All shadow animations are disabled
   - Shadows are simplified to static values

3. **Motion must be transform/opacity only**
   - Any remaining animations use only GPU-friendly properties
   - Applied only to small elements, not full viewport

4. **No global animation hacks**
   - Targeted disabling, not blanket `animation: none !important`
   - Preserves desktop experience

### CSS Optimizations Applied

#### Background
- **Mobile**: Solid color (`var(--bg0)`) instead of animated gradient
- **Desktop**: Animated gradient with GPU promotion

#### Shadows
- **Mobile**: Reduced shadow complexity (`var(--shadow-sm)`)
- **Desktop**: Full shadow effects

#### Backdrop Filters
- **Mobile**: Disabled on all elements (very expensive on iOS)
- **Desktop**: Enabled for visual effects

#### Sticky Elements
- **Mobile**: Optimized with GPU layers (`transform: translateZ(0)`)
- **Desktop**: Standard sticky positioning

#### Content Visibility
- **Mobile**: `content-visibility: auto` on cards, sections, grids
- **Desktop**: Standard rendering

## Rendering Optimizations (Phase 2)

### DocumentFragment Batching
- All card rendering uses `DocumentFragment` for single DOM append
- Reduces layout thrash during render

### Progressive Loading
- Large result sets (>20 items) use progressive rendering
- Uses `requestIdleCallback` when available, falls back to `setTimeout(0)`
- Renders 20 items initially, then loads more on demand

### CSS Variable for Animation Delays
- Card animation delays use CSS variable `--enter-delay`
- Avoids inline style thrashing during render

### Event Delegation
- Card click handlers use event delegation at document level
- Reduces memory footprint and improves performance

### Debounced Search
- Search input debounced to 300ms
- Prevents excessive renders during typing

## Paint/Compositing Optimizations (Phase 3)

### Sticky/Fixed Layers
- Crisis banner: GPU-promoted sticky with reduced shadow
- Search section: GPU-promoted sticky, backdrop-filter disabled on mobile

### Shadows
- Cards: Reduced from `var(--shadow-md)` to `var(--shadow-sm)` on mobile
- Sections: Simplified shadows on mobile

### Filters
- All `backdrop-filter` disabled on mobile
- All CSS `filter` effects disabled on mobile during viewport changes

### GPU Promotion
- Sticky elements use `transform: translateZ(0)` for GPU layer
- Background gradient (desktop) uses `will-change: transform, opacity`

## Loading Optimizations (Phase 4)

### Script Loading
- All scripts use `defer` attribute
- Non-blocking first paint

### Progressive Rendering
- Initial render: 20 cards max
- Additional cards loaded on demand via "Load More" button
- Uses `requestIdleCallback` for non-blocking loads

### Content Visibility
- Cards use `content-visibility: auto` with `contain-intrinsic-size: 200px`
- Sections use `content-visibility: auto` with `contain-intrinsic-size: 300px`
- Offscreen content skipped during paint

## Testing Mobile Performance

### On Real Device (iPhone/Android)

1. **Enable perf mode**: `https://your-site.com/?perf=1`
2. **Observe HUD**:
   - FPS should be stable at 60
   - Jank count should be 0 or very low
   - Worst frame should be <16ms
   - Animations should be 0 (on mobile)

3. **Test scenarios**:
   - **Idle**: Leave page open for 30s, check jank count
   - **Scrolling**: Scroll through results, check FPS stability
   - **Filtering**: Change filters, check render duration
   - **Text size**: Adjust text size (iOS aA menu), check for stutter

4. **Use kill switches** to isolate issues:
   - If jank persists with `?perf=1&noAnim=1`, animations aren't the issue
   - If jank persists with `?perf=1&noShadow=1`, shadows aren't the issue

### Chrome DevTools (Emulation)

1. Open DevTools → Device Toolbar
2. Select "iPhone 12 Pro" or similar
3. Add `?perf=1` to URL
4. Use Performance tab to record:
   - Idle for 5 seconds
   - Scroll interaction
   - Filter change

**Note**: Real devices may behave differently than emulation. Always test on actual hardware.

## Acceptance Criteria

### Idle Performance
- ✅ FPS stable at 60 on iPhone Safari
- ✅ Jank count < 2 per 10 seconds
- ✅ Worst frame < 20ms
- ✅ Active animations = 0 (on mobile)

### Interaction Performance
- ✅ Scrolling smooth (60 FPS)
- ✅ Filter changes complete in <100ms
- ✅ Card expansion smooth
- ✅ Search input responsive (debounced)

### Loading Performance
- ✅ First paint < 1s on 3G
- ✅ Time to interactive < 3s on 3G
- ✅ Progressive rendering doesn't block main thread

## Troubleshooting

### High Jank Count
1. Check HUD for active animations (should be 0 on mobile)
2. Use `?perf=1&noAnim=1` to verify animations are the cause
3. Check console logs for render duration spikes
4. Verify no infinite loops in JavaScript

### Stuttering During Scroll
1. Check if backdrop-filters are disabled on mobile
2. Verify shadows are simplified
3. Check for layout-forcing operations (getBoundingClientRect in loops)
4. Use `?perf=1&noShadow=1` to test

### Slow Filtering
1. Check render duration in console logs
2. Verify debouncing is working (300ms delay)
3. Check if DocumentFragment is being used
4. Verify progressive loading is active for large sets

## Maintenance

### Adding New Animations

If you add a new animation:

1. **Check if it's infinite**: If yes, disable on mobile
2. **Use transform/opacity only**: Avoid layout-triggering properties
3. **Test in perf mode**: Verify it doesn't increase jank count
4. **Update this doc**: List the animation and its mobile behavior

### Adding New Sticky/Fixed Elements

If you add sticky/fixed positioning:

1. **Optimize for mobile**: Add GPU promotion if needed
2. **Reduce shadow cost**: Use simpler shadows on mobile
3. **Test scroll performance**: Verify no stutter
4. **Consider content-visibility**: For offscreen sticky content

## Performance Budget

Target metrics for mobile (iPhone Safari):

- **FPS**: 60 (stable)
- **Jank events**: < 2 per 10 seconds
- **Worst frame**: < 20ms
- **Render duration**: < 50ms for 20 cards
- **Active animations**: 0 (on mobile)
- **Active timers**: < 5 (during idle)

## References

- [CSS Content Visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility)
- [RequestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
- [Mobile Performance Best Practices](https://web.dev/performance/)
