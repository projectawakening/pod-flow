import path from 'path';
import type { SolarSystem } from '../../../src/types/gameData';
import { writeJsonFile } from '../utils/fsUtils'; // Only need writeJsonFile

// --- Configuration ---
const OUTPUT_SOLARSYSTEMS_FILE = path.join(__dirname, '..', 'game_data', 'solar_systems.json');
const API_V2_ENDPOINT = 'https://world-api-nova.live.tech.evefrontier.com/v2/solarsystems';
const LIMIT = 1000;
const FETCH_DELAY_MS = 1000; // Delay between paginated requests

// Type for the V2 API response structure (adapt if needed)
interface V2SolarSystemResponse {
  data: Partial<SolarSystem>[]; // Assuming data matches SolarSystem base fields
  metadata: {
    total: number;
    limit: number;
    offset: number;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main Script ---
async function fetchAllBaseSystems() {
  console.log(`Starting fetch of all base solar systems from ${API_V2_ENDPOINT}...`);
  let allSystems: Partial<SolarSystem>[] = [];
  let currentOffset = 0;
  let totalSystems = 0;
  let fetchedCount = 0;

  do {
    const url = `${API_V2_ENDPOINT}?limit=${LIMIT}&offset=${currentOffset}`;
    console.log(`Fetching: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`API Error: ${response.status} ${response.statusText} for URL: ${url}`);
        // Decide how to handle errors - stop? retry? skip page?
        // For now, we'll stop if a page fails.
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result: V2SolarSystemResponse = await response.json();

      if (!result || !result.data || !result.metadata) {
        console.error('Invalid response structure received from API', result);
        throw new Error('Invalid API response structure.');
      }

      // Process fetched data
      allSystems = allSystems.concat(result.data);
      fetchedCount += result.data.length;

      // Update total and offset for next iteration
      if (totalSystems === 0) { // First request sets the total
        totalSystems = result.metadata.total;
        console.log(`Total systems reported by API: ${totalSystems}`);
      }
      currentOffset += LIMIT;

      console.log(`Fetched ${result.data.length} systems. Total fetched so far: ${fetchedCount}/${totalSystems}`);

      // Delay if more pages are expected
      if (currentOffset < totalSystems) {
        await delay(FETCH_DELAY_MS);
      }

    } catch (error: any) {
      console.error(`Failed to fetch page at offset ${currentOffset - LIMIT}: ${error.message}`);
      // Exiting on error to prevent potentially incomplete data
      process.exit(1);
    }
  } while (currentOffset < totalSystems);

  console.log(`Finished fetching. Total systems retrieved: ${allSystems.length}`);

  // 4. Format and Write Output
  // Initialize missing fields expected by our SolarSystem interface
  const finalSystems: SolarSystem[] = allSystems.map(s => ({
    // Use the correct field 'id' from the API response for solarSystemId
    solarSystemId: (s as any).id ?? 0,
    solarSystemName: s.solarSystemName ?? 'Unknown',
    location: s.location ?? { x: 0, y: 0, z: 0 },
    smartAssemblies: [], // Initialize as empty - will be populated by the other script
    timestamp: 0,      // Initialize timestamp - will be set by the other script
  }));

  // Filter out any systems that might have failed to parse correctly (e.g., missing ID)
  const validSystems = finalSystems.filter(s => s.solarSystemId !== 0);
  console.log(`Writing ${validSystems.length} valid systems to ${OUTPUT_SOLARSYSTEMS_FILE}...`);

  // Sort before writing
   validSystems.sort((a, b) => a.solarSystemId - b.solarSystemId);

  await writeJsonFile(OUTPUT_SOLARSYSTEMS_FILE, validSystems);

  console.log('Base SolarSystem data fetch finished.');
}

// Run the script
fetchAllBaseSystems().catch(error => {
  console.error('An unexpected error occurred during base solar system fetch:', error);
  process.exit(1);
}); 