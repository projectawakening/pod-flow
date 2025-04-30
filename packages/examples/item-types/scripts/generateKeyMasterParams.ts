import path from 'path';
import { PODValue, PODEntries, JSONPOD, POD } from '@pcd/pod';
import { writeJsonFile, readJsonFile, loadPrivateKey } from '../../../pods/utils/fsUtils';
import { randomBytes } from 'crypto';
import { podValueToJSON } from '@pcd/pod';

// --- Configuration ---
const SOURCE_ITEM_PODS_FILE = path.join(__dirname, '..', '..', '..', 'pods', 'pod-data', 'item_type_pods.json');
const OUTPUT_PARAMS_FILE = path.join(__dirname, '..', 'pod-data', 'key_master_params.json');

const POD_DATA_TYPE_INVENTORY = 'evefrontier.inventory_verification';
const KEY_IDS_TO_INCLUDE = ['73193', '83580', '83581'];
const CONFIG_KEYS_FOR_SOURCE_PODS = ['keyItem1', 'keyItem2', 'keyItem3']; // Must match order of KEY_IDS_TO_INCLUDE
const CONFIG_KEY_FOR_INVENTORY_POD = 'inventory';

const MOCK_OWNED_KEY_ID = 83581n;

const randomUint256 = (): string => {
    const bytes = randomBytes(32);
    const hex = bytes.toString('hex');
    const bigIntValue = BigInt(`0x${hex}`);
    return bigIntValue.toString();
};
const MOCK_SHIP_ID = randomUint256();

