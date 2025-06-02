import { PODEntries, PODValue } from '@pcd/pod'; // POD might not be needed directly
import { LocationAttestationData } from '../../types/locationBoundingTypes';
import { writeJsonFile, loadPrivateKey } from '../../../../pods/utils/fsUtils';
import { bigIntToLimbs } from '../../../../pods/utils/podBigInt';
import path from 'path';
import fs from 'fs/promises';
import { createAndSignPod } from '../../../../pods/utils/podGenerationUtils';
import { locationAttestationSolidityTypeMap } from '../../types/podSolidityTypeMaps';

const POD_DATA_TYPE_LOCATION_ATTESTATION = 'evefrontier.location_attestation';

// The locationAttestationDataToPODEntries function is simplified as initialPodEntries
// will be constructed directly in generateAndSaveLocationPod without the merkle root.

async function generateAndSaveLocationPod() {
    console.log('--- Generating Location Attestation Signed POD file using createAndSignPod utility... ---');

    const baseTimestamp = Date.now();
    const locationTimestamp = BigInt(baseTimestamp + 2000);

    // Use a decimal bigint string for objectId
    const mockObjectIdDecimalString = "112233445566778899001122334455667788990";

    // Initial data for the POD, keccak256_merkle_root will be added by createAndSignPod
    const locationAttestationSourceData: Omit<LocationAttestationData, 'keccak256_merkle_root'> = {
        objectId: mockObjectIdDecimalString, // Will be converted to BigInt for PODEntry
        solarSystemId: 30010690, 
        location: { x: 100, y: 200, z: 300 },
        timestamp: locationTimestamp,
        pod_data_type: POD_DATA_TYPE_LOCATION_ATTESTATION,
    };

    // Construct initialPodEntries for createAndSignPod
    const initialPodEntries: Omit<PODEntries, 'keccak256_merkle_root'> = {
        'objectId': { type: 'cryptographic', value: BigInt(locationAttestationSourceData.objectId) },
        'solarSystemId': { type: 'int', value: BigInt(locationAttestationSourceData.solarSystemId) },
        // Flatten location coordinates
        ...((): Omit<PODEntries, 'keccak256_merkle_root'> => {
            const entries: Record<string, PODValue> = {};
            const x_limbs = bigIntToLimbs(BigInt(locationAttestationSourceData.location.x));
            entries['location_x_low'] = { type: 'int', value: x_limbs.low };
            entries['location_x_high'] = { type: 'int', value: x_limbs.high };

            const y_limbs = bigIntToLimbs(BigInt(locationAttestationSourceData.location.y));
            entries['location_y_low'] = { type: 'int', value: y_limbs.low };
            entries['location_y_high'] = { type: 'int', value: y_limbs.high };

            const z_limbs = bigIntToLimbs(BigInt(locationAttestationSourceData.location.z));
            entries['location_z_low'] = { type: 'int', value: z_limbs.low };
            entries['location_z_high'] = { type: 'int', value: z_limbs.high };
            return entries;
        })(),
        'timestamp': { type: 'int', value: locationAttestationSourceData.timestamp }, // Already a BigInt
        'pod_data_type': { type: 'string', value: locationAttestationSourceData.pod_data_type },
    };

    const privateKeyString = loadPrivateKey();
    if (!privateKeyString) {
        console.error("Error: Could not load private key for signing. Ensure PK_PASSPHRASE and PRIVATE_KEY_FILE_PATH are set in .env or the key file is otherwise accessible.");
        process.exit(1);
    }

    try {
        console.log('Calling createAndSignPod for location attestation...');
        const { jsonPod, merkleTreeResult } = await createAndSignPod(
            initialPodEntries,
            locationAttestationSolidityTypeMap, // Imported, centralized map
            privateKeyString
        );
        console.log(`  Location POD signed. Merkle Root: ${merkleTreeResult.root}`);
        console.log(`  Content ID from signed POD: ${jsonPod.entries['keccak256_merkle_root']}`); // Accessing via JSON for verification

        const outputDir = path.resolve(__dirname, '../pod-data');
        const outputPath = path.join(outputDir, 'location_attestation_signed_pod.json');
        const merkleDataDir = path.resolve(__dirname, '../merkle-data');
        const merkleTreeOutputPath = path.join(merkleDataDir, 'location_attestation_merkle_tree.json');

        await fs.mkdir(outputDir, { recursive: true });
        await fs.mkdir(merkleDataDir, { recursive: true });

        await writeJsonFile(outputPath, jsonPod);
        console.log(`Successfully wrote signed location attestation POD to ${outputPath}`);

        await fs.writeFile(merkleTreeOutputPath, JSON.stringify(merkleTreeResult.tree.dump(), null, 2));
        console.log(`  Saved Merkle tree dump to: ${merkleTreeOutputPath}`);

    } catch (error: any) {
        console.error('Error during location POD generation process:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }

    console.log('--- Location Attestation Signed POD Generation Finished ---');
}

generateAndSaveLocationPod().catch((error) => {
    console.error('Unhandled error during POD entries generation script:', error);
    process.exit(1);
}); 