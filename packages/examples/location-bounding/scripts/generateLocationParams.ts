import path from 'path';
import {
    POD,
    PODEntries,
    JSONPOD,
    PODContent,
    PODValue, // Import PODValue
    podValueToJSON // <<< Import podValueToJSON >>>
} from '@pcd/pod';
import { DetailedSmartAssembly, ShipLocationData } from '../types/mockLocationTypes';
import { writeJsonFile, loadPrivateKey } from '../../../pods/utils/fsUtils';
import { bigIntToLimbs, limbsToBigInt } from '../../../pods/utils/podBigInt'; // Import limbsToBigInt

// --- Configuration ---
const LOCATION_DATA_DIR = path.join(__dirname, '..', 'pod-data');
const MOCK_CONFIG_DIR = path.join(__dirname, '..', '..', 'gpc', 'proof-configs');
const OUTPUT_PARAMS_FILE = path.join(__dirname, '..', 'pod-data', 'location_proof_params.json');
const POD_DATA_TYPE_ASSEMBLY = 'evefrontier.smart_assembly';
const POD_DATA_TYPE_SHIP = 'evefrontier.ship_location'; 
const POD_DATA_TYPE_DISTANCE = 'evefrontier.distance_assertion'; // Add distance type
const MAX_DISTANCE_SQUARED_ALLOWED = (1n << 63n) - 1n; // Needed for check

// --- Mock Data Definitions ---

const currentTimestamp = Date.now(); // Get current time once
const assemblyTimestamp = currentTimestamp - 2000; // 2 seconds before
const shipTimestamp = currentTimestamp; // Current time
const distanceAssertionTimestamp = currentTimestamp + 1000; // 1 second after ship (matches delay logic)

const mockAssemblyData: DetailedSmartAssembly = {
    id: "64363262289810529947066631164819576370171796838157202869397805121486329616492",
    itemId: 1000000011304,
    typeId: 84955,
    ownerId: "0xa5dce2f1caf6d07bbea2061f90ac4582b64f43f6",
    ownerName: "Mock Assembly Owner",
    chainId: 695569,
    name: "Mock Assembly Alpha",
    description: "A mock assembly for testing location bounds.",
    isOnline: true,
    stateId: 2,
    state: "Anchored",
    solarSystemId: 30000004,
    location: { x: -10, y: 10, z: 20 },
    assemblyType: "SmartGate",
    timestamp: assemblyTimestamp // Use dynamic timestamp
};

const mockShipData: ShipLocationData = {
    shipId: "8888777766665555444433332222111100009999888877776666555544443333222211110000",
    solarSystemId: 30000004, // Same solar system
    location: { x: -9, y: 11, z: 21 }, // Close to assembly
    interactionDistance: 4n, // Interaction distance threshold (max distance squared)
    timestamp: shipTimestamp // Use dynamic timestamp
};

// --- Helper Function: Delay ---
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Helper Functions --- 

// ** Add helpers needed for distance calculation (from generate-inputs.ts) **
function getEntryValue<T extends PODValue['type']>(
  entries: PODEntries,
  key: string,
  expectedType: T
): PODValue | undefined {
  const entry = entries[key];
  if (entry && entry.type === expectedType) {
    return entry;
  }
  return undefined;
}

function getIntValue(entries: PODEntries, key: string): bigint | undefined {
  const entry = getEntryValue(entries, key, 'int');
  return entry?.value as bigint | undefined;
}

function getStringValue(entries: PODEntries, key: string): string | undefined {
  const entry = getEntryValue(entries, key, 'string');
  return entry?.value as string | undefined;
}

function reconstructLocation(entries: PODEntries): { x: bigint; y: bigint; z: bigint } | undefined {
  const x_high = getIntValue(entries, 'location_x_high');
  const x_low = getIntValue(entries, 'location_x_low');
  const y_high = getIntValue(entries, 'location_y_high');
  const y_low = getIntValue(entries, 'location_y_low');
  const z_high = getIntValue(entries, 'location_z_high');
  const z_low = getIntValue(entries, 'location_z_low');

  if (x_high === undefined || x_low === undefined || y_high === undefined || y_low === undefined || z_high === undefined || z_low === undefined) {
    console.error("Missing one or more location limb entries."); return undefined;
  }
  try {
    return { x: limbsToBigInt(x_high, x_low), y: limbsToBigInt(y_high, y_low), z: limbsToBigInt(z_high, z_low) };
  } catch (e) {
    console.error("Error reconstructing location from limbs:", e); return undefined;
  }
}

