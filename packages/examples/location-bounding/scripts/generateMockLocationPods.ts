import path from 'path';
import {
    POD,
    PODEntries,
    JSONPOD,
    PODContent,
    PODValue // Import PODValue
} from '@pcd/pod';
import { DetailedSmartAssembly, ShipLocationData } from '../types/mockLocationTypes';
import { writeJsonFile, loadPrivateKey } from '../../../pods/utils/fsUtils';
import { bigIntToLimbs, limbsToBigInt } from '../../../pods/utils/podBigInt'; // Import limbsToBigInt

// --- Configuration ---
const LOCATION_DATA_DIR = path.join(__dirname, '..', 'pod-data');
const MOCK_CONFIG_DIR = path.join(__dirname, '..', '..', 'gpc', 'proof-configs');
const OUTPUT_PODS_FILE = path.join(__dirname, '..', 'pod-data', 'location_pods.json');
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
async function generateMocks() {
    console.log('Starting Mock Location POD generation (including distance assertion)...');
    const privateKey = loadPrivateKey();

    const outputPods: JSONPOD[] = [];
    let assemblyEntries: PODEntries | null = null;
    let shipEntries: PODEntries | null = null;

    // Generate Assembly POD (in memory first)
    try {
        assemblyEntries = assemblyDataToPODEntries(mockAssemblyData);
        const assemblyPod = POD.sign(assemblyEntries, privateKey);
        outputPods.push(assemblyPod.toJSON());
        console.log(`Generated mock Assembly POD (ID: ${mockAssemblyData.id})`);
    } catch (error: any) {
        console.error(`Error generating mock Assembly POD: ${error.message}`);
        process.exit(1); // Exit if base PODs fail
    }

    // Generate Ship Location POD (in memory first)
    try {
        shipEntries = shipDataToPODEntries(mockShipData);
        const shipPod = POD.sign(shipEntries, privateKey);
        outputPods.push(shipPod.toJSON());
         console.log(`Generated mock Ship Location POD (ID: ${mockShipData.shipId})`);
    } catch (error: any) {
        console.error(`Error generating mock Ship Location POD: ${error.message}`);
        process.exit(1); // Exit if base PODs fail
    }

    // Calculate Distance and Create DistanceAssertionPOD
    try {
        if (!assemblyEntries || !shipEntries) {
            throw new Error("Assembly or Ship entries not generated.");
        }
        console.log("Calculating distance between assembly and ship...");
        const assemblyLoc = reconstructLocation(assemblyEntries);
        const shipLoc = reconstructLocation(shipEntries);
        if (!assemblyLoc || !shipLoc) {
            throw new Error("Failed to reconstruct location data.");
        }
        const dx = absDiff(assemblyLoc.x, shipLoc.x);
        const dy = absDiff(assemblyLoc.y, shipLoc.y);
        const dz = absDiff(assemblyLoc.z, shipLoc.z);
        const distanceSquaredMeters = (dx * dx) + (dy * dy) + (dz * dz);
        console.log(`Distance squared: ${distanceSquaredMeters}`);

        if (distanceSquaredMeters > MAX_DISTANCE_SQUARED_ALLOWED) {
            throw new Error(`Distance squared (${distanceSquaredMeters}) exceeds limit (${MAX_DISTANCE_SQUARED_ALLOWED}).`);
        }
        console.log("Distance squared OK.");

        console.log("Creating DistanceAssertionPOD...");
        const assemblyId = getStringValue(assemblyEntries, 'assemblyId') ?? 'unknown_assembly';
        const shipIdFromPOD = getStringValue(shipEntries, 'shipId') ?? 'unknown_ship';
        const distanceEntries: PODEntries = {
            objectId: { type: 'string', value: assemblyId },
            shipId: { type: 'string', value: shipIdFromPOD },
            distanceSquaredMeters: { type: 'int', value: distanceSquaredMeters },
            timestamp: { type: 'int', value: BigInt(distanceAssertionTimestamp) }, // Use specific timestamp
            pod_data_type: { type: 'string', value: POD_DATA_TYPE_DISTANCE }
        };
        const distanceAssertionPod = POD.sign(distanceEntries, privateKey);
        outputPods.push(distanceAssertionPod.toJSON());
        console.log("Signed DistanceAssertionPOD generated and added.");

    } catch (error: any) {
        console.error(`Error calculating distance or creating assertion POD: ${error.message}`);
        process.exit(1); // Exit if assertion fails
    }
    
    // Write the array of ALL THREE PODs to the output file
    await writeJsonFile(OUTPUT_PODS_FILE, outputPods);

    console.log(`Mock Location POD generation finished. Wrote ${outputPods.length} PODs (Assembly, Ship, Distance) to ${OUTPUT_PODS_FILE}`);

    // Add delay before finishing
    console.log('Adding 1-second delay...');
    await delay(1000);
    console.log('Delay complete.');
}

// Run the script
generateMocks().catch(error => {
    console.error('An unexpected error occurred during mock location POD generation:', error);
    process.exit(1);
}); 