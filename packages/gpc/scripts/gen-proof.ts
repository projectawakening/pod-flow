import fs from 'fs/promises';
import path from 'path';
import {
    GPCProofConfig,
    GPCProofInputs,
    boundConfigToJSON,
    revealedClaimsToJSON,
    GPCIdentifier,
    ProtoPODGPCCircuitDesc,
    gpcPreProve,
    gpcPostProve
} from '@pcd/gpc';
import {
    ProtoPODGPCCircuitParams,
    PROTO_POD_GPC_FAMILY_NAME,
    ProtoPODGPC,
    paramMaxVirtualEntries
} from "@pcd/gpcircuits";
import { groth16 } from "snarkjs";
import { POD, podValueFromJSON, PODValue, JSONPODValue } from '@pcd/pod';
import { readJsonFile, writeJsonFile } from '../../pods/utils/fsUtils'; // Adjust path as needed
// Import local parameter sets for lookup
import { SupportedGPCCircuitParams, supportedParameterSets } from '../src/circuitParameterSets';

// Define the base directory for artifacts (needed by gpcVerify)
const ARTIFACTS_BASE_DIR = path.resolve(__dirname, '..', 'artifacts');
// <<< Define proof output directory >>>
const PROOFS_DIR = path.resolve(__dirname, '..', 'proofs');

// --- Helper Functions ---

function logStep(message: string) {
    console.log(`\n=== ${message} ===`);
}

// Helper to load a TS config file using require
function loadProofConfig(configPath: string): GPCProofConfig {
    // <<< Resolve path relative to CWD >>>
    const absolutePath = path.resolve(process.cwd(), configPath);
    console.log(`Attempting to load config from provided path: ${configPath} (resolved: ${absolutePath})`);
    try {
        const configModule = require(absolutePath);
        const exportKey = Object.keys(configModule)[0];
        const config = configModule[exportKey];
        if (!config || !config.pods) { // Basic validation
            throw new Error(`Could not find exported config with a 'pods' property.`);
        }
        console.log(`Successfully loaded config: ${exportKey}`);
        return config;
    } catch (error: any) {
        console.error(`Error loading proof config from ${configPath} (resolved: ${absolutePath}): ${error.message}`);
        throw error; // Re-throw
    }
}

// Helper to load the circuit requirements JSON
async function loadCircuitRequirements(configName: string): Promise<ProtoPODGPCCircuitParams> {
    const requirementsFilename = `${configName}_requirements.json`;
    const requirementsPath = path.resolve(__dirname, '..', 'proof-requirements', requirementsFilename);
    logStep(`Loading circuit requirements JSON from: ${requirementsPath}`);
    try {
        // Load as a generic object first to handle key differences
        const rawRequirements = await readJsonFile<any | null>(requirementsPath, null);
        if (rawRequirements === null) {
            throw new Error(`Could not read or parse JSON file: ${requirementsPath}`);
        }
        console.log("Loaded raw requirements JSON:", JSON.stringify(rawRequirements, null, 2));

        // Map raw keys (nObjects, etc.) to expected keys (maxObjects, etc.)
        const mappedRequirements: ProtoPODGPCCircuitParams = {
            maxObjects: rawRequirements.nObjects,
            maxEntries: rawRequirements.nEntries,
            merkleMaxDepth: rawRequirements.merkleMaxDepth,
            maxNumericValues: rawRequirements.nNumericValues,
            maxEntryInequalities: rawRequirements.nEntryInequalities,
            maxLists: rawRequirements.nLists,
            maxListElements: rawRequirements.maxListSize, // Note: key mismatch handled here
            // Handle tuples - assuming tupleArities means we need maxTuples and tupleArity
            // This might need adjustment based on how tupleArities is structured and used
            maxTuples: Object.keys(rawRequirements.tupleArities || {}).length, // Count keys for maxTuples
            tupleArity: Object.keys(rawRequirements.tupleArities || {}).length > 0
                ? Math.max(...Object.values(rawRequirements.tupleArities || {}).map(Number))
                : 0, // Max arity if tuples exist, else 0
            includeOwnerV3: rawRequirements.includeOwnerV3,
            includeOwnerV4: rawRequirements.includeOwnerV4
        };

        console.log("Mapped requirements (ProtoPODGPCCircuitParams):", JSON.stringify(mappedRequirements, null, 2));
        return mappedRequirements; // Return the object with correct keys
    } catch (e: any) {
        console.error(`Error loading/mapping requirements file: ${e.message}`);
        process.exit(1);
    }
}