function absDiff(a: bigint, b: bigint): bigint {
  return a > b ? a - b : b - a;
}
// ** End of added helpers **

function assemblyDataToPODEntries(asm: DetailedSmartAssembly): PODEntries {
    const entries: PODEntries = {};
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
        const zero = { type: 'int' as const, value: 0n };
        entries['location_x_high'] = zero;
        entries['location_x_low'] = zero;
        entries['location_y_high'] = zero;
        entries['location_y_low'] = zero;
        entries['location_z_high'] = zero;
        entries['location_z_low'] = zero; 
    }

    // Fuel is excluded

    entries['timestamp'] = { type: 'int', value: BigInt(asm.timestamp) };
    entries['pod_data_type'] = { type: 'string', value: POD_DATA_TYPE_ASSEMBLY };
    return entries;
}

function shipDataToPODEntries(ship: ShipLocationData): PODEntries {
    const entries: PODEntries = {};

    entries['shipId'] = { type: 'string', value: ship.shipId };
    entries['solarSystemId'] = { type: 'int', value: BigInt(ship.solarSystemId) };
    entries['interactionDistance'] = { type: 'int', value: ship.interactionDistance }; // Already BigInt
    entries['timestamp'] = { type: 'int', value: BigInt(ship.timestamp) };

    // Add ship's location using two-limb representation
    if (ship.location) {
        const locX = BigInt(Math.round(ship.location.x));
        const { high: x_high, low: x_low } = bigIntToLimbs(locX);
        entries['location_x_high'] = { type: 'int', value: x_high };
        entries['location_x_low'] = { type: 'int', value: x_low };

        const locY = BigInt(Math.round(ship.location.y));
        const { high: y_high, low: y_low } = bigIntToLimbs(locY);
        entries['location_y_high'] = { type: 'int', value: y_high };
        entries['location_y_low'] = { type: 'int', value: y_low };

        const locZ = BigInt(Math.round(ship.location.z));
        const { high: z_high, low: z_low } = bigIntToLimbs(locZ);
        entries['location_z_high'] = { type: 'int', value: z_high };
        entries['location_z_low'] = { type: 'int', value: z_low };
    } else {
        const zero = { type: 'int' as const, value: 0n };
        entries['location_x_high'] = zero;
        entries['location_x_low'] = zero;
        entries['location_y_high'] = zero;
        entries['location_y_low'] = zero;
        entries['location_z_high'] = zero;
        entries['location_z_low'] = zero; 
    }

    entries['pod_data_type'] = { type: 'string', value: POD_DATA_TYPE_SHIP };
    return entries;
}

