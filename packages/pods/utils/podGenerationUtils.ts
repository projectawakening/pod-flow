import { POD, PODEntries, PODValue, JSONPOD, PODStringValue } from "@pcd/pod";
import {
    generatePodMerkleTree,
    PodMerkleTreeResult,
} from "./podMerkleUtils";

export interface CreateAndSignPodResult {
    signedPod: POD;
    jsonPod: JSONPOD;
    merkleTreeResult: PodMerkleTreeResult;
}

/**
 * Creates a POD with a calculated Merkle root, signs it, and returns relevant objects.
 *
 * This function encapsulates several "rules" for POD generation:
 * 1. It calculates a Keccak256 Merkle root based on the provided entries and their Solidity types.
 * 2. It adds this Merkle root as an entry (named 'keccak256_merkle_root') to the POD.
 * 3. It validates that any PODStringValue intended as a Solidity array is a correctly formatted JSON string
 *    of supported types (this validation occurs within `generatePodMerkleTree`).
 *
 * @param initialPodEntries The initial data entries for the POD (should NOT include 'keccak256_merkle_root').
 * @param entrySolidityTypeMap A map from entryName to its Solidity type for ABI encoding.
 * @param signerPrivateKey The private key string for signing the POD.
 * @param merkleRootEntryName The name of the entry where the Merkle root will be stored (defaults to 'keccak256_merkle_root').
 * @returns An object containing the signed POD, its JSON representation, and the Merkle tree result.
 */
export async function createAndSignPod(
    initialPodEntries: Omit<PODEntries, 'keccak256_merkle_root'>,
    entrySolidityTypeMap: Record<string, string>,
    signerPrivateKey: string,
    merkleRootEntryName: string = "keccak256_merkle_root"
): Promise<CreateAndSignPodResult> {
    // 1. Generate Merkle tree and root from initial entries
    // This step also validates JSON stringified arrays based on entrySolidityTypeMap
    const merkleTreeResult = generatePodMerkleTree(
        initialPodEntries as PODEntries, // Cast needed as generatePodMerkleTree expects full PODEntries
        entrySolidityTypeMap
    );
    const { root } = merkleTreeResult;

    // 2. Create final PODEntries including the Merkle root
    const finalPodEntries: PODEntries = {
        ...initialPodEntries,
        [merkleRootEntryName]: { type: "string", value: root } as PODStringValue,
    };

    // 3. Sign the final PODEntries
    // Ensure that the solidity type for the merkle root entry is also in the map if generatePodMerkleTree were to be called on finalPodEntries directly (not needed here)
    // However, POD.sign doesn't use entrySolidityTypeMap.
    const signedPod = POD.sign(finalPodEntries, signerPrivateKey);

    // 4. Get JSON representation
    const jsonPod = signedPod.toJSON();

    return {
        signedPod,
        jsonPod,
        merkleTreeResult,
    };
} 