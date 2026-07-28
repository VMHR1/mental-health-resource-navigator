// ========== Sorting Logic ==========
// Pure functions for program sorting

/**
 * Sort programs by the specified sort type
 * @param {Array} programs - Array of programs to sort
 * @param {string} sortType - Sort type (relevance, name, verified, location, distance)
 * @param {Object} options - Helper functions and dependencies
 * @returns {Array} - Sorted array of programs
 */
function sortPrograms(programs, sortType, options = {}) {
  const {
    // Helper functions
    safeStr = (val) => (val != null ? String(val) : ''),
    locLabel = null,
    calculateProgramDistance = null,
    // User location for distance sorting
    userLocation = null,
    // Sort options constants
    SORT_OPTIONS = {
      RELEVANCE: 'relevance',
      NAME: 'name',
      VERIFIED: 'verified',
      LOCATION: 'location',
      DISTANCE: 'distance'
    }
  } = options;

  const sorted = [...programs];
  
  switch(sortType) {
    case SORT_OPTIONS.NAME:
      sorted.sort((a, b) => {
        const nameA = safeStr(a.program_name || a.organization).toLowerCase();
        const nameB = safeStr(b.program_name || b.organization).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      break;
    case SORT_OPTIONS.VERIFIED:
      sorted.sort((a, b) => {
        const dateA = a.last_verified ? new Date(a.last_verified) : new Date(0);
        const dateB = b.last_verified ? new Date(b.last_verified) : new Date(0);
        return dateB - dateA;
      });
      break;
    case SORT_OPTIONS.LOCATION:
      if (!locLabel) {
        console.warn('locLabel not available for location sort');
        break;
      }
      sorted.sort((a, b) => {
        const locA = locLabel(a);
        const locB = locLabel(b);
        return locA.localeCompare(locB);
      });
      break;
    case SORT_OPTIONS.DISTANCE:
      if (userLocation && calculateProgramDistance) {
        // Separate virtual and in-person programs
        const inPerson = [];
        const virtual = [];
        
        for (const program of sorted) {
          if (program.service_setting === 'Virtual' || 
              (program.locations && program.locations.some(loc => loc.city === 'Virtual'))) {
            virtual.push(program);
          } else {
            inPerson.push(program);
          }
        }
        
        // Calculate distances for in-person programs
        const withDistances = inPerson.map(program => {
          const distance = calculateProgramDistance(program, userLocation.lat, userLocation.lng);
          return { program, distance };
        });
        
        // Sort by distance (null/Infinity goes to end)
        withDistances.sort((a, b) => {
          if (a.distance === null || a.distance === Infinity) return 1;
          if (b.distance === null || b.distance === Infinity) return -1;
          return a.distance - b.distance;
        });
        
        // Combine: sorted in-person first (with distances), then in-person without coordinates, then virtual
        const inPersonWithDistance = withDistances.filter(wd => wd.distance !== null && wd.distance !== Infinity).map(wd => wd.program);
        const inPersonWithoutDistance = withDistances.filter(wd => wd.distance === null || wd.distance === Infinity).map(wd => wd.program);
        
        const result = [...inPersonWithDistance, ...inPersonWithoutDistance, ...virtual];
        
        // Ensure we return all programs (safety check)
        if (result.length !== sorted.length) {
          console.warn(`Distance sort: Expected ${sorted.length} programs, got ${result.length}. Adding missing programs.`);
          const resultIds = new Set(result.map(p => p.program_id));
          const missing = sorted.filter(p => !resultIds.has(p.program_id));
          return [...result, ...missing];
        }
        
        return result;
      } else {
        // Fallback to location sort if no user location
        if (locLabel) {
          sorted.sort((a, b) => {
            const locA = locLabel(a);
            const locB = locLabel(b);
            return locA.localeCompare(locB);
          });
        }
      }
      break;
    case SORT_OPTIONS.RELEVANCE:
    default:
      // Keep original order (already filtered by relevance)
      break;
  }
  
  return sorted;
}

export { sortPrograms };

// For classic-script (non-module) consumers not yet converted
if (typeof window !== 'undefined') {
  window.sortPrograms = sortPrograms;
}