// --- Main Script ---
async function generateLocationParams() { // <<< Rename function
    console.log('--- Generating Location Validation parameters file... ---'); // <<< Update log
    const privateKey = loadPrivateKey();

    // <<< Create objects to hold final params data >>>
    const finalPodsByContentId: { [contentId: string]: JSONPOD } = {};
    const podConfigMapping: { [configKey: string]: string } = {};

    // 1. Generate Assembly POD
    console.log('Generating Assembly POD...');
    const assemblyEntries = assemblyDataToPODEntries(mockAssemblyData);
    const assemblyPod = POD.sign(assemblyEntries, privateKey);
    const assemblyContentId = assemblyPod.contentID.toString();
    finalPodsByContentId[assemblyContentId] = assemblyPod.toJSON();
    podConfigMapping['object'] = assemblyContentId; // <<< Use key from proof config
    console.log(`  Generated Assembly POD (contentId: ${assemblyContentId}) -> mapped to config key 'object'`);

    // 2. Generate Ship POD
    console.log('Generating Ship POD...');
    const shipEntries = shipDataToPODEntries(mockShipData);
    const shipPod = POD.sign(shipEntries, privateKey);
    const shipContentId = shipPod.contentID.toString();
    finalPodsByContentId[shipContentId] = shipPod.toJSON();
    podConfigMapping['ship'] = shipContentId; // <<< Use key from proof config
    console.log(`  Generated Ship POD (contentId: ${shipContentId}) -> mapped to config key 'ship'`);

    // 3. Generate Distance Assertion POD
    console.log('Generating Distance Assertion POD...');
    let distanceContentId = '';
    try {
        // Reconstruct locations to calculate distance
        const assemblyLoc = reconstructLocation(assemblyEntries);
        const shipLoc = reconstructLocation(shipEntries);
        if (!assemblyLoc || !shipLoc) {
            throw new Error("Could not reconstruct location for distance calculation.");
        }

        // Calculate squared Euclidean distance
        const dx = absDiff(assemblyLoc.x, shipLoc.x);
        const dy = absDiff(assemblyLoc.y, shipLoc.y);
        const dz = absDiff(assemblyLoc.z, shipLoc.z);
        const distanceSquared = dx * dx + dy * dy + dz * dz;

        // Check if distance exceeds max allowed (optional, but good practice)
        if (distanceSquared > MAX_DISTANCE_SQUARED_ALLOWED) {
            console.warn(`Warning: Calculated distance squared (${distanceSquared}) exceeds maximum allowed by circuit constraints (${MAX_DISTANCE_SQUARED_ALLOWED}). Proof might fail.`);
        }

        // Create entries for the Distance Assertion POD
        const distanceAssertionEntries: PODEntries = {
            distanceSquaredMeters: { type: 'int', value: distanceSquared },
            objectId: { type: 'string', value: mockAssemblyData.id }, // Get ID from mock data
            shipId: { type: 'string', value: mockShipData.shipId },     // Get ID from mock data
            timestamp: { type: 'int', value: BigInt(distanceAssertionTimestamp) },
            pod_data_type: { type: 'string', value: POD_DATA_TYPE_DISTANCE }
        };

        // Sign the POD
        const distancePod = POD.sign(distanceAssertionEntries, privateKey);
        distanceContentId = distancePod.contentID.toString();

        // Add to final data structures
        finalPodsByContentId[distanceContentId] = distancePod.toJSON();
        podConfigMapping['distance'] = distanceContentId; // <<< Use 'distance' key

        console.log(`  Generated Distance Assertion POD (contentId: ${distanceContentId}) -> mapped to config key 'distance'`);

    } catch (error: any) {
        console.error(`Error generating Distance Assertion POD: ${error.message}`);
        process.exit(1);
    }

    // 4. Assemble final params data
    const paramsData = {
        pods: finalPodsByContentId,
        podConfigMapping: podConfigMapping,
        // membershipLists: {}, // Add if needed by the location proof config
        // owner: {},           // Add if needed
        // watermark: {},       // Add if needed
    };

    // 5. Write the parameters to the output file
    try {
        // <<< Add serialization logic >>>
        let outputParamsData: any = { ...paramsData };
        // Serialize any PODValues in watermark or owner if they exist
        if (outputParamsData.watermark) {
            outputParamsData.watermark = podValueToJSON(outputParamsData.watermark);
        }
        // Add similar logic for owner if it contains PODValues
        // if (outputParamsData.owner && outputParamsData.owner.externalNullifier) {
        //    outputParamsData.owner.externalNullifier = podValueToJSON(outputParamsData.owner.externalNullifier);
        // }
        // Membership lists serialization (unlikely needed here but included for consistency)
        if (outputParamsData.membershipLists) {
            const serializedMembershipLists: any = {};
            for (const listName in outputParamsData.membershipLists) {
                const list = outputParamsData.membershipLists[listName];
                if (Array.isArray(list)) {
                    serializedMembershipLists[listName] = list.map((item: any) => {
                        if (Array.isArray(item)) {
                            return item.map((podValue: any) => podValueToJSON(podValue));
                        } else {
                            return podValueToJSON(item);
                        }
                    });
                } else { /* handle non-array list if needed */ }
            }
            outputParamsData.membershipLists = serializedMembershipLists;
        }

        await writeJsonFile(OUTPUT_PARAMS_FILE, outputParamsData);
        console.log(`Successfully wrote parameters to ${OUTPUT_PARAMS_FILE}`);
    } catch (error: any) {
        console.error(`Error writing parameters file ${OUTPUT_PARAMS_FILE}: ${error.message}`);
        process.exit(1);
    }

    console.log('--- Location Validation Parameters Generation Finished ---'); // <<< Update log
}

// Run the script
generateLocationParams().catch(error => { // <<< Rename function call
    console.error('An unexpected error occurred during Location Validation Parameters generation:', error); // <<< Update log
    process.exit(1);
}); 