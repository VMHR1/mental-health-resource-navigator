#!/usr/bin/env node
/**
 * DEV-ONLY script to geocode program addresses
 * Generates programs.geocoded.json with geo:{lat,lng} per location
 * 
 * Usage: node scripts/geocode-programs.js
 * 
 * Requires: npm install node-fetch (or use built-in fetch in Node 18+)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read programs.json
const programsPath = join(rootDir, 'programs.json');
const programsData = JSON.parse(readFileSync(programsPath, 'utf-8'));

// Simple geocoding using a free service (Nominatim OpenStreetMap)
// In production, you might want to use a paid service for better rate limits
const GEOCODE_API = 'https://nominatim.openstreetmap.org/search';
const DELAY_MS = 1000; // Rate limit: 1 request per second for Nominatim

async function geocodeAddress(address, city, state, zip) {
  const query = [address, city, state, zip].filter(Boolean).join(', ');
  if (!query || city === 'Virtual') {
    return null;
  }

  try {
    const url = `${GEOCODE_API}?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Dallas-Mental-Health-Resource-Navigator/1.0'
      }
    });

    if (!response.ok) {
      console.warn(`Geocoding failed for ${query}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
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
      note: 'DEV-ONLY file. Do not commit to production. Regenerate as needed.'
    },
    programs: []
  };

  let processed = 0;
  let geocodedCount = 0;
  let skippedCount = 0;

  for (const program of programsData.programs) {
    const geocodedProgram = { ...program };

    if (Array.isArray(program.locations)) {
      geocodedProgram.locations = [];

      for (const location of program.locations) {
        const geocodedLocation = { ...location };

        // Skip Virtual locations
        if (location.city === 'Virtual' || program.service_setting === 'Virtual') {
          geocodedLocation.geo = null;
          geocodedProgram.locations.push(geocodedLocation);
          skippedCount++;
          continue;
        }

        // Check if already has geo data
        if (location.geo && typeof location.geo.lat === 'number' && typeof location.geo.lng === 'number') {
          geocodedLocation.geo = location.geo;
          geocodedProgram.locations.push(geocodedLocation);
          continue;
        }

        // Geocode the address
        console.log(`Geocoding: ${location.address || ''}, ${location.city}, ${location.state} ${location.zip || ''}`);
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
        }

        geocodedProgram.locations.push(geocodedLocation);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
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
  console.log(`Locations geocoded: ${geocodedCount}`);
  console.log(`Locations skipped (Virtual or failed): ${skippedCount}`);
  console.log(`Output: ${outputPath}`);
}

geocodePrograms().catch(console.error);

