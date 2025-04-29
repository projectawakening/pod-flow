import path from 'path';
// Import necessary types for both SolarSystem and Assembly details
import type { SolarSystem, DetailedSmartAssembly, AssemblyDetailMap } from '../../../src/types/gameData'; 
import { readJsonFile, writeJsonFile } from '../utils/fsUtils';

// --- Configuration ---
const SOLARSYSTEMS_FILE = path.join(__dirname, '..', 'game_data', 'solar_systems.json');
const OUTPUT_ASSEMBLY_DETAILS_FILE = path.join(__dirname, '..', 'game_data', 'smart_assemblies.json');
const API_SOLARSYSTEM_DETAIL_BASE = 'https://blockchain-gateway-stillness.live.tech.evefrontier.com/solarsystems/';
const API_ASSEMBLY_DETAIL_BASE = 'https://blockchain-gateway-stillness.live.tech.evefrontier.com/smartassemblies/';
const REQUESTS_PER_SECOND = 10;
const FETCH_DELAY_MS = 1000 / REQUESTS_PER_SECOND;

// Type for the structure returned by the solar system detail API
interface SolarSystemDetailResponse {
  solarSystemId: number;
  solarSystemName?: string; 
  location?: { x: number; y: number; z: number; };
  smartAssemblies?: { id: string; [key: string]: any }[]; 
  [key: string]: any;
}

