import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";
import * as fs from "fs";
import * as path from "path";
import { encodeAbiParameters, keccak256, Hex } from 'viem';
// import yargs from 'yargs';
// import { hideBin } from 'yargs/helpers';
import { Command } from 'commander';
import { SOLIDITY_TYPE_MAPS_BY_POD_TYPE } from "../../location-bounding/types/podSolidityTypeMaps";

// Define the structure of the POD entries in distance_attestation_signed_pod.json
interface PodAttestationEntryValue {
    cryptographic?: string;
}

interface PodAttestationEntries {
    distanceSquaredMeters: number;
    keccak256_merkle_root: string;
    object1Location: string;
    object2Location: string;
    objectId1: PodAttestationEntryValue;
    objectId2: PodAttestationEntryValue;
    pod_data_type: string;
    timeThreshold: number;
    timestamp: number;
    [key: string]: any; // Allow other generic entries
}

interface SignedPod {
    entries: PodAttestationEntries;
    signature: string;
    signerPublicKey: string;
}

// The DISTANCE_ATTESTATION_SOLIDITY_TYPES constant has been removed as it's now imported.

function getValueForAbiEncoding(entryName: string, rawValueFromPod: any, solidityType: string): any {
    let value: any;

    if (entryName === "objectId1" || entryName === "objectId2") {
        if (rawValueFromPod && typeof rawValueFromPod.cryptographic === 'string') {
            value = rawValueFromPod.cryptographic;
        } else {
            throw new Error(`Unexpected structure or missing cryptographic value for ${entryName}: ${JSON.stringify(rawValueFromPod)}`);
        }
    } else {
        value = rawValueFromPod;
    }

    // Convert to JS types suitable for viem's encodeAbiParameters
    if (solidityType.startsWith('uint') || solidityType.startsWith('int')) {
        try {
            return BigInt(value);
        } catch (e) {
            throw new Error(`Could not convert value for ${entryName} ('${value}') to BigInt for Solidity type ${solidityType}.`);
        }
    } else if (solidityType === 'string') {
        return String(value);
    } else if (solidityType === 'bool') {
        return Boolean(value);
    } else if (solidityType.startsWith('bytes') || solidityType === 'address') {
        if (typeof value !== 'string' || !value.startsWith('0x')) {
            throw new Error(`Value for ${entryName} ('${value}') with Solidity type ${solidityType} must be a 0x-prefixed hex string.`);
        }
        // Validate specific lengths for bytesN and address
        if (solidityType.startsWith('bytes') && solidityType !== 'bytes') { // bytesN
            const numBytes = parseInt(solidityType.substring(5), 10);
            if (isNaN(numBytes) || numBytes <= 0 || numBytes > 32) {
                throw new Error(`Invalid bytesN type: ${solidityType} for entry ${entryName}. N must be 1-32.`);
            }
            if (value.length !== 2 + numBytes * 2) {
                throw new Error(`Value for ${entryName} ('${value}') as ${solidityType} has incorrect hex length. Expected ${numBytes} bytes (0x + ${numBytes * 2} hex chars).`);
            }
        } else if (solidityType === 'address') {
            if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
                throw new Error(`Value for ${entryName} ('${value}') is not a valid address hex string.`);
            }
        }
        return value; // Return the validated 0x-prefixed hex string
    }

    throw new Error(`Unsupported Solidity type '${solidityType}' for value conversion for entry '${entryName}'.`);
}

function calculateLeafHash(entryName: string, rawValueFromPod: any, solidityType: string): Hex {
    const valueForEncoding = getValueForAbiEncoding(entryName, rawValueFromPod, solidityType);

    let encodedValueBytes: Hex;
    try {
        encodedValueBytes = encodeAbiParameters([{ type: solidityType }], [valueForEncoding]);
    } catch (e: any) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new Error(`Error ABI-encoding entry '${entryName}' (Solidity type: ${solidityType}, JS value for encoding: ${String(valueForEncoding)}): ${errorMessage}`);
    }

    try {
        // This leaf hashing formula must match how leaves were generated for the SimpleMerkleTree
        // keccak256(abi.encodePacked(entryName, encodedValueBytes_for_the_entry_value))
        // Or more precisely, from podMerkleUtils.ts:
        // keccak256(encodeAbiParameters([{ type: "string" }, { type: "bytes" }], [entryName, encodedValueBytes]))
        return keccak256(encodeAbiParameters(
            [{ type: "string" }, { type: "bytes" }],
            [entryName, encodedValueBytes]
        ));
    } catch (e: any) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new Error(`Error creating leaf hash for entry '${entryName}': ${errorMessage}`);
    }
}

