import path from 'path';
import { POD, PODEntries, JSONPOD, PODContent } from '@pcd/pod';
import type { DetailedSmartAssembly, AssemblyDetailMap } from '../../../src/types/gameData';
import { readJsonFile, writeJsonFile, loadPrivateKey } from '../utils/fsUtils';
import { bigIntToLimbs, floatToFixedInt } from '../utils/podBigInt';

// --- Configuration ---
const SOURCE_ASSEMBLY_DETAILS_FILE = path.join(__dirname, '..', 'game-data', 'smart_assemblies.json');
const OUTPUT_PODS_FILE = path.join(__dirname, '..', 'pod-data', 'smart_assembly_pods.json');
const POD_DATA_TYPE = 'evefrontier.smart_assembly';
const FUEL_FIXED_POINT_FACTOR = 1000000000000000000n;

// Define the structure we'll save to the JSON file
interface StoredPOD {
    contentId: string;
    pod: JSONPOD;
}

// --- Helper Function: SmartAssembly Detail to PODEntries ---
// Now takes the detailed assembly object
function detailedAssemblyToPODEntries(asm: DetailedSmartAssembly): PODEntries {
    const entries: PODEntries = {};

    // Basic fields from the detailed object
    entries['assemblyId'] = { type: 'string', value: asm.id };
    entries['itemId'] = { type: 'int', value: BigInt(asm.itemId ?? 0) };
    entries['chainId'] = { type: 'int', value: BigInt(asm.chainId ?? 0) };
    entries['stateId'] = { type: 'int', value: BigInt(asm.stateId ?? 0) };
    entries['state'] = { type: 'string', value: asm.state ?? '' };
    entries['isOnline'] = { type: 'boolean', value: !!asm.isOnline };
    entries['name'] = { type: 'string', value: asm.name ?? '' };
    entries['ownerId'] = { type: 'string', value: asm.ownerId ?? '' };
    entries['ownerName'] = { type: 'string', value: asm.ownerName ?? '' };
    entries['typeId'] = { type: 'int', value: BigInt(asm.typeId ?? 0) };
    entries['assemblyType'] = { type: 'string', value: asm.assemblyType ?? '' };
    entries['description'] = { type: 'string', value: asm.description ?? '' };
    
    // Add the Solar System ID 
    entries['solarSystemId'] = { type: 'int', value: BigInt(asm.solarSystemId) };

    // Add assembly's location using two-limb representation
    if (asm.location) {
        const locX = BigInt(Math.round(asm.location.x));
        const { high: x_high, low: x_low } = bigIntToLimbs(locX);
        entries['location_x_high'] = { type: 'int', value: x_high };
        entries['location_x_low'] = { type: 'int', value: x_low };

        const locY = BigInt(Math.round(asm.location.y));
        const { high: y_high, low: y_low } = bigIntToLimbs(locY);
        entries['location_y_high'] = { type: 'int', value: y_high };
        entries['location_y_low'] = { type: 'int', value: y_low };

        const locZ = BigInt(Math.round(asm.location.z));
        const { high: z_high, low: z_low } = bigIntToLimbs(locZ);
        entries['location_z_high'] = { type: 'int', value: z_high };
        entries['location_z_low'] = { type: 'int', value: z_low };
    } else {
        // Should not happen if data comes from detail fetch, but handle defensively
        const zero = { type: 'int' as const, value: 0n };
        entries['location_x_high'] = zero;
        entries['location_x_low'] = zero;
        entries['location_y_high'] = zero;
        entries['location_y_low'] = zero;
        entries['location_z_high'] = zero;
        entries['location_z_low'] = zero; 
    }
    
    /* Exclude Fuel Data for now
    // Add Fuel Data (converting large numbers from string)
    if (asm.fuel) {
        try {
             // Convert potentially very large fuel strings to BigInt
             entries['fuelAmount'] = { type: 'int', value: BigInt(asm.fuel.fuelAmount) };
             entries['fuelMaxCapacity'] = { type: 'int', value: BigInt(asm.fuel.fuelMaxCapacity) };
             entries['fuelUnitVolume'] = { type: 'int', value: BigInt(asm.fuel.fuelUnitVolume) };
             // Consumption is likely a normal number
             entries['fuelConsumptionPerMin'] = { type: 'int', value: BigInt(asm.fuel.fuelConsumptionPerMin) };
        } catch (e) {
            console.error(`Error converting fuel data for assembly ${asm.id}: ${e instanceof Error ? e.message : e}`);
             // Set fuel fields to null or zero if conversion fails?
             entries['fuelAmount'] = { type: 'int', value: 0n };
             entries['fuelMaxCapacity'] = { type: 'int', value: 0n };
             entries['fuelUnitVolume'] = { type: 'int', value: 0n };
             entries['fuelConsumptionPerMin'] = { type: 'int', value: 0n };
        }
    } else {
        // Set fuel fields to null or zero if fuel object is missing
        entries['fuelAmount'] = { type: 'int', value: 0n };
        entries['fuelMaxCapacity'] = { type: 'int', value: 0n };
        entries['fuelUnitVolume'] = { type: 'int', value: 0n };
        entries['fuelConsumptionPerMin'] = { type: 'int', value: 0n };
    }
    */

    // Use the renamed timestamp field
    entries['timestamp'] = { type: 'int', value: BigInt(asm.timestamp) };

    // Add the type identifier
    entries['pod_data_type'] = { type: 'string', value: POD_DATA_TYPE };

    return entries;
}

// --- Main Script ---
async function generateAssemblies() {
    console.log('Starting SmartAssembly POD generation from detailed data (Overwrite Strategy)...');
    const privateKey = loadPrivateKey();

    // 1. Read source assembly details
    const assemblyDetails = await readJsonFile<AssemblyDetailMap>(SOURCE_ASSEMBLY_DETAILS_FILE, {});
    const assemblyIds = Object.keys(assemblyDetails);

    if (assemblyIds.length === 0) {
        console.log('No source assembly details found. Run update-and-fetch first. Exiting.');
        return;
    }
    console.log(`Read details for ${assemblyIds.length} assemblies.`);

    // 2. Iterate through details and generate PODs
    const outputAssemblyPods: StoredPOD[] = []; // Output is now an array of StoredPODs
    let assembliesProcessed = 0;
    
    for (const assemblyId of assemblyIds) {
        const asmDetail = assemblyDetails[assemblyId];
        if (!asmDetail) continue; 

        try {
            const podEntries = detailedAssemblyToPODEntries(asmDetail);
            const contentId = PODContent.fromEntries(podEntries).contentID.toString();
            const pod = POD.sign(podEntries, privateKey);
            const jsonPod = pod.toJSON();
            const storedPod: StoredPOD = { contentId: contentId, pod: jsonPod };
            outputAssemblyPods.push(storedPod);
            assembliesProcessed++;

        } catch (error: any) {
            console.error(`Error processing assembly detail for ${assemblyId}: ${error.message}`);
        }
    }

    console.log(`Processed ${assembliesProcessed} assembly details. Generated ${outputAssemblyPods.length} assembly PODs.`);

    // 3. Overwrite the output file with the generated PODs
    await writeJsonFile(OUTPUT_PODS_FILE, outputAssemblyPods);

    console.log('SmartAssembly POD generation finished (Overwrite).');
}

// Run the script
generateAssemblies().catch(error => {
    console.error('An unexpected error occurred during assembly POD generation:', error);
    process.exit(1);
}); 