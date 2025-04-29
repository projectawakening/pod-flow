import path from 'path';
import { POD, PODEntries, JSONPOD, PODContent } from '@pcd/pod';
import type { Killmail } from '../../../src/types/gameData';
import { readJsonFile, writeJsonFile, loadPrivateKey } from '../utils/fsUtils';

// --- Configuration ---
const SOURCE_KILLMAILS_FILE = path.join(__dirname, '..', 'game-data', 'killmails.json');
const OUTPUT_PODS_FILE = path.join(__dirname, '..', 'pod-data', 'killmail_pods.json');
const POD_DATA_TYPE = 'evefrontier.killmail';

// --- Helper Function: Killmail to PODEntries ---
function killmailToPODEntries(km: Killmail): PODEntries {
    const entries: PODEntries = {};
    // Simple fields
    entries['solar_system_id'] = { type: 'int', value: BigInt(km.solar_system_id) };
    entries['loss_type'] = { type: 'string', value: km.loss_type };
    entries['timestamp'] = { type: 'int', value: BigInt(km.timestamp) }; // Assuming timestamp is large number needing BigInt
    
    // Nested fields - flatten them
    if (km.victim) {
        entries['victim_address'] = { type: 'string', value: km.victim.address ?? '' };
        entries['victim_name'] = { type: 'string', value: km.victim.name ?? '' };
    }
    if (km.killer) {
        entries['killer_address'] = { type: 'string', value: km.killer.address ?? '' };
        entries['killer_name'] = { type: 'string', value: km.killer.name ?? '' };
    }

    // Add a type identifier using the constant
    entries['pod_data_type'] = { type: 'string', value: POD_DATA_TYPE };

    return entries;
}

// Function to create a unique key for comparison (consistent with fetch script)
function createKillmailKey(km: Killmail): string {
    return `${km.timestamp}-${km.solar_system_id}-${km.victim?.address}-${km.killer?.address}`;
}

// --- Main Script ---
async function generateKillmails() {
    console.log('Starting Killmail POD generation...');
    const privateKey = loadPrivateKey();

    // 1. Read source killmails
    const sourceKillmails = await readJsonFile<Killmail[]>(SOURCE_KILLMAILS_FILE, []);
    if (sourceKillmails.length === 0) {
        console.log('No source killmails found. Exiting.');
        return;
    }
    console.log(`Read ${sourceKillmails.length} source killmails.`);

    // 2. Read existing PODs and create a set of processed keys
    const existingPods = await readJsonFile<JSONPOD[]>(OUTPUT_PODS_FILE, []);
    const processedKeys = new Set<string>(
        existingPods.map(pod => {
            // Reconstruct the key from POD entries (adjust field names if needed)
            // Use specific type assertions for int fields
            const timestamp = (pod.entries['timestamp'] as { int?: string | number })?.int?.toString() ?? '';
            const solarSystemId = (pod.entries['solar_system_id'] as { int?: string | number })?.int?.toString() ?? '';
            // String fields can keep the simpler assertion (or be more specific if needed)
            const victimAddr = (pod.entries['victim_address'] as { value?: string })?.value?.toString() ?? '';
            const killerAddr = (pod.entries['killer_address'] as { value?: string })?.value?.toString() ?? '';
            return `${timestamp}-${solarSystemId}-${victimAddr}-${killerAddr}`;
        })
    );
    console.log(`Found ${existingPods.length} existing killmail PODs (${processedKeys.size} unique keys).`);

    // 3. Identify and process new killmails
    const newPods: JSONPOD[] = [];
    let processedCount = 0;
    for (const km of sourceKillmails) {
        const key = createKillmailKey(km);
        if (!processedKeys.has(key)) {
            try {
                const podEntries = killmailToPODEntries(km);
                const pod = POD.sign(podEntries, privateKey);
                newPods.push(pod.toJSON());
                processedCount++;
                // Add key to set to handle duplicates within the source file if any
                processedKeys.add(key); 
            } catch (error: any) {
                console.error(`Error processing killmail with key ${key}: ${error.message}`);
            }
        }
    }

    console.log(`Generated ${newPods.length} new killmail PODs.`);

    // 4. Append new PODs and write back
    if (newPods.length > 0) {
        const updatedPods = [...existingPods, ...newPods];
        await writeJsonFile(OUTPUT_PODS_FILE, updatedPods);
    } else {
        console.log('No new killmails to process. Output file remains unchanged.');
    }

    console.log('Killmail POD generation finished.');
}

// Run the script
generateKillmails().catch(error => {
    console.error('An unexpected error occurred during killmail POD generation:', error);
    process.exit(1);
}); 