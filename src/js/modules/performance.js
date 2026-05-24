// ========== Performance Optimization Module ==========
// Mobile performance optimizations for text scale detection, viewport resize handling, and scroll performance
// This module handles iOS Safari text size changes, crisis banner offset, and viewport resize optimizations

/**
 * Initialize performance optimizations
 * @param {Object} options - Configuration options
 * @param {boolean} options.isCoarsePointer - Whether device has coarse pointer (touch)
 */
function initPerformanceOptimizations(options = {}) {
  const { isCoarsePointer = window.matchMedia('(pointer: coarse)').matches } = options;

  // ========== Dense Mode: Text Scale Detection (TASK A) ==========
  // Activates when iOS Safari text size is below 100% to reduce jank
  let baselineRootPx = null;
  let __textScaleRAF = null;
  let __textScaleT = null;
  let __lastTextScaleCheck = 0;
  let __lastTextScaleState = null; // Cache last state to avoid unnecessary toggles
  let __textScaleProcessing = false; // Circuit breaker: prevent re-entry during processing
  let __vvChangingFlag = false; // Track vv-changing state without classList check (avoids layout)
  const TEXT_SCALE_CHECK_INTERVAL = 200; // Max one check per 200ms
  const TEXT_SCALE_STABILIZE_DELAY = 300; // Wait for text size to stabilize before checking

  function updateTextScaleClass() {
    // Circuit breaker: if already processing, skip to prevent feedback loop
    if (__textScaleProcessing) {
      return;
    }
    
    // CRITICAL: If vv-changing is active, DO NOT toggle text-small class
    // The vv-changing class already applies necessary optimizations
    // Adding text-small during viewport change causes massive style recalc (html.text-small * selectors)
    if (__vvChangingFlag) {
      return; // Skip entirely during viewport changes
    }
    
    // Throttle: only check once per 200ms burst
    const now = Date.now();
    if (now - __lastTextScaleCheck < TEXT_SCALE_CHECK_INTERVAL) {
      return;
    }
    __lastTextScaleCheck = now;
    __textScaleProcessing = true; // Set circuit breaker
    
    try {
      // Use much longer stabilization delay to ensure viewport is truly stable
      const stabilizeDelay = TEXT_SCALE_STABILIZE_DELAY + 500; // Wait 800ms total
      
      // Clear any pending check
      if (__textScaleT) clearTimeout(__textScaleT);
      
      // Defer the expensive getComputedStyle call until after text size stabilizes
      __textScaleT = setTimeout(() => {
        // Double-check vv-changing hasn't started during delay
        if (__vvChangingFlag) {
          __textScaleProcessing = false;
          return; // Abort if viewport is still changing
        }
        
        // Use rAF to batch with browser's layout cycle
        if (__textScaleRAF) cancelAnimationFrame(__textScaleRAF);
        __textScaleRAF = requestAnimationFrame(() => {
          try {
            // Get current root font size (this forces layout, so we do it after stabilization)
            const currentRootPx = parseFloat(window.getComputedStyle(document.documentElement).fontSize);
            
            // Initialize baseline on first call
            if (baselineRootPx === null) {
              baselineRootPx = currentRootPx;
              __lastTextScaleState = null;
              __textScaleProcessing = false; // Release circuit breaker
              return; // Don't set class on first call, just store baseline
            }
            
            // Determine new state
            const shouldBeSmall = currentRootPx < baselineRootPx - 0.5;
            
            // Only toggle class if state actually changed (avoid unnecessary repaints)
            // ONLY apply after viewport is completely stable
            if (__lastTextScaleState !== shouldBeSmall && !__vvChangingFlag) {
              __lastTextScaleState = shouldBeSmall;
              if (shouldBeSmall) {
                document.documentElement.classList.add('text-small');
              } else {
                document.documentElement.classList.remove('text-small');
              }
            }
            
            // Release circuit breaker after processing complete
            __textScaleProcessing = false;
          } catch (e) {
            // Silently fail if getComputedStyle fails
            __textScaleProcessing = false; // Always release circuit breaker
          }
        });
      }, stabilizeDelay);
    } catch (e) {
      // Silently fail
      __textScaleProcessing = false; // Always release circuit breaker
    }
  }

  // Initialize baseline and check on DOM ready
  function initTextScaleDetection() {
    // Set baseline immediately if DOM is ready
    if (document.readyState !== 'loading') {
      updateTextScaleClass(); // Sets baseline
      updateTextScaleClass(); // Checks current state
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        updateTextScaleClass(); // Sets baseline
        updateTextScaleClass(); // Checks current state
      });
    }
    
    // Check on visualViewport resize (throttled with rAF + timeout)
    // CRITICAL FIX: Disable during active viewport changes to prevent massive style recalcs
    if (window.visualViewport) {
      let __vvResizeForTextScale = null;
      window.visualViewport.addEventListener('resize', () => {
        // Clear any pending check
        if (__vvResizeForTextScale) clearTimeout(__vvResizeForTextScale);
        
        // CRITICAL: DO NOT check during viewport changes - wait for complete stabilization
        // The vv-changing class already provides necessary optimizations
        // Toggling text-small during viewport change causes massive style recalc
        if (__vvChangingFlag) {
          return; // Skip entirely during viewport changes
        }
        
        // Wait much longer to ensure viewport is truly stable
        __vvResizeForTextScale = setTimeout(() => {
          // Double-check viewport is still stable before checking
          if (!__vvChangingFlag) {
            updateTextScaleClass();
          }
        }, 1000); // Wait 1 full second after last resize
      });
    }
    
    // Check on orientation change (throttled)
    window.addEventListener('orientationchange', () => {
      if (__textScaleT) clearTimeout(__textScaleT);
      __textScaleT = setTimeout(() => {
        updateTextScaleClass();
      }, 300); // Wait for orientation to settle
    });
    
    // Check when page becomes visible (user returns to tab)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (__textScaleT) clearTimeout(__textScaleT);
        __textScaleT = setTimeout(() => {
          updateTextScaleClass();
        }, 100);
      }
    });
    
    // Also check on pageshow (back/forward navigation)
    window.addEventListener('pageshow', () => {
      if (__textScaleT) clearTimeout(__textScaleT);
      __textScaleT = setTimeout(() => {
        updateTextScaleClass();
      }, 100);
    });
  }

  // Initialize text scale detection
  initTextScaleDetection();

  // ========== Scroll Activity Tracker (COMBINED) ==========
  // CRITICAL FIX: Combined scroll listener to avoid duplicate work
  // Track scroll activity for both is-scrolling class AND visualViewport cooldown
  let lastScrollTs = 0;
  let __isScrollingT = null;
  let __isScrollingActive = false; // Use flag instead of classList.contains() to avoid style recalculation

  // Re-enable scroll class with rAF throttling — pauses decorative animations during scroll
  let __scrollRaf = null;
  window.addEventListener('scroll', () => {
    if (__scrollRaf) return;
    __scrollRaf = requestAnimationFrame(() => {
      __scrollRaf = null;
      lastScrollTs = Date.now();

      if (!__isScrollingActive) {
        __isScrollingActive = true;
        document.documentElement.classList.add('is-scrolling');
      }

      if (__isScrollingT) clearTimeout(__isScrollingT);
      __isScrollingT = setTimeout(() => {
        if (__isScrollingActive) {
          __isScrollingActive = false;
          document.documentElement.classList.remove('is-scrolling');
        }
      }, 150);
    });
  }, { passive: true });

  // Update crisis banner height CSS variable for sticky positioning
  // Cached to avoid repeated getBoundingClientRect calls during viewport changes
  let __cachedBannerHeight = 0;
  function updateCrisisBannerOffset() {
    // CRITICAL FIX: Use flag instead of classList.contains() to avoid layout thrashing
    // classList.contains() forces style recalculation on every call
    if (isCoarsePointer && __vvChangingFlag) {
      return;
    }
    
    const banner = document.querySelector('.crisis-banner');
    if (!banner) {
      if (__cachedBannerHeight !== 0) {
        __cachedBannerHeight = 0;
        document.documentElement.style.setProperty('--crisis-banner-h', '0px');
      }
      return;
    }
    
    // Use requestAnimationFrame to batch layout reads
    requestAnimationFrame(() => {
      const h = banner.getBoundingClientRect().height;
      // Only update if height actually changed to avoid unnecessary style writes
      if (Math.abs(h - __cachedBannerHeight) > 0.5) {
        __cachedBannerHeight = h;
        document.documentElement.style.setProperty('--crisis-banner-h', `${h}px`);
      }
    });
  }

  // Throttled resize handler for banner offset (runs on all devices)
  let __bannerOffsetT;
  let __bannerOffsetRAF;
  function handleBannerOffsetResize() {
    // CRITICAL FIX: Use flag instead of classList.contains() to avoid layout thrashing
    // classList.contains() forces style recalculation on every call
    if (isCoarsePointer && __vvChangingFlag) {
      return;
    }
    
    // Cancel any pending RAF
    if (__bannerOffsetRAF) {
      cancelAnimationFrame(__bannerOffsetRAF);
    }
    
    // Use rAF to batch resize events before calling getBoundingClientRect
    __bannerOffsetRAF = requestAnimationFrame(() => {
      clearTimeout(__bannerOffsetT);
      __bannerOffsetT = setTimeout(() => {
        updateCrisisBannerOffset();
      }, 200); // Increased throttle for mobile stability
    });
  }

  // Disable animations during resize to prevent stuttering (desktop only)
  // On mobile/coarse pointer devices, this causes constant stutter due to frequent resize events
  let __rzT;
  let __rzRAF;
  let __lastWidth = window.innerWidth;

  if (!isCoarsePointer) {
    // Only run on fine pointer devices (desktop)
    window.addEventListener("resize", () => {
      // On coarse pointer devices, never toggle is-resizing
      if (isCoarsePointer) return;
      
      const currentWidth = window.innerWidth;
      // Only trigger on meaningful width changes (ignore height-only changes)
      if (Math.abs(currentWidth - __lastWidth) < 5) {
        return;
      }
      __lastWidth = currentWidth;
      
      // Cancel any pending RAF
      if (__rzRAF) {
        cancelAnimationFrame(__rzRAF);
      }
      
      // Use rAF to batch resize events
      __rzRAF = requestAnimationFrame(() => {
        document.documentElement.classList.add("is-resizing");
        clearTimeout(__rzT);
        __rzT = setTimeout(() => {
          document.documentElement.classList.remove("is-resizing");
        }, 150);
      });
    });
  }

  // CRITICAL FIX: Disable ALL resize listeners on mobile - they fire continuously on iOS Safari
  // Safari's resize events are too unstable (URL bar, safe area changes cause constant firing)
  // Only listen to orientation changes which are user-initiated and stable
  
  if (isCoarsePointer) {
    // Mobile: ONLY orientation change (user rotating device)
    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        handleBannerOffsetResize();
      }, 300);
    });
  } else {
    // Desktop: Use resize but with aggressive throttling
    let __resizeDebounce = null;
    window.addEventListener("resize", () => {
      clearTimeout(__resizeDebounce);
      __resizeDebounce = setTimeout(() => {
        handleBannerOffsetResize();
      }, 150);
    });
  }
  
  window.addEventListener("orientationchange", () => {
    setTimeout(updateCrisisBannerOffset, 100);
  });

  // Initial banner offset calculation
  updateCrisisBannerOffset();

  // Export updateCrisisBannerOffset for external use
  return {
    updateCrisisBannerOffset
  };
}

// For non-module environments
if (typeof window !== 'undefined') {
  window.initPerformanceOptimizations = initPerformanceOptimizations;
}

