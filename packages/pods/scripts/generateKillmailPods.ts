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
    console.log('Starting Killmail POD generation (keyed by contentId, skip existing)...');
    const privateKey = loadPrivateKey();

    // 1. Read source killmails
    const sourceKillmails = await readJsonFile<Killmail[]>(SOURCE_KILLMAILS_FILE, []);
    if (sourceKillmails.length === 0) {
        console.log('No source killmails found. Exiting.');
        return;
    }
    console.log(`Read ${sourceKillmails.length} source killmails.`);

    // 2. Read existing PODs object (keyed by contentId)
    const existingPodsByContentId = await readJsonFile<{ [contentId: string]: JSONPOD }>(OUTPUT_PODS_FILE, {});
    console.log(`Read ${Object.keys(existingPodsByContentId).length} existing killmail PODs (keyed by contentId).`);
    
    // Remove the previous killmail key reconstruction logic

    // 3. Process source killmails, generating only new ones
    const newPodsToMerge: { [contentId: string]: JSONPOD } = {};
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    for (const km of sourceKillmails) {
        try {
            const podEntries = killmailToPODEntries(km);
            // Calculate potential contentId *before* signing
            const potentialContentId = PODContent.fromEntries(podEntries).contentID.toString();

            // Check if this contentId already exists
            if (!existingPodsByContentId[potentialContentId]) {
                // Only sign if it's a new POD
                const pod = POD.sign(podEntries, privateKey);
                // Sanity check: Ensure calculated contentId matches signed one
                if (pod.contentID.toString() !== potentialContentId) {
                     console.warn(`Warning: Calculated contentId ${potentialContentId} mismatch for killmail (ts: ${km.timestamp}, sys: ${km.solar_system_id}). Using signed ID ${pod.contentID.toString()}.`);
                     // Use the ID from the signed POD if mismatch occurs
                     newPodsToMerge[pod.contentID.toString()] = pod.toJSON();
                } else {
                    newPodsToMerge[potentialContentId] = pod.toJSON();
                }
                processedCount++; // Count newly generated PODs
            } else {
                skippedCount++; // Count existing PODs skipped
            }
        } catch (error: any) {
            console.error(`Error processing killmail (timestamp: ${km.timestamp}, system: ${km.solar_system_id}): ${error.message}`);
            errorCount++;
        }
    }

    console.log(`Processed ${sourceKillmails.length} source killmails. Generated ${processedCount} new PODs. Skipped ${skippedCount} existing PODs. Encountered ${errorCount} errors.`);

    // 4. Merge existing and new PODs and write back
    if (processedCount > 0) { // Only write if new PODs were generated
        const finalOutputPods = { ...existingPodsByContentId, ...newPodsToMerge };
        await writeJsonFile(OUTPUT_PODS_FILE, finalOutputPods);
        console.log(`Wrote ${Object.keys(finalOutputPods).length} total killmail PODs (keyed by contentId) to file.`);
    } else {
        console.log('No new killmails needed. Output file remains unchanged.');
    }

    console.log('Killmail POD generation finished.');
}

// Run the script
generateKillmails().catch(error => {
    console.error('An unexpected error occurred during killmail POD generation:', error);
    process.exit(1);
}); 