// LOCAL REPLICATION of makeCircuitIdentifier from gpcUtil.js
function makeCircuitIdentifier(circuitDesc: ProtoPODGPCCircuitDesc): GPCIdentifier {
    // Type assertion needed as template literal type isn't directly assignable
    // Ensure circuitDesc.name contains *only* the parameter string here
    return `${circuitDesc.family}_${circuitDesc.name}` as GPCIdentifier;
}

// Helper function to find the full ProtoPODGPCCircuitDesc based on requirements
async function findCircuitDescription(requirementsPath: string): Promise<ProtoPODGPCCircuitDesc> {
    logStep("Loading requirements and finding circuit description...");
    let requirements: ProtoPODGPCCircuitParams;
    try {
        const reqsJson = JSON.parse(await fs.readFile(requirementsPath, 'utf-8'));
        // Assuming GPCRequirements and ProtoPODGPCCircuitParams are compatible enough
        requirements = reqsJson as ProtoPODGPCCircuitParams;
        console.log("Successfully loaded requirements:", requirements);
    } catch (error: any) {
        console.error(`Error loading requirements file ${requirementsPath}: ${error.message}`);
        console.error("Run generate-requirements script first.");
        throw error; // Re-throw to be caught by caller
    }

    // Use the library's static methods via the class
    const circuitName = ProtoPODGPC.circuitNameForParams(requirements);
    const circuitDesc = ProtoPODGPC.findCircuit(PROTO_POD_GPC_FAMILY_NAME, circuitName);

    if (!circuitDesc) {
        throw new Error(`Could not find a circuit description matching the requirements in the ProtoPODGPC family.`);
    }
    console.log("Found matching circuit description:", circuitDesc);
    return circuitDesc;
}

// Helper to stringify BigInts *within* a nested object/array structure
function stringifyBigIntsRecursive(obj: any): any {
    if (typeof obj === 'bigint') {
        return obj.toString();
    } else if (Array.isArray(obj)) {
        return obj.map(stringifyBigIntsRecursive);
    } else if (typeof obj === 'object' && obj !== null) {
        const newObj: { [key: string]: any } = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = stringifyBigIntsRecursive(obj[key]);
            }
        }
        return newObj;
    } else {
        return obj;
    }
}

// --- Main Proof Generation Function (Manual Flow) ---

