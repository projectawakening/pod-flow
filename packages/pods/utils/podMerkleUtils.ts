import { PODEntries, PODValue } from "@pcd/pod";
import { encodeAbiParameters, keccak256, Hex, toHex } from 'viem';
import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";

// The type of the 'value' property within a PODValue object.
// This is the actual data (string, bigint, boolean, etc.) we will ABI encode.
// Based on podTypes.d.ts, PODValue['value'] can be string | bigint | boolean | Uint8Array | Date | null.

export interface PodMerkleTreeResult {
    root: string;
    tree: SimpleMerkleTree;
    leafHashes: string[];
}

// Helper Functions

/**
 * Checks if a Solidity type string represents an array.
 * e.g., "uint256[]", "string[3]"
 */
function isSolidityArrayType(solidityType: string): boolean {
    return solidityType.endsWith(']') || solidityType.endsWith('[]');
}

/**
 * Extracts the element type from a Solidity array type string.
 * e.g., "uint256[]" -> "uint256", "string[3]" -> "string"
 */
function getSolidityArrayElementType(solidityType: string): string {
    if (!isSolidityArrayType(solidityType)) {
        throw new Error(`Not an array type: ${solidityType}`);
    }
    const openBracketIndex = solidityType.lastIndexOf('[');
    return solidityType.substring(0, openBracketIndex);
}

/**
 * Extracts the fixed length from a Solidity array type string, or null if dynamic.
 * e.g., "uint256[]" -> null, "string[3]" -> 3
 */
function getSolidityArrayFixedLength(solidityType: string): number | null {
    if (!solidityType.endsWith(']')) {
        return null; // Dynamic array like uint256[]
    }
    const openBracketIndex = solidityType.lastIndexOf('[');
    const closeBracketIndex = solidityType.lastIndexOf(']');
    const lengthStr = solidityType.substring(openBracketIndex + 1, closeBracketIndex);
    if (lengthStr === '') {
        return null; // Dynamic array like uint256[ ] (unlikely but handle)
    }
    const length = parseInt(lengthStr, 10);
    if (isNaN(length) || length <= 0) {
        throw new Error(`Invalid fixed array length in type: ${solidityType}`);
    }
    return length;
}

/**
 * Converts a single JSON-parsed element to its expected JavaScript type for ABI encoding
 * based on the Solidity element type.
 * For now, supports basic types: uint/int, string, bool, address, bytesN.
 */
