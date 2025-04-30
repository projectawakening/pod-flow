import path from 'path';
import { POD, PODEntries, JSONPOD, PODContent } from '@pcd/pod';
import type { SolarSystem } from '../../../src/types/gameData';
import { readJsonFile, writeJsonFile, loadPrivateKey } from '../utils/fsUtils';
import { bigIntToLimbs } from '../utils/podBigInt';

// --- Configuration ---
const SOURCE_SOLARSYSTEMS_FILE = path.join(__dirname, '..', 'game-data', 'solar_systems.json');
const OUTPUT_SOLARSYSTEM_PODS_FILE = path.join(__dirname, '..', 'pod-data', 'solar_system_pods.json');
const POD_DATA_TYPE = 'evefrontier.solar_system';

// --- Helper Function: SolarSystem to PODEntries ---
function solarSystemToPODEntries(ss: SolarSystem): PODEntries {
    const entries: PODEntries = {};

    // Add basic fields
    entries['solarSystemId'] = { type: 'int', value: BigInt(ss.solarSystemId) };
    entries['solarSystemName'] = { type: 'string', value: ss.solarSystemName };

    // Flatten location into two 63-bit limbs (high and low) per coordinate using utility
    if (ss.location) {
        const locX = BigInt(Math.round(ss.location.x));
        const { high: x_high, low: x_low } = bigIntToLimbs(locX);
        entries['location_x_high'] = { type: 'int', value: x_high };
        entries['location_x_low'] = { type: 'int', value: x_low };

        const locY = BigInt(Math.round(ss.location.y));
        const { high: y_high, low: y_low } = bigIntToLimbs(locY);
        entries['location_y_high'] = { type: 'int', value: y_high };
        entries['location_y_low'] = { type: 'int', value: y_low };

        const locZ = BigInt(Math.round(ss.location.z));
        const { high: z_high, low: z_low } = bigIntToLimbs(locZ);
        entries['location_z_high'] = { type: 'int', value: z_high };
        entries['location_z_low'] = { type: 'int', value: z_low };
    } else {
        // Handle cases where location is missing
        const zero = { type: 'int' as const, value: 0n };
        entries['location_x_high'] = zero;
        entries['location_x_low'] = zero;
        entries['location_y_high'] = zero;
        entries['location_y_low'] = zero;
        entries['location_z_high'] = zero;
        entries['location_z_low'] = zero;
    }

    // Add the Solar System timestamp (when assembly list was checked)
    entries['timestamp'] = { type: 'int', value: BigInt(ss.timestamp ?? 0) };

    // Get the assembly IDs directly from the solar system object using the correct field name
    const assemblyIds = ss.smartAssemblies ?? []; 

    // Store the array of assembly IDs as a JSON string under the key 'smartAssemblies'
    try {
      entries['smartAssemblies'] = { type: 'string', value: JSON.stringify(assemblyIds) }; 
    } catch (e: any) {
      console.warn(`Could not stringify smartAssemblies for system ${ss.solarSystemId}: ${e.message}`);
      entries['smartAssemblies'] = { type: 'string', value: '[]' }; // Keep the key
    }

    // Add a type identifier using the constant
    entries['pod_data_type'] = { type: 'string', value: POD_DATA_TYPE };

    return entries;
}

// --- Main Script ---
async function generateSolarSystems() {
    console.log('Starting SolarSystem POD generation (keyed by contentId)...');
    const privateKey = loadPrivateKey();

    // 1. Read source solar systems (contains assemblyIds)
    const sourceSolarSystems = await readJsonFile<SolarSystem[]>(SOURCE_SOLARSYSTEMS_FILE, []);
    if (sourceSolarSystems.length === 0) {
        console.log('No source solar systems found. Exiting.');
        return;
    }
    console.log(`Read ${sourceSolarSystems.length} source solar systems.`);

    // 2. Process solar systems
    const latestSolarSystemPodsByContentId = new Map<string, JSONPOD>();
    let processedCount = 0;
    let errorCount = 0;

    for (const ss of sourceSolarSystems) {
        if (ss.timestamp === 0) {
             console.warn(`Skipping solar system ${ss.solarSystemId} as it has timestamp 0.`);
             continue;
        }
        if (!ss.solarSystemId) {
            console.warn(`Skipping solar system record due to missing solarSystemId.`);
            continue;
        }

        try {
            const podEntries = solarSystemToPODEntries(ss);
            // Sign first to get the actual POD instance and contentID
            const pod = POD.sign(podEntries, privateKey);
            const contentId = pod.contentID.toString();
            const jsonPod = pod.toJSON();
            
            // Store the latest JSONPOD for each solarSystemId, keyed by contentId
            // Note: If multiple source entries exist for the same system, the *last* one processed wins here.
            // If we need the *latest timestamp*, more complex logic would be needed before this loop.
            latestSolarSystemPodsByContentId.set(contentId, jsonPod);
            processedCount++;
        } catch (error: any) {
            console.error(`Error processing solar system ${ss.solarSystemId}: ${error.message}`);
            errorCount++;
        }
    }

    // Convert Map to a plain object for JSON output
    const finalOutputPods: { [contentId: string]: JSONPOD } = Object.fromEntries(latestSolarSystemPodsByContentId);

    console.log(`Processed ${processedCount + errorCount} source solar systems. Generated ${Object.keys(finalOutputPods).length} final unique solar system PODs (keyed by contentId). Encountered ${errorCount} errors.`);

    // 4. Overwrite the output file with the object keyed by contentId
    await writeJsonFile(OUTPUT_SOLARSYSTEM_PODS_FILE, finalOutputPods);

    console.log('SolarSystem POD generation finished.');
}

// Run the script
generateSolarSystems().catch(error => {
    console.error('An unexpected error occurred during solar system POD generation:', error);
    process.exit(1);
}); 