import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { Killmail } from '../../../src/types/gameData'; // Corrected relative path

// --- Configuration ---
const KILLMAILS_FILE = path.join(__dirname, '..', 'game_data', 'killmails.json');
const API_ENDPOINT = 'https://blockchain-gateway-stillness.live.tech.evefrontier.com/killmails';

// --- Helper Functions (Copied for simplicity - consider sharing in a utils file) ---

async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const data = await readFile(filePath, 'utf-8');
    if (!data.trim()) {
        console.warn(`Warning: ${filePath} is empty or contains only whitespace. Initializing with an empty array.`);
        return [] as T;
    }
    return JSON.parse(data) as T;
  } catch (error: any) {
     if (error.code === 'ENOENT') {
        console.warn(`Warning: ${filePath} not found. Initializing with an empty array.`);
        return [] as T;
    } else if (error instanceof SyntaxError) {
        console.error(`Error parsing JSON from ${filePath}: ${error.message}`);
        console.warn(`Malformed JSON in ${filePath}. Initializing with an empty array.`);
        return [] as T;
    }
    console.error(`Error reading file ${filePath}:`, error);
    throw error; // Re-throw other errors
  }
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  try {
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Successfully wrote updated data to ${filePath}`);
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    throw error;
  }
}

// Function to create a unique key for comparison
// IMPORTANT: Assumes this combination is sufficiently unique. A dedicated ID would be better.
function createKillmailKey(km: Killmail): string {
    // Use fields likely to form a unique composite key
    return `${km.timestamp}-${km.solar_system_id}-${km.victim?.address}-${km.killer?.address}`;
}


// --- Main Script ---

async function fetchKillmails() {
  console.log('Starting killmail data fetch...');

  // 1. Fetch all killmails from the API
  let fetchedKillmails: Killmail[] = [];
  try {
    console.log(`Fetching killmails from ${API_ENDPOINT}...`);
    const response = await fetch(API_ENDPOINT);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    fetchedKillmails = await response.json() as Killmail[];
    console.log(`Successfully fetched ${fetchedKillmails.length} killmails from the API.`);
  } catch (error: any) {
    console.error('Error fetching killmails from API:', error.message);
    process.exit(1); // Exit if API fetch fails
  }

  // 2. Read existing killmails data
  let existingKillmails: Killmail[] = [];
  try {
    existingKillmails = await readJsonFile<Killmail[]>(KILLMAILS_FILE);
    console.log(`Read ${existingKillmails.length} existing killmails from ${KILLMAILS_FILE}.`);
  } catch (error) {
    // readJsonFile already logs specific errors and returns [] for common issues
    console.error(`Failed to read or parse existing killmails file: ${KILLMAILS_FILE}. Exiting.`);
    // Decide if you want to exit or proceed with an empty existing list
     process.exit(1);
  }

  // 3. Identify new killmails
  const existingKillmailKeys = new Set(existingKillmails.map(createKillmailKey));
  const newKillmails = fetchedKillmails.filter(km => {
      const key = createKillmailKey(km);
      // Add only if the key is not in the set of existing keys
      return !existingKillmailKeys.has(key);
  });

  console.log(`Found ${newKillmails.length} new killmails.`);

  // 4. Append new killmails if any were found
  if (newKillmails.length > 0) {
    const updatedKillmails = [...existingKillmails, ...newKillmails];
    console.log(`Total killmails after adding new ones: ${updatedKillmails.length}`);

    // 5. Write updated data back to the file
    try {
      await writeJsonFile(KILLMAILS_FILE, updatedKillmails);
      console.log('Finished updating killmails data.');
    } catch (error) {
      console.error(`Failed to write updated killmails file: ${KILLMAILS_FILE}. New data might be lost.`);
      process.exit(1); // Exit if writing failed
    }
  } else {
    console.log('No new killmails to add. File remains unchanged.');
  }
}

// Run the script
fetchKillmails().catch(error => {
  console.error('An unexpected error occurred during killmail fetching:', error);
  process.exit(1);
}); 