function convertJsonElementToSolidityElement(
    jsonElement: any,
    solidityElementType: string,
    elementNameForError: string // e.g., "entryName[index]"
): any {
    if (solidityElementType.startsWith('uint') || solidityElementType.startsWith('int')) {
        if (typeof jsonElement !== 'number' && typeof jsonElement !== 'string' && typeof jsonElement !== 'bigint') {
            throw new Error(`Element ${elementNameForError} (Solidity type '${solidityElementType}') expects a number, string, or bigint from JSON, got ${typeof jsonElement}. Value: ${String(jsonElement)}`);
        }
        try {
            return BigInt(jsonElement);
        } catch (e) {
            throw new Error(`Element ${elementNameForError} (Solidity type '${solidityElementType}') could not be converted to BigInt. Value: ${String(jsonElement)}`);
        }
    } else if (solidityElementType === 'string') {
        if (typeof jsonElement !== 'string') {
            throw new Error(`Element ${elementNameForError} (Solidity type 'string') expects a string from JSON, got ${typeof jsonElement}. Value: ${String(jsonElement)}`);
        }
        return jsonElement;
    } else if (solidityElementType === 'bool') {
        if (typeof jsonElement !== 'boolean') {
            throw new Error(`Element ${elementNameForError} (Solidity type 'bool') expects a boolean from JSON, got ${typeof jsonElement}. Value: ${String(jsonElement)}`);
        }
        return jsonElement;
    } else if (solidityElementType === 'address') {
        if (typeof jsonElement !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(jsonElement)) {
            throw new Error(`Element ${elementNameForError} (Solidity type 'address') expects a 0x-prefixed 40-character hex string from JSON. Value: ${String(jsonElement)}`);
        }
        return jsonElement;
    } else if (solidityElementType === 'bytes32') {
        if (typeof jsonElement !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(jsonElement)) {
            throw new Error(`Element ${elementNameForError} (Solidity type 'bytes32') expects a 0x-prefixed 64-character hex string from JSON. Value: ${String(jsonElement)}`);
        }
        return jsonElement;
    } else if (solidityElementType.startsWith('bytes')) { // bytes1..bytes31 (dynamic 'bytes' should be caught by exact 'bytes' check later)
        const sizeMatch = solidityElementType.match(/^bytes(\d+)$/);
        if (sizeMatch) {
            const size = parseInt(sizeMatch[1], 10);
            if (size > 0 && size < 32) { // bytes32 is handled above, dynamic 'bytes' is not yet specifically handled here but by main validation
                if (typeof jsonElement !== 'string' || !new RegExp(`^0x[a-fA-F0-9]{${size * 2}}$`).test(jsonElement)) {
                    throw new Error(`Element ${elementNameForError} (Solidity type '${solidityElementType}') expects a 0x-prefixed ${size * 2}-character hex string from JSON. Value: ${String(jsonElement)}`);
                }
                return jsonElement;
            }
        }
        // If it's dynamic 'bytes', this specific conversion is not needed,
        // as the main validation block will handle 0x-prefixed strings for 'bytes'.
        // This function is for elements *within a JSON array*.
        // If it's an invalid bytesN like bytes0 or bytes33, let main validation catch it.
    }
    // For dynamic 'bytes' as an element type or other unhandled basic types, return as is and let outer validation handle.
    // This function focuses on types typically found in JSON arrays.
    if (solidityElementType === 'bytes' && typeof jsonElement === 'string' && /^0x[a-fA-F0-9]*$/.test(jsonElement) ) {
        return jsonElement;
    }

    throw new Error(`Unsupported Solidity element type '${solidityElementType}' for JSON array conversion in ${elementNameForError}. Value: ${String(jsonElement)}`);
}


/**
 * Generates a SimpleMerkleTree for a given set of PODEntries using viem.
 * The leaves of the tree are hashes of the entry name combined with its ABI-encoded typed value.
 * The 'keccak256_merkle_root' entry itself is excluded from the leaf calculation.
 *
 * @param podEntries The PODEntries to build the Merkle tree from.
 * @param entrySolidityTypeMap A map from entryName to its Solidity type (e.g., "uint256", "string", "uint256[]")
 *                             for correct ABI encoding of the value.
 * @returns An object containing the Merkle root, the tree instance, and the array of leaf hashes.
 */
