import { state, syncStateToManager } from './state.js?v=1';
import { els } from './dom.js?v=1';
import { render } from './render-hook.js?v=1';
import { callShowToast, callShowModal, callHideModal } from './ui-feedback.js?v=1';

function requestUserLocation() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(new Error('Location access requires a secure connection (HTTPS). Use https://viablemhr.com or test on localhost.'));
      return;
    }
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0 // Don't use cached location
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        let message = 'Unable to get your location';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location access denied';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out';
            break;
        }
        reject(new Error(message));
      },
      options
    );
  });
}

function showLocationConsent() {
  if (!els.locationConsentModal) {
    console.error('Location consent modal not found');
    return;
  }
  callShowModal(els.locationConsentModal);
}

function hideLocationConsent() {
  if (!els.locationConsentModal) return;
    callHideModal(els.locationConsentModal);
}

async function handleNearMeClick() {
  // Always clear previous location to ensure fresh consent every time
  state.userLocation = null;
  syncStateToManager();

  // Always show consent modal first (privacy-first approach)
  if (!els.locationConsentModal) {
    callShowToast('Location feature not available', 'error');
    return;
  }
  showLocationConsent();
}

async function handleLocationConsentAllow() {
  // Start geolocation in the same user gesture (before await) for Safari/Chrome
  const locationPromise = requestUserLocation();
  hideLocationConsent();

  try {
    // Check if distance module is loaded
    if (typeof window.calculateProgramDistance !== 'function') {
      callShowToast('Distance calculation not available. Please refresh the page.', 'error');
      console.error('Distance module not loaded');
      return;
    }

    state.userLocation = await locationPromise;

    if (!state.userLocation) {
      callShowToast('Failed to get location', 'error');
      return;
    }

    syncStateToManager();

    // Set sort to distance
    const SORT_OPTIONS = window.SORT_OPTIONS || { DISTANCE: 'distance', RELEVANCE: 'relevance' };
    state.currentSort = SORT_OPTIONS.DISTANCE;
    if (els.sortSelect) {
      els.sortSelect.value = SORT_OPTIONS.DISTANCE;
    }

    // Re-render with distance sorting
    if (typeof window.scheduleRenderFn === 'function') {
      window.scheduleRenderFn();
    } else {
      render();
    }

    updateLocationButtonVisibility();

    callShowToast('Location found. Results sorted by distance.', 'success');
  } catch (error) {
    console.error('Location error:', error);
    callShowToast(error.message || 'Failed to get location', 'error');
    revertDistanceSortWithoutLocation();
  }
}

function revertDistanceSortWithoutLocation() {
  const SORT_OPTIONS = window.SORT_OPTIONS || { DISTANCE: 'distance', RELEVANCE: 'relevance' };
  if (state.userLocation || state.currentSort !== SORT_OPTIONS.DISTANCE) return;
  state.currentSort = SORT_OPTIONS.RELEVANCE;
  if (els.sortSelect) {
    els.sortSelect.value = SORT_OPTIONS.RELEVANCE;
  }
  syncStateToManager();
  if (typeof window.scheduleRenderFn === 'function') {
    window.scheduleRenderFn();
  } else {
    render();
  }
}

function handleLocationConsentCancel() {
  hideLocationConsent();
  revertDistanceSortWithoutLocation();
}

// TDPSA Compliance: Stop sharing location (right to opt-out)
function handleStopLocationSharing() {
  // Clear location data (TDPSA: right to delete personal data)
  state.userLocation = null;
  syncStateToManager();

  // Reset sort if it was set to distance
  const SORT_OPTIONS = window.SORT_OPTIONS || { DISTANCE: 'distance', RELEVANCE: 'relevance' };
  if (state.currentSort === SORT_OPTIONS.DISTANCE) {
    state.currentSort = SORT_OPTIONS.RELEVANCE;
    if (els.sortSelect) {
      els.sortSelect.value = SORT_OPTIONS.RELEVANCE;
    }
  }
  
  // Update UI to reflect location is no longer active
  updateLocationButtonVisibility();
  
  // Re-render without distance sorting
  if (typeof window.scheduleRenderFn === 'function') {
    window.scheduleRenderFn();
  } else {
    render();
  }
  
  // Provide user feedback (TDPSA: clear communication)
  callShowToast('Location sharing stopped. Your location has been cleared.', 'success');
}

// Update button visibility based on location state (TDPSA: clear opt-out mechanism)
function updateLocationButtonVisibility() {
  if (!els.nearMeBtn || !els.stopLocationBtn) return;
  
  if (state.userLocation) {
    // Location is active: show stop button, hide near me button
    els.nearMeBtn.style.display = 'none';
    els.stopLocationBtn.style.display = 'inline-flex';
  } else {
    // Location not active: show near me button, hide stop button
    els.nearMeBtn.style.display = 'inline-flex';
    els.stopLocationBtn.style.display = 'none';
  }
}

export { requestUserLocation, showLocationConsent, hideLocationConsent, handleNearMeClick, handleLocationConsentAllow, revertDistanceSortWithoutLocation, handleLocationConsentCancel, handleStopLocationSharing, updateLocationButtonVisibility };
