import { JSONPODEntries, JSONPODValue, JSONPOD, POD } from '@pcd/pod';
import { writeJsonFile } from '../../../pods/utils/fsUtils';
import path from 'path';
import fs from 'fs/promises';

// Define the structure we expect from the input file - standard JSONPOD,
// but specify the minimum fields *this script* requires and the expected type of keccak entry.
interface StandardSignedPodFile {
    entries: JSONPODEntries & { // Base entries structure
        keccak256_merkle_root: string;
    };
    signerPublicKey: string;
}

// Helper function to parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options: { [key: string]: string } = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '');
        options[key] = args[i + 1];
    }
    if (!options['signed-pod-input-path'] || !options['output-path']) {
        console.error("Usage: ts-node coreInputParams.ts --signed-pod-input-path <path-to-signed-pod.json> --output-path <path>");
        console.error("Example: ts-node packages/examples/core/scripts/coreInputParams.ts --signed-pod-input-path packages/examples/location-bounding/location-attestation/pod-data/location_attestation_signed_pod.json --output-path packages/examples/location-bounding/location-attestation/proof-inputs/core_location_proof_params.json");
        process.exit(1);
    }
    return options;
}

async function generateCoreProofParams() {
    const options = parseArgs();
    const signedPodInputPath = path.resolve(options['signed-pod-input-path']);
    const outputPath = path.resolve(options['output-path']);

    console.log(`--- Generating Core Proof Parameters from Standard Signed POD file: ${signedPodInputPath} ---`);

    // 1. Load the standard JSONPOD from the input file
    let loadedStandardJsonPod: StandardSignedPodFile;
    try {
        await fs.access(signedPodInputPath, fs.constants.F_OK);
        const signedPodFileContent = await fs.readFile(signedPodInputPath, 'utf-8');
        loadedStandardJsonPod = JSON.parse(signedPodFileContent) as StandardSignedPodFile;
        // Basic structural validation (checking fields defined in the updated interface)
        if (!loadedStandardJsonPod || 
            typeof loadedStandardJsonPod.entries !== 'object' || 
            typeof loadedStandardJsonPod.entries.keccak256_merkle_root !== 'string' || // Check based on interface
            typeof loadedStandardJsonPod.signerPublicKey !== 'string' ||
            typeof (loadedStandardJsonPod as any).signature !== 'string' // Also check signature existence for POD.fromJSON
           ) {
            throw new Error("Loaded file content does not match expected standard JSONPOD structure needed (entries including string keccak256_merkle_root, signerPublicKey, signature).")
        }
    } catch (e: any) {
        console.error(`Error loading or parsing standard Signed POD input file at ${signedPodInputPath}: ${e.message}`);
        process.exit(1);
    }
    
    // 2. Reconstruct POD instance to derive contentID and perform validation
    let podInstance: POD;
    let contentId: string;
    try {
        // We pass the object cast to the interface, but POD.fromJSON expects the full standard structure.
        // The initial check ensures signature exists for this call.
        podInstance = POD.fromJSON(loadedStandardJsonPod as any as JSONPOD); // Cast to JSONPOD for the call
        contentId = podInstance.contentID.toString();
        console.log(`  Successfully reconstructed POD. Derived Content ID: ${contentId}`);
    } catch (e: any) {
        console.error(`Error reconstructing POD instance from loaded JSON: ${e.message}`);
        process.exit(1);
    }

    // --- Runtime Validations using the POD instance --- 

    // 1. Validate signerPublicKey (can use instance or loaded JSON)
    const signerPublicKey = podInstance.signerPublicKey;
    if (typeof signerPublicKey !== 'string' || !signerPublicKey) {
        // This check might be redundant given the initial load validation
        console.error("Error: Reconstructed POD instance lacks a valid 'signerPublicKey' string property.");
        process.exit(1);
    }
    
    // 2. Validate keccak256_merkle_root using the instance's value
    const merkleRootPodValue = podInstance.content.getValue('keccak256_merkle_root');
    let isValidMerkleRootEntry = false;
    if (merkleRootPodValue && 
        merkleRootPodValue.type === 'string' && 
        typeof merkleRootPodValue.value === 'string' && 
        merkleRootPodValue.value.length > 0) {
        isValidMerkleRootEntry = true;
    }
    if (!isValidMerkleRootEntry) {
        console.error("Error: Reconstructed POD instance entries must contain a 'keccak256_merkle_root' field of type 'string' with a non-empty value.");
        process.exit(1);
    }
    // --- End of Runtime Validations ---

    console.log(`Using Signed POD. Derived Content ID: ${contentId}, Signer PK: ${signerPublicKey}`);

    // Construct paramsData using the *original loaded standard JSONPOD*
    const paramsData = {
        pods: {
            [contentId]: loadedStandardJsonPod // Use the standard JSON loaded from file
        },
        podConfigMapping: {
            pod: contentId
        },
        membershipLists: {}
    };

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    try {
        await fs.mkdir(outputDir, { recursive: true });
    } catch (e: any) {
        console.error(`Error creating output directory ${outputDir}: ${e.message}`);
        process.exit(1);
    }
    
    await writeJsonFile(outputPath, paramsData);
    console.log(`Successfully wrote core proof parameters to ${outputPath}`);
    console.log('--- Core Proof Parameters Generation Finished ---');
}

generateCoreProofParams().catch(error => {
    console.error('Error during core proof parameter generation:', error);
    process.exit(1);
}); 