export function generatePodMerkleTree(
    podEntries: PODEntries,
    entrySolidityTypeMap: Record<string, string>
): PodMerkleTreeResult {
    const leafHashes: string[] = [];

    const sortedEntryNames = Object.keys(podEntries).sort();

    for (const entryName of sortedEntryNames) {
        if (entryName === 'keccak256_merkle_root') {
            continue;
        }

        const entryData: PODValue = podEntries[entryName];
        const solidityType = entrySolidityTypeMap[entryName];

        if (!solidityType) {
            throw new Error(`Missing Solidity type definition for entry: ${entryName} in entrySolidityTypeMap.`);
        }

        let valueForAbiEncoding: any;

        if (isSolidityArrayType(solidityType)) {
            if (entryData.type !== 'string') {
                throw new Error(`Entry '${entryName}' is mapped to Solidity array type '${solidityType}', but its POD type is '${entryData.type}'. Expected POD type 'string' for JSON array representation.`);
            }
            try {
                const parsedJson = JSON.parse(entryData.value as string);
                if (!Array.isArray(parsedJson)) {
                    throw new Error(`Entry '${entryName}' (solidityType: ${solidityType}) expected a JSON array from PODStringValue, but got type ${typeof parsedJson}. Value: "${entryData.value}"`);
                }

                const elementType = getSolidityArrayElementType(solidityType);
                const fixedLength = getSolidityArrayFixedLength(solidityType);

                if (fixedLength !== null && parsedJson.length !== fixedLength) {
                    throw new Error(`Entry '${entryName}' (solidityType: ${solidityType}) expected array of fixed length ${fixedLength}, but JSON array has length ${parsedJson.length}. Value: "${entryData.value}"`);
                }
                
                valueForAbiEncoding = parsedJson.map((jsonElement, index) => {
                    return convertJsonElementToSolidityElement(
                        jsonElement,
                        elementType,
                        `${entryName}[${index}]`
                    );
                });

            } catch (e: any) {
                throw new Error(`Error processing JSON array for entry '${entryName}' (solidityType: ${solidityType}): ${e.message}. Original string value: "${entryData.value}"`);
            }
        } else if (entryData.type === 'date') {
            if (!(entryData.value instanceof Date)) {
                throw new Error(`Entry '${entryName}' with POD type 'date' expects a Date object, but received type ${typeof entryData.value}.`);
            }
            if (!solidityType.startsWith('int') && !solidityType.startsWith('uint')) {
                throw new Error(`Entry '${entryName}' with POD type 'date' should be mapped to an int/uint Solidity type in entrySolidityTypeMap, not '${solidityType}'.`);
            }
            valueForAbiEncoding = BigInt(entryData.value.getTime());
        } else if (entryData.type === 'null') {
            if (solidityType === 'bool') {
                valueForAbiEncoding = false;
            } else if (solidityType.startsWith('uint') || solidityType.startsWith('int')) {
                valueForAbiEncoding = 0n;
            } else if (solidityType === 'string') {
                valueForAbiEncoding = "";
            } else if (solidityType.startsWith('bytes')) { // bytes, bytesN
                valueForAbiEncoding = "0x";
            } else if (solidityType === 'address') {
                valueForAbiEncoding = "0x0000000000000000000000000000000000000000";
            } else {
                throw new Error(`Cannot map POD type 'null' for entry '${entryName}' to Solidity type '${solidityType}' with a default value. Please handle or choose a different Solidity type.`);
            }
        } else if (entryData.type === 'bytes') {
            if (!(entryData.value instanceof Uint8Array)) {
                throw new Error(
                    `Internal inconsistency: Entry '${entryName}' has POD type 'bytes' but its value is not a Uint8Array. Received type: ${typeof entryData.value}.`
                );
            }
            if (solidityType.startsWith('bytes')) { // bytes, bytesN
                valueForAbiEncoding = toHex(entryData.value);
            } else {
                throw new Error(
                    `Entry '${entryName}' of POD type 'bytes' (value is Uint8Array) cannot be mapped to non-bytes Solidity type '${solidityType}'.`
                );
            }
        } else {
             // For other POD types (string, int, boolean, cryptographic, eddsa_pubkey)
             // when solidityType is NOT an array.
            valueForAbiEncoding = entryData.value;
        }
        
        // Now validate valueForAbiEncoding against the target solidityType
        if (isSolidityArrayType(solidityType)) {
            if (!Array.isArray(valueForAbiEncoding)) {
                 throw new Error(`Entry '${entryName}' (mapped to Solidity array type '${solidityType}') expects an array value after processing. Got: ${typeof valueForAbiEncoding}`);
            }
            const elementType = getSolidityArrayElementType(solidityType);
            for (let i = 0; i < valueForAbiEncoding.length; i++) {
                const element = valueForAbiEncoding[i];
                const elementNameForError = `${entryName}[${i}]`;
                // This re-validates elements after they've been through convertJsonElementToSolidityElement.
                // It ensures the final types are correct before ABI encoding.
                if (elementType.startsWith('uint') || elementType.startsWith('int')) {
                    if (typeof element !== 'bigint') {
                        throw new Error(`Element ${elementNameForError} (Solidity type '${elementType}') expects a bigint value. Val: ${String(element)}, OrigPODType: '${entryData.type}'.`);
                    }
                } else if (elementType === 'string') {
                    if (typeof element !== 'string') {
                         throw new Error(`Element ${elementNameForError} (Solidity type '${elementType}') expects a string value. Val: ${String(element)}, OrigPODType: '${entryData.type}'.`);
                    }
                } else if (elementType === 'bool') {
                    if (typeof element !== 'boolean') {
                        throw new Error(`Element ${elementNameForError} (Solidity type '${elementType}') expects a boolean value. Val: ${String(element)}, OrigPODType: '${entryData.type}'.`);
                    }
                } else if (elementType === 'address') {
                    if (typeof element !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(element)) {
                        throw new Error(`Element ${elementNameForError} (Solidity type 'address') expects 0x-hex40. Val: ${String(element)}, OrigPODType: '${entryData.type}'.`);
                    }
                } else if (elementType === 'bytes32') {
                     if (typeof element !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(element)) {
                        throw new Error(`Element ${elementNameForError} (Solidity type 'bytes32') expects 0x-hex64. Val: ${String(element)}, OrigPODType: '${entryData.type}'.`);
                    }
                } else if (elementType.startsWith('bytes')) { // bytes1..bytes31, or dynamic 'bytes'
                    const sizeMatch = elementType.match(/^bytes(\d+)$/);
                    if (sizeMatch) { // bytes<N> (N from 1 to 31)
                        const size = parseInt(sizeMatch[1], 10);
                         if (isNaN(size) || size < 1 || size >= 32) { // Note: >=32 because bytes32 handled above
                             throw new Error(`Invalid Solidity element type '${elementType}' for entry '${elementNameForError}'. bytesN N must be 1-31.`);
                         }
                         if (typeof element !== 'string' || !new RegExp(`^0x[a-fA-F0-9]{${size * 2}}$`).test(element)) {
                            throw new Error(`Element ${elementNameForError} (Solidity type '${elementType}') expects 0x-hex${size*2}. Val: ${String(element)}, OrigPODType: '${entryData.type}'.`);
                         }
                    } else if (elementType === 'bytes') { // Dynamic bytes element
                        if (typeof element !== 'string' || !/^0x[a-fA-F0-9]*$/.test(element)) {
                             throw new Error(`Element ${elementNameForError} (Solidity type 'bytes') expects 0x-hex. Val: ${String(element)}, OrigPODType: '${entryData.type}'.`);
                        }
                    } else {
                        throw new Error(`Unhandled Solidity element type '${elementType}' in validation for ${elementNameForError}.`);
                    }
                } else {
                     throw new Error(`Unhandled Solidity element type '${elementType}' in validation for ${elementNameForError}.`);
                }
            }
        } else if (solidityType.startsWith('uint') || solidityType.startsWith('int')) {
            if (typeof valueForAbiEncoding !== 'bigint') {
                throw new Error(`Entry '${entryName}' (mapped to Solidity type '${solidityType}') expects a bigint value. Val: ${String(valueForAbiEncoding)}, OrigPODType: '${entryData.type}'.`);
            }
        } else if (solidityType === 'string') {
            if (typeof valueForAbiEncoding !== 'string') {
                throw new Error(`Entry '${entryName}' (mapped to Solidity type '${solidityType}') expects a string value. Val: ${String(valueForAbiEncoding)}, OrigPODType: '${entryData.type}'.`);
            }
        } else if (solidityType === 'bool') {
            if (typeof valueForAbiEncoding !== 'boolean') {
                throw new Error(`Entry '${entryName}' (mapped to Solidity type '${solidityType}') expects a boolean value. Val: ${String(valueForAbiEncoding)}, OrigPODType: '${entryData.type}'.`);
            }
        } else if (solidityType === 'address') {
            if (typeof valueForAbiEncoding !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(valueForAbiEncoding)) {
                 throw new Error(`Entry '${entryName}' (mapped to Solidity type 'address') expects 0x-hex40. Val: ${String(valueForAbiEncoding)}, OrigPODType: '${entryData.type}'.`);
            }
        } else if (solidityType === 'bytes32') {
            if (typeof valueForAbiEncoding !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(valueForAbiEncoding)) {
                 throw new Error(`Entry '${entryName}' (mapped to Solidity type 'bytes32') expects 0x-hex64. Val: ${String(valueForAbiEncoding)}, OrigPODType: '${entryData.type}'.`);
            }
        } else if (solidityType === 'bytes') { // Dynamic bytes
            if (typeof valueForAbiEncoding !== 'string' || !/^0x[a-fA-F0-9]*$/.test(valueForAbiEncoding)) {
                throw new Error(`Entry '${entryName}' (mapped to Solidity type 'bytes') expects 0x-hex. Val: ${String(valueForAbiEncoding)}, OrigPODType: '${entryData.type}'.`);
            }
        } else if (solidityType.startsWith('bytes')) { // Fixed-size bytes<N> (N from 1 to 31)
             const size = parseInt(solidityType.substring(5), 10);
             if (isNaN(size) || size < 1 || size > 32) { 
                 throw new Error(`Invalid Solidity type '${solidityType}' for entry '${entryName}'. bytesN N must be 1-32.`);
             }
             if (size === 32 ) { // Should have been caught by 'bytes32' exact match
                throw new Error(`Logic error or malformed Solidity type: '${solidityType}' for entry '${entryName}'. Use exact 'bytes32' for 32-byte arrays.`);
             }
             if (typeof valueForAbiEncoding !== 'string') {
                throw new Error(`Entry '${entryName}' (mapped to Solidity type '${solidityType}') expects a string value for hex representation. Val: ${String(valueForAbiEncoding)}, OrigPODType: '${entryData.type}'.`);
             }
             if (!new RegExp(`^0x[a-fA-F0-9]{${size * 2}}$`).test(valueForAbiEncoding)) {
                 throw new Error(`Entry '${entryName}' (mapped to Solidity type '${solidityType}') expects 0x-hex${size*2}. Val: ${String(valueForAbiEncoding)}, OrigPODType: '${entryData.type}'.`);
             }
        }
        // Note: If solidityType is not matched by any of the above, encodeAbiParameters will likely throw.
        // Consider adding a final 'else' to catch unhandled solidityTypes explicitly if desired.

        let encodedValueBytes: Hex;
        try {
            encodedValueBytes = encodeAbiParameters([{ type: solidityType }], [valueForAbiEncoding]);
        } catch (e: any) {
            throw new Error(`Error ABI-encoding entry '${entryName}' (Solidity type ${solidityType}, JS value ${String(valueForAbiEncoding)} / ${JSON.stringify(valueForAbiEncoding)}): ${e.message}`);
        }
        
        let leafHash: Hex;
        try {
            leafHash = keccak256(encodeAbiParameters([{ type: "string" }, { type: "bytes" }], [entryName, encodedValueBytes]));
        } catch (e: any) {
            throw new Error(`Error creating leaf hash for entry '${entryName}': ${e.message}`);
        }
        leafHashes.push(leafHash);
    }

    if (leafHashes.length === 0) {
        const dataEntryKeys = Object.keys(podEntries).filter(k => k !== 'keccak256_merkle_root');
        if (dataEntryKeys.length > 0) {
            // This case should ideally not be hit if there are entries but they all failed processing before leaf hash generation.
            // However, if all entries were skipped (e.g. all were 'keccak256_merkle_root', which is unlikely),
            // or if some new logic path skips all valid data entries.
             throw new Error("Cannot generate Merkle tree: No leaf hashes were generated, but data entries exist.");
        } else {
            // No data entries apart from potentially 'keccak256_merkle_root'.
            // This is a valid scenario for an "empty" POD (only a merkle root placeholder).
            // However, SimpleMerkleTree.of([]) will throw. We need a convention for an empty tree root.
            // For now, let's throw, as a POD should typically have some data or this utility might not be the right place.
            // Or, decide on a specific "empty tree root" value if that's a supported concept.
            // The original check was: if (Object.keys(podEntries).filter(k => k !== 'keccak256_merkle_root').length === 0)
            throw new Error("Cannot generate Merkle tree: No data entries found in podEntries (excluding keccak256_merkle_root). An empty tree is not supported by default.");
        }
    }
    
    const tree = SimpleMerkleTree.of(leafHashes);

    return {
        root: tree.root,
        tree,
        leafHashes
    };
} 