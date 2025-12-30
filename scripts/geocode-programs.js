#!/usr/bin/env node
/**
 * DEV-ONLY script to geocode program addresses
 * Generates programs.geocoded.json with geo:{lat,lng} per location
 * 
 * Usage: 
 *   node scripts/geocode-programs.js
 *   node scripts/geocode-programs.js --retry-full-address
 * 
 * Flags:
 *   --retry-full-address  Retry addresses that have coordinates to get full address precision
 *                          (useful if they were previously geocoded with city/state only)
 * 
 * Requires: npm install node-fetch (or use built-in fetch in Node 18+)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read programs.json
const programsPath = join(rootDir, 'programs.json');
const programsData = JSON.parse(readFileSync(programsPath, 'utf-8'));

// Check for command-line flags
const retryFullAddress = process.argv.includes('--retry-full-address');
if (retryFullAddress) {
  console.log('--retry-full-address flag detected: Will retry addresses with existing coordinates to get full address precision.\n');
}

// Try to load existing geocoded data
const geocodedPath = join(rootDir, 'programs.geocoded.json');
let existingGeocodedData = null;
if (existsSync(geocodedPath)) {
  try {
    existingGeocodedData = JSON.parse(readFileSync(geocodedPath, 'utf-8'));
    console.log('Found existing geocoded data. Will preserve existing coordinates and only geocode new addresses.\n');
  } catch (error) {
    console.warn('Could not read existing geocoded data, starting fresh:', error.message);
  }
}

// Create a map of existing geocoded data for quick lookup
const existingGeocodedMap = new Map();
if (existingGeocodedData && Array.isArray(existingGeocodedData.programs)) {
  existingGeocodedData.programs.forEach(program => {
    if (program.program_id && Array.isArray(program.locations)) {
      existingGeocodedMap.set(program.program_id, program.locations);
    }
  });
}

// Geocoding using Nominatim OpenStreetMap (free, open-source)
// Terms: https://operations.osm.org/policies/nominatim/
// Rate limit: 1 request per second (strictly enforced)
// Attribution: Required - OpenStreetMap contributors
const GEOCODE_API = 'https://nominatim.openstreetmap.org/search';
const DELAY_MS = 1000; // Rate limit: 1 request per second for Nominatim (required by ToS)

async function geocodeAddress(address, city, state, zip, retryWithCityOnly = false) {
  // Try different query formats
  let query;
  if (retryWithCityOnly) {
    // Retry with just city and state if full address failed
    query = [city, state].filter(Boolean).join(', ');
  } else {
    // First try: full address
    query = [address, city, state, zip].filter(Boolean).join(', ');
  }
  
  if (!query || city === 'Virtual') {
    return null;
  }

  try {
    const url = `${GEOCODE_API}?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Dallas-Mental-Health-Resource-Navigator/1.0 (https://github.com/VMHR1/mental-health-resource-navigator)'
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limited - wait longer
        console.warn(`Rate limited, waiting 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return null; // Will retry on next run
      }
      console.warn(`Geocoding failed for ${query}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
    
    // If full address failed and we haven't tried city-only, retry
    if (!retryWithCityOnly && address) {
      console.log(`  → Retrying with city/state only: ${city}, ${state}`);
      return await geocodeAddress(address, city, state, zip, true);
    }
    
    return null;
  } catch (error) {
    console.warn(`Geocoding error for ${query}:`, error.message);
    return null;
  }
}

async function geocodePrograms() {
  const geocoded = {
    metadata: {
      ...programsData.metadata,
      geocoded_at: new Date().toISOString(),
      geocoding_service: 'Nominatim OpenStreetMap',
      geocoding_attribution: '© OpenStreetMap contributors',
      geocoding_terms: 'https://operations.osm.org/policies/nominatim/',
      note: 'Geocoded data for distance calculations. Regenerate when program addresses change.'
    },
    programs: []
  };

  let processed = 0;
  let geocodedCount = 0;
  let preservedCount = 0;
  let skippedCount = 0;
  let virtualCount = 0;
  let failedAddresses = [];

  for (const program of programsData.programs) {
    const geocodedProgram = { ...program };
    const existingLocations = existingGeocodedMap.get(program.program_id);

    if (Array.isArray(program.locations)) {
      geocodedProgram.locations = [];

      for (let idx = 0; idx < program.locations.length; idx++) {
        const location = program.locations[idx];
        const geocodedLocation = { ...location };

        // Skip Virtual locations
        if (location.city === 'Virtual' || program.service_setting === 'Virtual') {
          geocodedLocation.geo = null;
          geocodedProgram.locations.push(geocodedLocation);
          virtualCount++;
          skippedCount++;
          continue;
        }

        // Check if we have existing geocoded data for this location
        let hasExistingGeo = false;
        if (existingLocations && existingLocations[idx]) {
          const existingLoc = existingLocations[idx];
          // Match by address/city to ensure it's the same location
          const addressMatch = !location.address || !existingLoc.address || 
            location.address === existingLoc.address;
          const cityMatch = location.city === existingLoc.city;
          
          if (addressMatch && cityMatch && existingLoc.geo && 
              typeof existingLoc.geo.lat === 'number' && 
              typeof existingLoc.geo.lng === 'number') {
            
            // If --retry-full-address flag is set and address exists, retry for more precision
            if (retryFullAddress && location.address && location.address.trim()) {
              console.log(`Retrying full address for: ${location.address}, ${location.city}, ${location.state}`);
              // Don't preserve, let it geocode again with full address
            } else {
              geocodedLocation.geo = existingLoc.geo;
              geocodedProgram.locations.push(geocodedLocation);
              preservedCount++;
              hasExistingGeo = true;
              continue;
            }
          }
        }

        // Check if location already has geo data in programs.json
        if (!hasExistingGeo && location.geo && 
            typeof location.geo.lat === 'number' && 
            typeof location.geo.lng === 'number') {
          geocodedLocation.geo = location.geo;
          geocodedProgram.locations.push(geocodedLocation);
          preservedCount++;
          continue;
        }

        // Geocode the address (new or missing coordinates)
        const addressStr = `${location.address || ''}, ${location.city}, ${location.state} ${location.zip || ''}`.trim();
        console.log(`Geocoding: ${addressStr}`);
        
        const geo = await geocodeAddress(
          location.address || '',
          location.city || '',
          location.state || '',
          location.zip || ''
        );

        if (geo) {
          geocodedLocation.geo = geo;
          geocodedCount++;
        } else {
          geocodedLocation.geo = null;
          skippedCount++;
          failedAddresses.push({
            program: program.program_name || program.organization,
            address: addressStr
          });
        }

        geocodedProgram.locations.push(geocodedLocation);

        // Rate limiting (only wait if we actually made an API call)
        if (!hasExistingGeo) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }
    }

    geocoded.programs.push(geocodedProgram);
    processed++;

    if (processed % 10 === 0) {
      console.log(`Processed ${processed}/${programsData.programs.length} programs...`);
    }
  }

  // Write geocoded file
  const outputPath = join(rootDir, 'programs.geocoded.json');
  writeFileSync(outputPath, JSON.stringify(geocoded, null, 2), 'utf-8');

  console.log('\n=== Geocoding Complete ===');
  console.log(`Total programs: ${processed}`);
  console.log(`Locations geocoded (new): ${geocodedCount}`);
  console.log(`Locations preserved (existing): ${preservedCount}`);
  console.log(`Virtual locations (skipped): ${virtualCount}`);
  console.log(`Failed geocoding attempts: ${failedAddresses.length}`);
  
  if (failedAddresses.length > 0) {
    console.log('\nFailed addresses (you can manually verify these):');
    failedAddresses.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.program}: ${item.address}`);
    });
  }
  
  console.log(`\nOutput: ${outputPath}`);
}

geocodePrograms().catch(console.error);