async function generateProof(configPath: string, inputsPath: string, artifactCircuitName: string) {
    logStep("Starting GPC Proof Generation (Manual Flow)...");
    let circuitDesc: ProtoPODGPCCircuitDesc | undefined;

    try {
        // 1. Load Config and Inputs
        logStep("1. Loading Proof Config and Inputs...");
        const proofConfig = loadProofConfig(configPath);
        const proofInputs = await loadProofInputs(inputsPath);

        // 2. Find Circuit Description based on provided artifactCircuitName
        logStep(`2. Finding circuit description for artifact target: ${artifactCircuitName}`);
        const foundParams = supportedParameterSets.find(p => p.circuitId === artifactCircuitName);
        if (!foundParams) {
            // This *shouldn't* happen if the orchestrator script works correctly
            throw new Error(`Could not find parameters in local circuitParameterSets.ts for circuitId: ${artifactCircuitName}`);
        }
        circuitDesc = {
            family: PROTO_POD_GPC_FAMILY_NAME,
            name: artifactCircuitName,
            cost: 0, // Placeholder
            ...foundParams // Spread the found parameters
        };
        console.log("  Found circuit description:", circuitDesc);

        // Ensure circuitDesc is valid before proceeding
        if (!circuitDesc) {
             // This check is now redundant if foundParams check passed, but keep for safety
             throw new Error("Failed to determine circuit description.");
        }

        // Update proofConfig with the correct full identifier
        proofConfig.circuitIdentifier = `${PROTO_POD_GPC_FAMILY_NAME}_${circuitDesc.name}` as GPCIdentifier;

        // 3. Call gpcPreProve (using the circuitDesc matching the artifacts)
        logStep("3. Calling gpcPreProve...");
        const preProveResult = gpcPreProve(proofConfig, proofInputs, [circuitDesc]);
        const { circuitInputs, boundConfig } = preProveResult;

        // Sanity check (optional but good)
        if (preProveResult.circuitDesc.name !== circuitDesc.name) {
            console.warn("Circuit description mismatch between lookup and gpcPreProve result. Using preProve result.");
            circuitDesc = preProveResult.circuitDesc;
        }

        // 4. Define Artifact Paths (using artifactCircuitName)
        const currentCircuitIdentifier = `${PROTO_POD_GPC_FAMILY_NAME}_${artifactCircuitName}`;
        logStep(`4. Defining artifact paths using: ${currentCircuitIdentifier}`);
        const artifactsPath = ARTIFACTS_BASE_DIR;
        const wasmPath = path.join(artifactsPath, `${currentCircuitIdentifier}.wasm`);
        const pkeyPath = path.join(artifactsPath, `${currentCircuitIdentifier}-pkey.zkey`);

        // Check if artifacts exist
        try {
            await fs.access(wasmPath);
            await fs.access(pkeyPath);
            console.log("Required artifacts found.");
        } catch (error) {
            console.error("Error: Required circuit artifacts (.wasm, -pkey.zkey) not found.");
            console.error(`Looked for: ${wasmPath}, ${pkeyPath}`);
            console.error("Ensure you have run 'compile-circuit' for the matching requirements and it placed files correctly.");
            throw error; // Re-throw
        }

        // <<< Define Output Proof Paths >>>
        // Use circuitDesc.name in the output filename
        const proofFileNameBase = `${path.basename(configPath, '.ts')}_${circuitDesc.name}`; // e.g., locationProofConfig_3o-14e...
        const outputProofJsonPath = path.join(PROOFS_DIR, `${proofFileNameBase}_proof.json`);
        const outputPublicJsonPath = path.join(PROOFS_DIR, `${proofFileNameBase}_public.json`);
        const outputCombinedJsonPath = path.join(PROOFS_DIR, `${proofFileNameBase}_combined.json`); // Keeping combined for now

        // <<< Ensure output directory exists >>>
        await fs.mkdir(PROOFS_DIR, { recursive: true });

        // 6. Call snarkjs.groth16.fullProve
        logStep("6. Calling snarkjs.groth16.fullProve...");

        let snarkjsProof: any; // Use 'any' temporarily for snarkjs proof object
        let snarkjsPublicSignals: string[]; // Array of strings

        try {
            const { proof, publicSignals } = await groth16.fullProve(
                circuitInputs, // <<< Pass the original circuitInputs object with BigInts >>>
                wasmPath,
                pkeyPath
                // logger // Optional: pass a logger object if needed
            );
            snarkjsProof = proof; // Store the proof part
            snarkjsPublicSignals = publicSignals; // Store the public signals

            console.log("groth16.fullProve call completed successfully.");

            // <<< Save snarkjs proof.json and public.json >>>
            logStep("Saving snarkjs proof.json and public.json...");
            await writeJsonFile(outputProofJsonPath, snarkjsProof);
            console.log(`  Saved proof to: ${outputProofJsonPath}`);
            await writeJsonFile(outputPublicJsonPath, snarkjsPublicSignals);
            console.log(`  Saved public signals to: ${outputPublicJsonPath}`);

            // 7. Reconstruct Circuit Outputs for gpcPostProve
            logStep("7. Reconstructing circuit outputs from public signals...");
            const circuitOutputs = ProtoPODGPC.outputsFromPublicSignals(
                snarkjsPublicSignals.map(BigInt),
                circuitDesc.maxEntries,
                paramMaxVirtualEntries(circuitDesc),
                circuitDesc.includeOwnerV3,
                circuitDesc.includeOwnerV4
            );

            // 8. Call gpcPostProve
            logStep("8. Calling gpcPostProve...");
            const { revealedClaims } = gpcPostProve(
                snarkjsProof,
                boundConfig,
                circuitDesc,
                proofInputs,
                circuitOutputs
            );

            // 9. Assemble Final Combined Output
            logStep("9. Assembling final combined output JSON...");
            const finalOutput = {
                proof: snarkjsProof,
                boundConfig: boundConfigToJSON(boundConfig),
                revealedClaims: revealedClaimsToJSON(revealedClaims)
            };

            // Stringify BigInts for JSON compatibility in the combined file (optional)
            // const finalOutputStringified = stringifyBigIntsRecursive(finalOutput);

            // Write the combined file (still potentially useful for some contexts)
            await writeJsonFile(outputCombinedJsonPath, finalOutput);
            console.log(`Final combined proof data saved to: ${outputCombinedJsonPath}`);

            // <<< Add termination logic here >>>
            logStep("10. Terminating snarkjs workers...");
            if (typeof (groth16 as any)?.thread?.terminateAll === 'function') {
                await (groth16 as any).thread.terminateAll();
                console.log("   snarkjs workers terminated.");
            } else {
                console.warn("   snarkjs worker termination function not found.");
            }

        } catch (snarkError: any) {
            // <<< Enhanced Error Logging >>>
            console.error(`Error during snarkjs proof generation or GPC post-processing:`);
            console.error("--- Error Message ---");
            console.error(snarkError.message);
            console.error("--- Error Stack ---");
            console.error(snarkError.stack);
            console.error("--- Full Error Object ---");
            console.error(snarkError); // Log the whole object
            // Include memory usage hint
            if (snarkError.message && (snarkError.message.includes('heap out of memory') || snarkError.message.includes('allocation failed'))) {
                 console.error("Hint: This might be an Out-Of-Memory error. Consider increasing NODE_OPTIONS=--max-old-space-size=<memory_in_mb> further if possible, or the circuit might be too large.");
            }
            // <<< End Enhanced Logging >>>

            // <<< Also terminate on error >>>
            logStep("Terminating snarkjs workers after error...");
            if (typeof (groth16 as any)?.thread?.terminateAll === 'function') {
                await (groth16 as any).thread.terminateAll();
                console.log("   snarkjs workers terminated.");
            } else {
                console.warn("   snarkjs worker termination function not found.");
            }

            throw snarkError; // Re-throw
        }

    } catch (error: any) {
        console.error(`\n--- GPC Proof Generation Failed ---`);
        console.error(error);
        // <<< Terminate on outer error too >>>
        logStep("Terminating snarkjs workers after outer error...");
        if (typeof (groth16 as any)?.thread?.terminateAll === 'function') {
            await (groth16 as any).thread.terminateAll();
            console.log("   snarkjs workers terminated.");
        } else {
            console.warn("   snarkjs worker termination function not found.");
        }
        process.exit(1);
    }
}

