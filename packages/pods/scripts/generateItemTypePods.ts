import path from 'path';
import { POD, PODEntries, JSONPOD, PODValue } from '@pcd/pod';
import type { ItemType, ItemTypeMap } from '../../../src/types/gameData';
import { readJsonFile, writeJsonFile, loadPrivateKey } from '../utils/fsUtils';
import { floatToFixedInt } from '../utils/podBigInt';

// --- Configuration ---
const SOURCE_ITEMTYPES_FILE = path.join(__dirname, '..', 'game-data', 'item_types.json');
const OUTPUT_PODS_FILE = path.join(__dirname, '..', 'pod-data', 'item_type_pods.json');
const POD_DATA_TYPE = 'evefrontier.item_type';
const FIXED_POINT_FACTOR = 100000n; // For 5 decimal places

// --- Helper Function: ItemType to PODEntries ---
function itemTypeToPODEntries(gt: ItemType, typeId: string): PODEntries {
    const entries: PODEntries = {};

    // Add basic fields
    entries['typeId'] = { type: 'int', value: BigInt(typeId) };
    entries['name'] = { type: 'string', value: gt.name };
    entries['description'] = { type: 'string', value: gt.description };
    entries['smartItemId'] = { type: 'string', value: gt.smartItemId };

    // Flatten attributes
    for (const attr of gt.attributes) {
        const entryKey = `attr_${attr.trait_type}`;
        let podVal: PODValue | undefined;

        if (attr.value === null || attr.value === undefined) {
            podVal = { type: 'null', value: null };
        } else if (typeof attr.value === 'number') {
            // Handle mass, volume, and radius using fixed-point conversion
            if (attr.trait_type === 'mass' || attr.trait_type === 'volume' || attr.trait_type === 'radius') {
                 try {
                     const scaledValue = floatToFixedInt(attr.value, FIXED_POINT_FACTOR);
                     podVal = { type: 'int', value: scaledValue };
                 } catch (e) {
                     console.error(`Error scaling ${attr.trait_type} for typeId ${typeId}: ${e instanceof Error ? e.message : e}`);
                     // Decide how to handle scaling errors - skip attribute? use null?
                     podVal = { type: 'null', value: null }; // Defaulting to null on error
                 }
            } else if (Number.isInteger(attr.value)) {
                // Handle other integer numbers
                podVal = { type: 'int', value: BigInt(attr.value) };
            } else {
                // Throw error for other non-integer numeric types
                throw new Error(
                    `Attribute '${attr.trait_type}' for typeId ${typeId} has non-integer ` +
                    `numeric value ${attr.value} and is not 'mass', 'volume', or 'radius'.`
                );
            }
        } else if (typeof attr.value === 'string') {
            // Keep existing logic for strings (try parsing as int, fallback to string)
            if (/^\d+$/.test(attr.value)) {
                try {
                    podVal = { type: 'int', value: BigInt(attr.value) };
                } catch (e) {
                    podVal = { type: 'string', value: attr.value };
                }
            } else {
                podVal = { type: 'string', value: attr.value };
            }
        } else {
            console.warn(`Skipping attribute ${attr.trait_type} for typeId ${typeId} due to unknown value type: ${typeof attr.value}`);
        }

        if (podVal) {
            entries[entryKey] = podVal;
        }
    }

    // Add a type identifier using the constant
    entries['pod_data_type'] = { type: 'string', value: POD_DATA_TYPE };

    return entries;
}

// --- Main Script ---
async function generateItemTypePods() {
    console.log('Starting ItemType POD generation...');
    const privateKey = loadPrivateKey();

    // 1. Read source item types
    const sourceItemTypes = await readJsonFile<ItemTypeMap>(SOURCE_ITEMTYPES_FILE, {});
    const typeIds = Object.keys(sourceItemTypes);

    if (typeIds.length === 0) {
        console.log('No source item types found. Exiting.');
        return;
    }
    console.log(`Read ${typeIds.length} source item types.`);

    // 2. Process all item types (overwrite strategy)
    const outputPods: { [key: string]: JSONPOD } = {}; // Use object for output
    let processedCount = 0;

    for (const typeId of typeIds) {
        const itemType = sourceItemTypes[typeId];
        if (!itemType) continue; // Should not happen, but safety check

        try {
            const podEntries = itemTypeToPODEntries(itemType, typeId);
            const pod = POD.sign(podEntries, privateKey);
            outputPods[typeId] = pod.toJSON();
            processedCount++;
        } catch (error: any) {
            // Catch errors thrown by the new validation logic
            console.error(`Error processing item type ${typeId}: ${error.message}`);
        }
    }

    console.log(`Generated ${processedCount} item type PODs.`);

    // 3. Write the output object
    await writeJsonFile(OUTPUT_PODS_FILE, outputPods);

    console.log('ItemType POD generation finished.');
}

// Run the script
generateItemTypePods().catch(error => {
    console.error('An unexpected error occurred during item type POD generation:', error);
    process.exit(1);
}); 