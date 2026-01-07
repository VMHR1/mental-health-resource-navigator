// ========== Distance Calculation Module ==========
// Haversine formula for calculating distance between two points on Earth

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in miles
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  if (typeof lat1 !== 'number' || typeof lng1 !== 'number' ||
      typeof lat2 !== 'number' || typeof lng2 !== 'number') {
    return Infinity;
  }

  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate minimum distance from user location to any in-person location of a program
 * @param {Object} program - Program object with locations array
 * @param {number} userLat - User's latitude
 * @param {number} userLng - User's longitude
 * @returns {number|null} Minimum distance in miles, or null if no valid locations
 */
function calculateProgramDistance(program, userLat, userLng) {
  if (!program.locations || !Array.isArray(program.locations)) {
    return null;
  }

  // Skip Virtual programs
  if (program.service_setting === 'Virtual') {
    return null;
  }

  let minDistance = Infinity;

  for (const location of program.locations) {
    // Skip Virtual locations
    if (location.city === 'Virtual' || !location.geo) {
      continue;
    }

    const { lat, lng } = location.geo;
    if (typeof lat === 'number' && typeof lng === 'number') {
      const distance = haversineDistance(userLat, userLng, lat, lng);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }
  }

  return minDistance === Infinity ? null : minDistance;
}

/**
 * Check if a program has any in-person locations with valid coordinates
 * @param {Object} program - Program object
 * @returns {boolean}
 */
function hasValidLocation(program) {
  if (!program.locations || !Array.isArray(program.locations)) {
    return false;
  }

  if (program.service_setting === 'Virtual') {
    return false;
  }

  return program.locations.some(loc => {
    if (loc.city === 'Virtual') return false;
    return loc.geo && typeof loc.geo.lat === 'number' && typeof loc.geo.lng === 'number';
  });
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.haversineDistance = haversineDistance;
  window.calculateProgramDistance = calculateProgramDistance;
  window.hasValidLocation = hasValidLocation;
}