async function main() {
    const program = new Command();

    program
        .name("generate-merkle-multiproof")
        .description("Generates a Merkle multiproof for specified POD entries.")
        .version("1.0.0")
        .requiredOption(
            '--merkleTreePath <path>',
            'Path to the Merkle tree JSON file (output of tree.dump())'
        )
        .requiredOption(
            '--signedPodPath <path>',
            'Path to the signed POD JSON file containing raw entries'
        )
        .requiredOption(
            '--fieldNames <names...>',
            'Array of field names from the POD to include in the multiproof'
        )
        .requiredOption(
            '--outputPath <path>',
            'Path to save the generated multiproof JSON object'
        )
        .addHelpText('after', `
Example call:
  $ ts-node <script_path> --merkleTreePath ./merkle_tree.json --signedPodPath ./signed_pod.json --fieldNames objectId1 timestamp --outputPath ./multiproof.json
`);

    program.parse(process.argv);
    const options = program.opts();

    const merkleTreeFilePath = path.resolve(options.merkleTreePath);
    const signedPodFilePath = path.resolve(options.signedPodPath);
    const outputFilePath = path.resolve(options.outputPath);
    const fieldNamesForProof = options.fieldNames as string[]; // Commander parses variadic options into an array

    if (!fs.existsSync(merkleTreeFilePath)) {
        throw new Error(`Merkle tree file not found: ${merkleTreeFilePath}`);
    }
    if (!fs.existsSync(signedPodFilePath)) {
        throw new Error(`Signed POD file not found: ${signedPodFilePath}`);
    }
    if (fieldNamesForProof.length === 0) {
        throw new Error("No field names provided for the multiproof.");
    }

    // 1. Load Merkle tree data (as dumped by SimpleMerkleTree.dump())
    console.log(`Loading Merkle tree from: ${merkleTreeFilePath}`);
    const treeDump = JSON.parse(fs.readFileSync(merkleTreeFilePath, "utf8"));
    const tree = SimpleMerkleTree.load(treeDump);
    console.log(`Merkle tree loaded. Root: ${tree.root}`);

    // 2. Load signed POD data
    console.log(`Loading signed POD from: ${signedPodFilePath}`);
    const signedPod: SignedPod = JSON.parse(fs.readFileSync(signedPodFilePath, "utf8"));
    const podEntries = signedPod.entries;

    // Determine the POD type and select the appropriate Solidity type map
    const podDataType = podEntries.pod_data_type;
    if (typeof podDataType !== 'string') {
        throw new Error("Signed POD JSON must contain a 'pod_data_type' string entry.");
    }

    const currentSolidityTypeMap = SOLIDITY_TYPE_MAPS_BY_POD_TYPE[podDataType];
    if (!currentSolidityTypeMap) {
        throw new Error(`No Solidity type map found for pod_data_type '${podDataType}'. Please define it in podSolidityTypeMaps.ts.`);
    }
    console.log(`Using Solidity type map for: ${podDataType}`);

    // 3. Calculate leaf hashes for the requested field names
    const leavesForMultiproof: Hex[] = [];
    console.log("\nCalculating leaf hashes for specified fields:");
    for (const fieldName of fieldNamesForProof) {
        if (fieldName === 'keccak256_merkle_root') {
            console.warn(`  Skipping 'keccak256_merkle_root' as it's part of POD metadata, not a data leaf hashed into the tree this way.`);
            continue;
        }
        if (!podEntries.hasOwnProperty(fieldName)) {
            throw new Error(`Field name '${fieldName}' not found in signed POD entries. Available fields: ${Object.keys(podEntries).join(', ')}`);
        }
        // Use the dynamically selected map
        if (!currentSolidityTypeMap.hasOwnProperty(fieldName)) {
            throw new Error(`Solidity type for field name '${fieldName}' is not defined in the type map for '${podDataType}'. Please add it to podSolidityTypeMaps.ts.`);
        }

        const rawValue = podEntries[fieldName];
        const solidityType = currentSolidityTypeMap[fieldName]; // Use the dynamically selected map
        
        try {
            const leafHash = calculateLeafHash(fieldName, rawValue, solidityType);
            leavesForMultiproof.push(leafHash);
            console.log(`  Successfully calculated leaf for '${fieldName}': ${leafHash}`);
        } catch (error: any) {
            console.error(`  Error calculating leaf hash for field '${fieldName}': ${error.message}`);
            throw error; // Re-throw to stop execution if a leaf can't be processed
        }
    }
    
    if (leavesForMultiproof.length === 0) {
        throw new Error("No valid field names resulted in leaves for multiproof generation. Check input field names.");
    }

    // 4. Generate multiproof
    // For SimpleMerkleTree, getMultiProof expects an array of the leaf *values* (which are already hashes in this case)
    console.log(`\nRequesting multiproof for ${leavesForMultiproof.length} leaves:`, leavesForMultiproof);
    const multiProof = tree.getMultiProof(leavesForMultiproof);

    // 5. Save the multiproof
    fs.writeFileSync(outputFilePath, JSON.stringify(multiProof, null, 2));
    console.log(`\nMultiproof successfully generated and saved to: ${outputFilePath}`);
    // console.log(`Generated multiproof object:`, JSON.stringify(multiProof, null, 2));
}

main().catch(error => {
    console.error("\nScript failed with an error:");
    if (error instanceof Error) {
        console.error(error.message);
        if (process.env.DEBUG) { // Optionally print stack trace if DEBUG is set
             console.error(error.stack);
        }
    } else {
        console.error(String(error));
    }
    process.exit(1);
}); 