// --- Main Script ---
async function generateKeyMasterParams() {
    console.log('Generating Key Master parameters file...');
    const privateKey = loadPrivateKey(); // Load key for signing

    // +++ 1. Read source item type PODs +++
    let allItemPodsJson: { [key: string]: JSONPOD } = {};
    try {
        allItemPodsJson = await readJsonFile<{ [key: string]: JSONPOD }>(SOURCE_ITEM_PODS_FILE, {});
        console.log(`Read ${Object.keys(allItemPodsJson).length} source item type PODs.`);
    } catch (error: any) {
        console.error(`Error reading source item PODs from ${SOURCE_ITEM_PODS_FILE}: ${error.message}`);
        process.exit(1);
    }

    // Object to hold final POD data keyed by contentId
    const finalPodsByContentId: { [contentId: string]: JSONPOD } = {};
    // Object to map config keys to contentIds
    const podConfigMapping: { [configKey: string]: string } = {};

    // +++ 2. Select, Deserialize, and Process required source PODs +++
    console.log('Processing selected source PODs by iterating through source file...');
    const foundTypeIds = new Set<string>();
    // Iterate through the contentId-keyed source PODs object
    for (const contentId in allItemPodsJson) {
        const sourceJsonPod = allItemPodsJson[contentId];
        try {
            // Deserialize to access entries
            const podInstance = POD.fromJSON(sourceJsonPod);
            const typeIdValue = podInstance.content.getValue('typeId');
            
            // Check if typeId is defined and is an integer type
            if (typeIdValue && typeIdValue.type === 'int') {
                const typeIdString = typeIdValue.value.toString();
                
                // Is this one of the type IDs we need?
                const keyIndex = KEY_IDS_TO_INCLUDE.indexOf(typeIdString);
                if (keyIndex !== -1) {
                    // Found a needed POD
                    const configKey = CONFIG_KEYS_FOR_SOURCE_PODS[keyIndex];
                    if (!configKey) {
                        throw new Error(`Configuration error: No config key found for typeId ${typeIdString} at index ${keyIndex}`);
                    }
                    
                    // Check if we already assigned this config key (shouldn't happen if typeIds unique)
                    if (podConfigMapping[configKey]) {
                         console.warn(`Warning: Config key '${configKey}' already mapped. Duplicate typeId ${typeIdString} found? Skipping contentId ${contentId}.`);
                         continue;
                    }

                    // Store the original JSON keyed by its actual contentId
                    finalPodsByContentId[contentId] = sourceJsonPod; 
                    // Map the config key to this contentId
                    podConfigMapping[configKey] = contentId;
                    foundTypeIds.add(typeIdString);
                    console.log(`  Mapped source POD typeId ${typeIdString} -> config key '${configKey}' (contentId: ${contentId})`);
                }
            }
        } catch (error: any) {
            console.error(`Error processing source POD with contentId ${contentId}: ${error.message}`);
            // Decide if we should exit or just skip this POD
            // process.exit(1);
        }
    }

    // Verify all required keys were found
    if (foundTypeIds.size !== KEY_IDS_TO_INCLUDE.length) {
        const missingIds = KEY_IDS_TO_INCLUDE.filter(id => !foundTypeIds.has(id));
        console.error(`Error: Could not find all required key item PODs by typeId. Missing: ${missingIds.join(', ')}`);
        process.exit(1);
    }
    console.log(`Successfully processed ${foundTypeIds.size} required source PODs.`);


    // +++ 3. Generate and Sign the Inventory POD +++
    console.log('Generating and signing Inventory POD...');
    let inventoryPod: POD | null = null;
    try {
        const inventoryPodEntries: PODEntries = {
            shipId: { type: 'string', value: MOCK_SHIP_ID },
            itemTypeId: { type: 'int', value: MOCK_OWNED_KEY_ID },
            keyItemIds: { type: 'string', value: JSON.stringify(KEY_IDS_TO_INCLUDE.map(id => parseInt(id))) },
            quantity: { type: 'int', value: 1n },
            timestamp: { type: 'int', value: BigInt(Date.now()) },
            pod_data_type: { type: 'string', value: POD_DATA_TYPE_INVENTORY }
        };
        inventoryPod = POD.sign(inventoryPodEntries, privateKey);
        const contentId = inventoryPod.contentID;

        finalPodsByContentId[contentId.toString()] = inventoryPod.toJSON();
        podConfigMapping[CONFIG_KEY_FOR_INVENTORY_POD] = contentId.toString();
        console.log(`  Generated inventory POD -> config key '${CONFIG_KEY_FOR_INVENTORY_POD}' (contentId: ${contentId.toString()})`);

    } catch (error: any) {
        console.error(`Error generating Inventory POD: ${error.message}`);
        process.exit(1);
    }

    // +++ 4. Define Membership List Data +++
    // Restore PODValue array generation as expected by gen-proof-requirements.ts checks
    const validKeyIdsList: PODValue[] = KEY_IDS_TO_INCLUDE.map(id => ({
        type: 'int',
        value: BigInt(id)
    }));

    // +++ 5. Assemble final params data +++
    const paramsData = {
        // PODs keyed by contentId
        pods: finalPodsByContentId,
        // Mapping from config keys to contentIds
        podConfigMapping: podConfigMapping,
        // Membership lists
        membershipLists: {
            validKeyIds: validKeyIdsList
        }
        // Remove inventoryPod section as it's now included in 'pods'
        // inventoryPod: { ... },
        // Remove sourcePods section as it's now included in 'pods'
        // sourcePods: sourcePodsToInclude,
    };

    // +++ 6. Write the parameters to the output file +++
    try {
        let outputParamsData: any = { ...paramsData }; // Start with a copy
        if (outputParamsData.membershipLists) {
            const serializedMembershipLists: any = {};
            for (const listName in outputParamsData.membershipLists) {
                const list = outputParamsData.membershipLists[listName];
                // Ensure list is an array before mapping
                if (Array.isArray(list)) {
                    serializedMembershipLists[listName] = list.map((item: any) => {
                        // Handle both single PODValues and tuples (arrays of PODValues)
                        if (Array.isArray(item)) { // It's a tuple
                            return item.map((podValue: any) => podValueToJSON(podValue));
                        } else { // It's a single PODValue
                            return podValueToJSON(item);
                        }
                    });
                } else {
                    console.warn(`Membership list '${listName}' in paramsData is not an array, skipping serialization.`);
                    serializedMembershipLists[listName] = list; // Keep original if not array
                }
            }
            outputParamsData.membershipLists = serializedMembershipLists;
        }
        // Note: Watermark/Owner serialization would go here if they used PODValues

        // Pass the object with serialized lists to writeJsonFile
        await writeJsonFile(OUTPUT_PARAMS_FILE, outputParamsData); // <<< Use outputParamsData
        console.log(`Successfully wrote parameters to ${OUTPUT_PARAMS_FILE}`);
    } catch (error: any) {
        console.error(`Error writing parameters file ${OUTPUT_PARAMS_FILE}: ${error.message}`);
        process.exit(1);
    }

    console.log('Key Master parameters generation finished.');
}

// Run the script
generateKeyMasterParams().catch(error => {
    console.error('An unexpected error occurred during Key Master parameters generation:', error);
    process.exit(1);
}); 