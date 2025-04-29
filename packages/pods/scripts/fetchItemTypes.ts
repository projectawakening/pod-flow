import path from 'path';
import { writeJsonFile } from './podUtils';

// --- Configuration ---
const OUTPUT_ITEMTYPES_FILE = path.join(__dirname, '..', 'game_data', 'item_types.json');
const API_ENDPOINT = 'https://blockchain-gateway-stillness.live.tech.evefrontier.com/types';

// --- Main Script ---
async function fetchItemTypes() {
  console.log(`Starting fetch of item types from ${API_ENDPOINT}...`);

  let fetchedItemTypes: any = null;

  // 1. Fetch all item types from the API
  try {
    console.log(`Fetching item types from ${API_ENDPOINT}...`);
    const response = await fetch(API_ENDPOINT);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    fetchedItemTypes = await response.json();
    // Basic validation: Check if it's an object (expected for GameTypeMap / ItemTypeMap)
    if (typeof fetchedItemTypes !== 'object' || fetchedItemTypes === null || Array.isArray(fetchedItemTypes)) {
        throw new Error('API response was not a JSON object as expected for ItemTypeMap.');
    }

    const count = Object.keys(fetchedItemTypes).length;
    console.log(`Successfully fetched ${count} item types from the API.`);

  } catch (error: any) {
    console.error('Error fetching item types from API:', error.message);
    process.exit(1); // Exit if API fetch fails
  }

  // 2. Overwrite the output file with the fetched data
  try {
    await writeJsonFile(OUTPUT_ITEMTYPES_FILE, fetchedItemTypes);
    console.log('Finished writing item types data (Overwrite Strategy).');
  } catch (error) {
    console.error(`Failed to write item types file: ${OUTPUT_ITEMTYPES_FILE}.`);
    process.exit(1); // Exit if writing failed
  }
}

// Run the script
fetchItemTypes().catch(error => {
  console.error('An unexpected error occurred during item types fetching:', error);
  process.exit(1);
}); 