// Added: Type for the raw Assembly API response
interface RawAssemblyDetailResponse {
    id: string;
    itemId: number;
    typeId: number;
    ownerId: string;
    ownerName: string;
    chainId: number;
    name: string;
    description?: string;
    isOnline: boolean;
    stateId: number;
    state: string;
    solarSystemId: number;
    location: { x: number; y: number; z: number }; 
    fuel?: { 
        fuelAmount: string; 
        fuelConsumptionPerMin: number; 
        fuelMaxCapacity: string; 
        fuelUnitVolume: string; 
    };
    assemblyType: string;
    [key: string]: any; 
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main Script ---
// Renamed function for clarity
async function updateSolarSystemsAndFetchAssemblies() {
  console.log('Starting update of SolarSystem data AND fetch of Assembly details...');

  // === Part 1: Update Solar Systems and Collect Assembly IDs ===
  console.log('\n--- Processing Solar Systems ---');
  // 1. Read the existing base solar systems data
  const baseSolarSystems = await readJsonFile<SolarSystem[]>(SOLARSYSTEMS_FILE, []);
  if (baseSolarSystems.length === 0) {
    console.log('No base solar systems found in file. Run fetch-base-solar-systems first. Exiting.');
    return;
  }
  console.log(`Read ${baseSolarSystems.length} base solar systems.`);

  // Create a map for efficient updates
  const systemsMap = new Map<number, SolarSystem>(baseSolarSystems.map(ss => [ss.solarSystemId, ss]));
  const systemIdsToUpdate = Array.from(systemsMap.keys());

  // Added: Set to collect unique assembly IDs
  const uniqueAssemblyIds = new Set<string>(); 

  console.log(`Attempting to fetch assembly lists for ${systemIdsToUpdate.length} systems...`);

  let processedSystemCount = 0;
  let updatedSystemCount = 0;
  let errorSystemCount = 0;

  // 2. Iterate and fetch details for each system
  for (const systemId of systemIdsToUpdate) {
    processedSystemCount++;
    const apiUrl = `${API_SOLARSYSTEM_DETAIL_BASE}${systemId}`;
    console.log(`(${processedSystemCount}/${systemIdsToUpdate.length}) Fetching system details for ID: ${systemId}`);

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`  - System API: System ID ${systemId} not found (404). Skipping update.`);
          const systemToUpdate = systemsMap.get(systemId);
          if (systemToUpdate) { 
            systemToUpdate.smartAssemblies = systemToUpdate.smartAssemblies ?? []; 
            systemToUpdate.timestamp = 0; 
            systemsMap.set(systemId, systemToUpdate);
          }
        } else {
          console.error(`  - System API Error for ${systemId}: ${response.status} ${response.statusText}`);
          errorSystemCount++;
        }
         continue; 
      }
      
      const systemDetail: SolarSystemDetailResponse = await response.json();

      if (!systemDetail || systemDetail.solarSystemId !== systemId) {
          console.warn(`  - Fetched system detail for ${systemId} invalid. Skipping.`);
          errorSystemCount++;
          continue;
      }

      // 3. Update the system in the map AND collect assembly IDs
      const systemToUpdate = systemsMap.get(systemId);
      if (systemToUpdate) {
          const currentTimestamp = Date.now();
          // Extract only the IDs from the nested smartAssemblies array
          const assemblyIds = (systemDetail.smartAssemblies ?? [])
              .map(asm => asm.id)
              .filter(id => {
                  if (id) {
                      uniqueAssemblyIds.add(id); // Add ID to set
                      return true;
                  }
                  return false;
              });

          // **FIX 1: Use the correct field name**
          systemToUpdate.smartAssemblies = assemblyIds; 
          systemToUpdate.timestamp = currentTimestamp;
          
          // Optionally update name/location if they changed
          if(systemDetail.solarSystemName) systemToUpdate.solarSystemName = systemDetail.solarSystemName;
          if(systemDetail.location) systemToUpdate.location = systemDetail.location;
          
          // **Remove other fields to ensure clean output**
          // This assumes systemToUpdate might have extra keys from the initial read
          // We reconstruct the object to be safe
          const updatedSystem: SolarSystem = {
              solarSystemId: systemToUpdate.solarSystemId,
              solarSystemName: systemToUpdate.solarSystemName,
              location: systemToUpdate.location,
              smartAssemblies: systemToUpdate.smartAssemblies,
              timestamp: systemToUpdate.timestamp
              // Explicitly omit rawSmartAssembliesFromApi and any other unexpected keys
          };

          // Update the map with the cleaned object
          systemsMap.set(systemId, updatedSystem);
          updatedSystemCount++;
          console.log(`  -> Updated system ${systemId}. Found ${assemblyIds.length} assemblies.`);
      } else {
           console.warn(`  - System ID ${systemId} found via API but not in base file? Skipping.`);
           errorSystemCount++;
      }

    } catch (error: any) {
      console.error(`  - Network/fetch error for system detail API on ${systemId}:`, error.message);
      errorSystemCount++;
    }

    if (processedSystemCount < systemIdsToUpdate.length) {
      await delay(FETCH_DELAY_MS);
    }
  }

  console.log(`Finished processing systems. Updated: ${updatedSystemCount}, Errors/Skipped: ${errorSystemCount}.`);

  // 4. Convert map back to array, sort, and write solar systems file
  const finalSolarSystems = Array.from(systemsMap.values());
  finalSolarSystems.sort((a, b) => a.solarSystemId - b.solarSystemId);
  await writeJsonFile(SOLARSYSTEMS_FILE, finalSolarSystems);
  console.log(`SolarSystem data update finished. Wrote ${finalSolarSystems.length} systems to ${SOLARSYSTEMS_FILE}`);
  console.log(`Collected ${uniqueAssemblyIds.size} unique assembly IDs.`);


  // === Part 2: Fetch Assembly Details ===
  console.log('\n--- Fetching Assembly Details ---');
  
  const idsToFetch = Array.from(uniqueAssemblyIds);
  if (idsToFetch.length === 0) {
      console.log('No unique assembly IDs found to fetch details for. Exiting assembly fetch.');
      return; // Exit the function if no assemblies
  }
  
  const assemblyDetailsMap: AssemblyDetailMap = {}; 
  console.log(`Attempting to fetch details for ${idsToFetch.length} unique assemblies...`);
  let processedAssemblyCount = 0;
  let successAssemblyCount = 0;
  let errorAssemblyCount = 0;

  for (const assemblyId of idsToFetch) {
    processedAssemblyCount++;
    const apiUrl = `${API_ASSEMBLY_DETAIL_BASE}${assemblyId}`;
    console.log(`(${processedAssemblyCount}/${idsToFetch.length}) Fetching details for assembly ID: ${assemblyId}`);

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
          console.warn(`  - Assembly Detail API Error for ${assemblyId}: ${response.status} ${response.statusText}`);
          errorAssemblyCount++;
          continue; 
      }
      
      const rawData: RawAssemblyDetailResponse = await response.json();

      if (!rawData || rawData.id !== assemblyId) {
          console.warn(`  - Fetched assembly detail for ${assemblyId} invalid. Skipping.`);
          errorAssemblyCount++;
          continue;
      }

      const detailTimestamp = Date.now();
      const assemblyDetail: DetailedSmartAssembly = {
          id: rawData.id,
          itemId: rawData.itemId,
          typeId: rawData.typeId,
          ownerId: rawData.ownerId,
          ownerName: rawData.ownerName,
          chainId: rawData.chainId,
          name: rawData.name,
          description: rawData.description,
          isOnline: rawData.isOnline,
          stateId: rawData.stateId,
          state: rawData.state,
          solarSystemId: rawData.solarSystemId,
          location: rawData.location, 
          fuel: rawData.fuel, 
          assemblyType: rawData.assemblyType,
          timestamp: detailTimestamp
      };

      assemblyDetailsMap[assemblyId] = assemblyDetail;
      successAssemblyCount++;

    } catch (error: any) {
      console.error(`  - Network/fetch error for assembly detail API on ${assemblyId}:`, error.message);
      errorAssemblyCount++;
    }

    if (processedAssemblyCount < idsToFetch.length) {
      await delay(FETCH_DELAY_MS);
    }
  }

  console.log(`Finished fetching assembly details. Success: ${successAssemblyCount}, Errors/Skipped: ${errorAssemblyCount}.`);

  // Write the assembly details map to the output file
  await writeJsonFile(OUTPUT_ASSEMBLY_DETAILS_FILE, assemblyDetailsMap);
  console.log(`Assembly detail fetching finished. Wrote ${successAssemblyCount} details to ${OUTPUT_ASSEMBLY_DETAILS_FILE}`);
  
  console.log(`\nScript finished updating solar systems and fetching assembly details.`);
}

// Run the script
updateSolarSystemsAndFetchAssemblies().catch(error => {
  console.error('An unexpected error occurred during the combined update/fetch process:', error);
  process.exit(1);
}); 