// --- Script Execution ---
// Use simple argv processing, expect 3 arguments now
const args = process.argv.slice(2);
const configArg = args[0];
const gpcInputsArg = args[1];
const artifactCircuitNameArg = args[2]; // New argument

if (!configArg || !gpcInputsArg || !artifactCircuitNameArg) { // Check for all 3
    console.error("Usage: pnpm generate-proof <path/to/config.ts> <path/to/inputs.json> <artifactCircuitName>");
    process.exit(1);
}

generateProof(configArg, gpcInputsArg, artifactCircuitNameArg) // Pass the new arg
 .then(() => {
    console.log("--- Proof Generation Script Finished Successfully ---");
    process.exit(0); // Explicit success exit
  })
 .catch(error => {
    // Error already logged, termination handled in generateProof
    process.exit(1);
  });


async function loadProofInputs(proofInputsPath: string): Promise<GPCProofInputs> {
    const absolutePath = path.resolve(process.cwd(), proofInputsPath);
    console.log(`Attempting to load GPC inputs from provided path: ${proofInputsPath} (resolved: ${absolutePath})`);
    try {
        const { Identity } = await import('@semaphore-protocol/identity'); // Dynamic import
        const fileContent = await fs.readFile(absolutePath, 'utf-8');
        const parsedInputs = JSON.parse(fileContent);
        if (parsedInputs === null || typeof parsedInputs !== 'object') {
            throw new Error(`Could not read or parse JSON file.`);
        }

        const deserializedPods: Record<string, POD> = {};
        if (parsedInputs.pods && typeof parsedInputs.pods === 'object') {
            for (const key in parsedInputs.pods) {
                if (Object.prototype.hasOwnProperty.call(parsedInputs.pods, key)) {
                    try {
                        deserializedPods[key] = POD.fromJSON(parsedInputs.pods[key]);
                    } catch (podError: any) {
                         console.error(`Error deserializing POD '${key}': ${podError.message}`);
                         throw podError;
                    }
                }
            }
        } else {
            throw new Error("Parsed input data does not contain a valid 'pods' object.");
        }

        let deserializedMembershipLists: GPCProofInputs['membershipLists'] = undefined;
        if (parsedInputs.membershipLists && typeof parsedInputs.membershipLists === 'object') {
            deserializedMembershipLists = {};
            for (const listName in parsedInputs.membershipLists) {
                if (Object.prototype.hasOwnProperty.call(parsedInputs.membershipLists, listName)) {
                    const jsonList = parsedInputs.membershipLists[listName];
                    if (!Array.isArray(jsonList)) {
                        throw new Error(`Membership list '${listName}' is not an array.`);
                    }
                    if (jsonList.length > 0 && Array.isArray(jsonList[0])) {
                        deserializedMembershipLists[listName] = jsonList.map((jsonItem, index) => {
                             try {
                                if (!Array.isArray(jsonItem)) throw new Error('Inconsistent item type in tuple list');
                                return jsonItem.map((tupleItem, tupleIndex) =>
                                    podValueFromJSON(tupleItem as JSONPODValue, `${listName}[${index}][${tupleIndex}]`)
                                );
                             } catch (parseError: any) {
                                 console.error(`Error parsing tuple item ${index} in membership list '${listName}': ${parseError.message}`);
                                 throw parseError;
                             }
                        }) as PODValue[][];
                    } else {
                        deserializedMembershipLists[listName] = jsonList.map((jsonItem, index) => {
                            try {
                                if (Array.isArray(jsonItem)) throw new Error('Inconsistent item type in value list');
                                return podValueFromJSON(jsonItem as JSONPODValue, `${listName}[${index}]`);
                            } catch (parseError: any) {
                                console.error(`Error parsing value item ${index} in membership list '${listName}': ${parseError.message}`);
                                throw parseError;
                            }
                        }) as PODValue[];
                    }
                }
            }
        }

        let finalOwnerForProofInputs: GPCProofInputs['owner'] = undefined;
        if (parsedInputs.owner && typeof parsedInputs.owner === 'object') {
            const jsonOwner = parsedInputs.owner as any; // Use 'any' for easier access to potentially dynamic fields
            finalOwnerForProofInputs = {};
    
            if (jsonOwner.semaphoreV3?.commitment) {
                finalOwnerForProofInputs.semaphoreV3 = {
                    commitment: BigInt(jsonOwner.semaphoreV3.commitment)
                } as any; 
            }
    
            if (jsonOwner.semaphoreV4) {
                const secretScalarHex = jsonOwner.semaphoreV4.secretScalar;
                // Optional: use pre-calculated commitment if available and Identity constructor supports it,
                // or if you want to verify it against the one derived from secretScalar.
                // const identityCommitmentString = jsonOwner.semaphoreV4.identityCommitment;

                if (typeof secretScalarHex === 'string') {
                    const identity = new Identity("0x" + secretScalarHex);
                    finalOwnerForProofInputs.semaphoreV4 = identity as any; // Cast to any if Identity from @semaphore-protocol/identity is compatible with IdentityV4 from @pcd/gpc
                    console.log(`  Created Semaphore V4 Identity for owner. Commitment: ${identity.commitment.toString()}`);
                } else {
                    console.warn("Semaphore V4 owner data found but secretScalar is missing or not a string. Cannot create Identity.");
                }
            }
    
            if (jsonOwner.externalNullifier !== undefined) {
                finalOwnerForProofInputs.externalNullifier = podValueFromJSON(jsonOwner.externalNullifier as JSONPODValue, 'owner.externalNullifier');
            }

            if (Object.keys(finalOwnerForProofInputs).length === 0) {
                finalOwnerForProofInputs = undefined;
            }
        }
        
        const deserializedWatermark = parsedInputs.watermark ? podValueFromJSON(parsedInputs.watermark as JSONPODValue, 'watermark') : undefined;

        const proofInputs: GPCProofInputs = {
            pods: deserializedPods,
            membershipLists: deserializedMembershipLists,
            owner: finalOwnerForProofInputs, 
            watermark: deserializedWatermark
        };

        return proofInputs;

    } catch (error: any) {
        console.error(`Error loading inputs file ${proofInputsPath} (resolved: ${absolutePath}): ${error.message}`);
        throw error; 
    }
} 