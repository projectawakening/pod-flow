import { PODEntries, PODValue, JSONPOD } from '@pcd/pod'; // POD might not be needed directly
import { 
    LocationAttestationData, 
    DistanceAttestationData 
} from '../../types/locationBoundingTypes';
import { writeJsonFile, loadPrivateKey } from '../../../../pods/utils/fsUtils';
import { bigIntToLimbs } from '../../../../pods/utils/podBigInt';
import path from 'path';
import fs from 'fs/promises';
import { createAndSignPod } from '../../../../pods/utils/podGenerationUtils';
import { 
    locationAttestationSolidityTypeMap, 
    distanceAttestationSolidityTypeMap 
} from '../../types/podSolidityTypeMaps';

// --- Constants ---
const POD_DATA_TYPE_LOCATION_ATTESTATION = 'evefrontier.location_attestation';
const POD_DATA_TYPE_DISTANCE_ATTESTATION = 'evefrontier.distance_attestation';
const TIMESTAMP_MAX_DIFFERENCE_MS = 10000; // 10 seconds

// Helper functions to create initial PODEntries are no longer needed here,
// as the logic will be inlined in generatePods for clarity with createAndSignPod.

// --- Main Logic ---
async function generatePods() {
    console.log('--- Generating Signed PODs for Distance Attestation using createAndSignPod utility ---');

    const privateKey = loadPrivateKey();
    if (!privateKey) { throw new Error("Failed to load private key."); }

    const baseTimestamp = Date.now(); 
    const location1Timestamp = BigInt(baseTimestamp);
    const location2Timestamp = BigInt(baseTimestamp + 1000); // Ensure slightly different for distinctness
    const distanceTimestamp = BigInt(baseTimestamp + 2000);

    const outputDir = path.resolve(__dirname, '../pod-data');
    const merkleDataDir = path.resolve(__dirname, '../merkle-data');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(merkleDataDir, { recursive: true });

    // Placeholder decimal bigint strings for Object IDs
    const objectId1DecimalString = "112233445566778899001122334455667788990";
    const objectId2DecimalString = "998877665544332211009988776655443322110";

    let location1MerkleRoot: string;
    let location2MerkleRoot: string;

    // Declare source data variables in a higher scope
    let loc1SourceData: Omit<LocationAttestationData, 'keccak256_merkle_root'>;
    let loc2SourceData: Omit<LocationAttestationData, 'keccak256_merkle_root'>;

    // --- Generate Location POD 1 ---
    try {
        console.log('\nGenerating Location POD 1...');
        loc1SourceData = {
            objectId: objectId1DecimalString,
            solarSystemId: 30010690,
            location: { x: 10, y: 20, z: 30 },
            timestamp: location1Timestamp,
            pod_data_type: POD_DATA_TYPE_LOCATION_ATTESTATION,
        };

        const initialLoc1Entries: Omit<PODEntries, 'keccak256_merkle_root'> = {
            'objectId': { type: 'cryptographic', value: BigInt(loc1SourceData.objectId) },
            'solarSystemId': { type: 'int', value: BigInt(loc1SourceData.solarSystemId) },
            ...((): Record<string, PODValue> => {
                const entries: Record<string, PODValue> = {};
                const x_limbs = bigIntToLimbs(BigInt(loc1SourceData.location.x));
                entries['location_x_low'] = { type: 'int', value: x_limbs.low };
                entries['location_x_high'] = { type: 'int', value: x_limbs.high };
                const y_limbs = bigIntToLimbs(BigInt(loc1SourceData.location.y));
                entries['location_y_low'] = { type: 'int', value: y_limbs.low };
                entries['location_y_high'] = { type: 'int', value: y_limbs.high };
                const z_limbs = bigIntToLimbs(BigInt(loc1SourceData.location.z));
                entries['location_z_low'] = { type: 'int', value: z_limbs.low };
                entries['location_z_high'] = { type: 'int', value: z_limbs.high };
                return entries;
            })(),
            'timestamp': { type: 'int', value: loc1SourceData.timestamp },
            'pod_data_type': { type: 'string', value: loc1SourceData.pod_data_type },
        };

        const { jsonPod: loc1JsonPod, merkleTreeResult: loc1MerkleResult } = await createAndSignPod(
            initialLoc1Entries,
            locationAttestationSolidityTypeMap,
            privateKey
        );
        location1MerkleRoot = loc1MerkleResult.root;
        console.log(`  Location POD 1 Merkle Root: ${location1MerkleRoot}`);

        const loc1OutputPath = path.join(outputDir, 'object_1_location_attestation_signed_pod.json');
        const loc1MerkleTreeOutputPath = path.join(merkleDataDir, 'object_1_location_merkle_tree.json');
        await writeJsonFile(loc1OutputPath, loc1JsonPod);
        console.log(`  Saved Location POD 1 to: ${loc1OutputPath}`);
        await fs.writeFile(loc1MerkleTreeOutputPath, JSON.stringify(loc1MerkleResult.tree.dump(), null, 2));
        console.log(`  Saved Location POD 1 Merkle tree dump to: ${loc1MerkleTreeOutputPath}`);

    } catch (error: any) {
        console.error('Error generating Location POD 1:', error.message, error.stack);
        process.exit(1);
    }

    // --- Generate Location POD 2 ---
    try {
        console.log('\nGenerating Location POD 2...');
        loc2SourceData = {
            objectId: objectId2DecimalString,
            solarSystemId: 30010690,
            location: { x: 12, y: 20, z: 30 }, // Slightly different location
            timestamp: location2Timestamp,
            pod_data_type: POD_DATA_TYPE_LOCATION_ATTESTATION,
        };

        const initialLoc2Entries: Omit<PODEntries, 'keccak256_merkle_root'> = {
            'objectId': { type: 'cryptographic', value: BigInt(loc2SourceData.objectId) },
            'solarSystemId': { type: 'int', value: BigInt(loc2SourceData.solarSystemId) },
            ...((): Record<string, PODValue> => {
                const entries: Record<string, PODValue> = {};
                const x_limbs = bigIntToLimbs(BigInt(loc2SourceData.location.x));
                entries['location_x_low'] = { type: 'int', value: x_limbs.low };
                entries['location_x_high'] = { type: 'int', value: x_limbs.high };
                const y_limbs = bigIntToLimbs(BigInt(loc2SourceData.location.y));
                entries['location_y_low'] = { type: 'int', value: y_limbs.low };
                entries['location_y_high'] = { type: 'int', value: y_limbs.high };
                const z_limbs = bigIntToLimbs(BigInt(loc2SourceData.location.z));
                entries['location_z_low'] = { type: 'int', value: z_limbs.low };
                entries['location_z_high'] = { type: 'int', value: z_limbs.high };
                return entries;
            })(),
            'timestamp': { type: 'int', value: loc2SourceData.timestamp },
            'pod_data_type': { type: 'string', value: loc2SourceData.pod_data_type },
        };

        const { jsonPod: loc2JsonPod, merkleTreeResult: loc2MerkleResult } = await createAndSignPod(
            initialLoc2Entries,
            locationAttestationSolidityTypeMap,
            privateKey
        );
        location2MerkleRoot = loc2MerkleResult.root;
        console.log(`  Location POD 2 Merkle Root: ${location2MerkleRoot}`);

        const loc2OutputPath = path.join(outputDir, 'object_2_location_attestation_signed_pod.json');
        const loc2MerkleTreeOutputPath = path.join(merkleDataDir, 'object_2_location_merkle_tree.json');
        await writeJsonFile(loc2OutputPath, loc2JsonPod);
        console.log(`  Saved Location POD 2 to: ${loc2OutputPath}`);
        await fs.writeFile(loc2MerkleTreeOutputPath, JSON.stringify(loc2MerkleResult.tree.dump(), null, 2));
        console.log(`  Saved Location POD 2 Merkle tree dump to: ${loc2MerkleTreeOutputPath}`);

    } catch (error: any) {
        console.error('Error generating Location POD 2:', error.message, error.stack);
        process.exit(1);
    }

    // Ensure loc1SourceData and loc2SourceData are assigned before this point
    // Adding a check, though the catch blocks above should prevent reaching here if they are not.
    if (!loc1SourceData || !loc2SourceData) {
        console.error("Critical error: Location source data was not initialized before distance calculation.");
        process.exit(1);
    }

    // --- Generate Distance Attestation POD ---
    try {
        console.log('\nGenerating Distance Attestation POD...');
        // Calculate distance based on the original source data for locations before any potential modifications
        // This requires access to loc1SourceData and loc2SourceData, which are in scope.
        // Assuming loc1SourceData and loc2SourceData are defined from above for this calculation.
        const dx = BigInt(loc1SourceData.location.x) - BigInt(loc2SourceData.location.x);
        const dy = BigInt(loc1SourceData.location.y) - BigInt(loc2SourceData.location.y);
        const dz = BigInt(loc1SourceData.location.z) - BigInt(loc2SourceData.location.z);
        const distanceSquared = dx * dx + dy * dy + dz * dz;

        const distSourceData: Omit<DistanceAttestationData, 'keccak256_merkle_root'> = {
            objectId1: objectId1DecimalString,
            objectId2: objectId2DecimalString,
            object1Location: location1MerkleRoot!, // Non-null assertion, as it should be set if POD1 gen succeeded
            object2Location: location2MerkleRoot!, // Non-null assertion, as it should be set if POD2 gen succeeded
            distanceSquaredMeters: distanceSquared,
            timestamp: distanceTimestamp,
            timeThreshold: BigInt(TIMESTAMP_MAX_DIFFERENCE_MS),
            pod_data_type: POD_DATA_TYPE_DISTANCE_ATTESTATION,
        };

        const initialDistEntries: Omit<PODEntries, 'keccak256_merkle_root'> = {
            'objectId1': { type: 'cryptographic', value: BigInt(distSourceData.objectId1) },
            'objectId2': { type: 'cryptographic', value: BigInt(distSourceData.objectId2) },
            'object1Location': { type: 'string', value: distSourceData.object1Location }, // Stored as string, solidity type is bytes32
            'object2Location': { type: 'string', value: distSourceData.object2Location }, // Stored as string, solidity type is bytes32
            'distanceSquaredMeters': { type: 'int', value: distSourceData.distanceSquaredMeters },
            'timestamp': { type: 'int', value: distSourceData.timestamp },
            'timeThreshold': { type: 'int', value: distSourceData.timeThreshold },
            'pod_data_type': { type: 'string', value: distSourceData.pod_data_type },
        };

        const { jsonPod: distJsonPod, merkleTreeResult: distMerkleResult } = await createAndSignPod(
            initialDistEntries,
            distanceAttestationSolidityTypeMap,
            privateKey
        );
        console.log(`  Distance POD Merkle Root: ${distMerkleResult.root}`);

        const distOutputPath = path.join(outputDir, 'distance_attestation_signed_pod.json');
        const distMerkleTreeOutputPath = path.join(merkleDataDir, 'distance_attestation_merkle_tree.json');
        await writeJsonFile(distOutputPath, distJsonPod);
        console.log(`  Saved Distance POD to: ${distOutputPath}`);
        await fs.writeFile(distMerkleTreeOutputPath, JSON.stringify(distMerkleResult.tree.dump(), null, 2));
        console.log(`  Saved Distance Attestation POD Merkle tree dump to: ${distMerkleTreeOutputPath}`);

        // Timestamp check (using original timestamps from source data for clarity)
        const loc1DistDiff = Math.abs(Number(location1Timestamp - distanceTimestamp));
        const loc2DistDiff = Math.abs(Number(location2Timestamp - distanceTimestamp));

        if (loc1DistDiff > TIMESTAMP_MAX_DIFFERENCE_MS || loc2DistDiff > TIMESTAMP_MAX_DIFFERENCE_MS) {
            console.error('Timestamp check FAILED: Location timestamps are too far from distance attestation timestamp.');
            // Decide if this should be a process.exit(1) or just a warning
        } else {
            console.log(`\nTimestamp check passed. Loc1-Dist diff: ${loc1DistDiff}ms, Loc2-Dist diff: ${loc2DistDiff}ms`);
        }

    } catch (error: any) {
        console.error('Error generating Distance POD:', error.message, error.stack);
        process.exit(1);
    }
    
    console.log('\n--- All POD Generation Finished ---');
}

generatePods().catch((error) => {
    console.error('Unhandled error during POD generation script:', error.message, error.stack);
    process.exit(1);
}); 