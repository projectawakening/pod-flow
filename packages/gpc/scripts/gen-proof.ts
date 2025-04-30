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
import { POD, podValueFromJSON, PODValue } from '@pcd/pod';
import { readJsonFile, writeJsonFile } from '../../pods/utils/fsUtils'; // Adjust path as needed

// Define the base directory for artifacts (needed by gpcVerify)
const ARTIFACTS_BASE_DIR = path.resolve(__dirname, '..', 'artifacts');

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

async function generateProof(configPath: string, inputsPath: string) {
    logStep("Starting GPC Proof Generation (Manual Flow)...");
    let circuitDesc: ProtoPODGPCCircuitDesc | undefined; // Define circuitDesc here

    try {
        // 1. Load Config and Inputs
        logStep("1. Loading Proof Config and Inputs...");
        const proofConfig = loadProofConfig(configPath);
        const proofInputs = await loadProofInputs(inputsPath);

        // 2. Load Requirements and Construct Circuit Description
        logStep("2. Loading requirements and constructing circuit description...");
        const configBaseName = path.basename(configPath, path.extname(configPath));
        const requirementsPath = path.join(__dirname, '..', 'proof-requirements', `${configBaseName}_requirements.json`);
        let requirements: ProtoPODGPCCircuitParams;
        try {
            const reqsJson = JSON.parse(await fs.readFile(requirementsPath, 'utf-8'));
            // <<< Explicitly construct the requirements object >>>
            requirements = {
                maxObjects: reqsJson.nObjects,
                maxEntries: reqsJson.nEntries,
                merkleMaxDepth: reqsJson.merkleMaxDepth,
                maxNumericValues: reqsJson.nNumericValues,
                maxEntryInequalities: reqsJson.nEntryInequalities,
                maxLists: reqsJson.nLists,
                maxListElements: reqsJson.maxListSize, // Map name from requirements file
                // <<< Handle tupleArities - assume 0 if empty/missing >>>
                maxTuples: Object.keys(reqsJson.tupleArities || {}).length,
                tupleArity: Object.keys(reqsJson.tupleArities || {}).length > 0 
                    ? Math.max(...Object.values(reqsJson.tupleArities || {}).map(Number)) // Ensure values are numbers
                    : 0,
                includeOwnerV3: reqsJson.includeOwnerV3 ?? false,
                includeOwnerV4: reqsJson.includeOwnerV4 ?? false
            }; 
            console.log("Successfully loaded and constructed requirements object:", requirements);
        } catch (error: any) {
            console.error(`Error loading/processing requirements file ${requirementsPath}: ${error.message}`);
            throw new Error("Failed to construct circuit description."); // Should not happen if requirements load
        }

        // Construct the circuit description directly
        const circuitName = ProtoPODGPC.circuitNameForParams(requirements);
        circuitDesc = {
            family: PROTO_POD_GPC_FAMILY_NAME,
            name: circuitName,
            cost: 0, // Placeholder cost
            ...requirements // Spread the loaded requirements
        };
        const circuitIdentifier = `${circuitDesc.family}_${circuitDesc.name}`;
  
        // Check if circuitDesc is valid before proceeding
        if (!circuitDesc) {
             throw new Error("Failed to construct circuit description."); // Should not happen if requirements load
        }

        // <<< Add circuitIdentifier to proofConfig >>>
        proofConfig.circuitIdentifier = circuitIdentifier as GPCIdentifier; // <<< Type assertion
  
        // 3. Call gpcPreProve
        logStep("3. Calling gpcPreProve...");
        const preProveResult = gpcPreProve(proofConfig, proofInputs, [circuitDesc]); 
        const { circuitInputs, boundConfig } = preProveResult;
        // Ensure circuitDesc from preProve matches (it should)
        if (preProveResult.circuitDesc.name !== circuitDesc.name || preProveResult.circuitDesc.family !== circuitDesc.family) {
            console.warn("Circuit description mismatch between requirement lookup and gpcPreProve result.");
            // Use the one from preProveResult for consistency downstream
            circuitDesc = preProveResult.circuitDesc; 
        }

        // 4. Define Artifact Paths (using the confirmed circuitDesc/identifier)
        const currentCircuitIdentifier = `${circuitDesc.family}_${circuitDesc.name}`;
        logStep(`4. Defining artifact paths for: ${currentCircuitIdentifier}`);
        const artifactsPath = ARTIFACTS_BASE_DIR; // Base directory
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

        // 6. Call snarkjs.groth16.fullProve
        logStep("6. Calling snarkjs.groth16.fullProve...");

        try {
            const { proof, publicSignals } = await groth16.fullProve(
                circuitInputs, // <<< Pass the original circuitInputs object with BigInts >>>
                wasmPath, 
                pkeyPath
                // logger // Optional: pass a logger object if needed
            );
            console.log("groth16.fullProve call completed successfully.");

            // 7. Reconstruct Circuit Outputs for gpcPostProve
            logStep("7. Reconstructing circuit outputs from public signals...");
            const circuitOutputs = ProtoPODGPC.outputsFromPublicSignals(
                publicSignals.map(BigInt), // Ensure signals are BigInts
                circuitDesc.maxEntries,
                paramMaxVirtualEntries(circuitDesc), // <<< Use imported function
                circuitDesc.includeOwnerV3,
                circuitDesc.includeOwnerV4
            );

            // 8. Call gpcPostProve
            logStep("8. Calling gpcPostProve...");
            const postProveResult = gpcPostProve(
                proof, 
                boundConfig, 
                circuitDesc, // <<< Pass the constructed circuitDesc object
                proofInputs, // Original inputs with POD instances
                circuitOutputs
            );
            const finalRevealedClaims = postProveResult.revealedClaims;

            // 9. Prepare Final Output Data
            logStep("9. Preparing final output data...");

            // <<< Use original finalRevealedClaims for serialization >>>
            const serializedBoundConfig = boundConfigToJSON(boundConfig);
            // <<< Pass the original claims object with PODValue instances >>>
            const serializedRevealedClaims = revealedClaimsToJSON(finalRevealedClaims); // <<< Use finalRevealedClaims

            const outputData = {
                proof: proof, // snarkjs proof object is already JSON-compatible
                boundConfig: serializedBoundConfig,
                revealedClaims: serializedRevealedClaims
            };
    
            // 10. Save Output
            const outputCircuitName = circuitDesc.name; // Use name from desc
            const outputFilename = `${configBaseName}_${outputCircuitName}_proof.json`; 
            const outputDir = path.join(__dirname, '..', 'proofs');
            const outputPath = path.join(outputDir, outputFilename);
            logStep(`10. Saving final proof object to: ${outputPath}`);
    
            await fs.mkdir(outputDir, { recursive: true });
            await writeJsonFile(outputPath, outputData); // writeJsonFile handles BigInts via default JSON.stringify
  
            // <<< Add explicit exit on success >>>
            process.exit(0);
        } catch (snarkError: any) {
            console.error("\n--- ERROR during snarkjs.groth16.fullProve --- ");
            console.error("Message:", snarkError.message);
            // Check if the error message hints at memory issues
            if (snarkError.message && (snarkError.message.includes('heap out of memory') || snarkError.message.includes('allocation failed'))) {
                 console.error("Hint: This often indicates insufficient memory. Try increasing the value of NODE_OPTIONS=--max-old-space-size=<memory_in_mb> when running the script.");
            }
            console.error("Stack:", snarkError.stack);
            // Re-throw the error to be caught by the outer try-catch which exits the process
            throw snarkError;
        }

    } catch (error: any) {
        console.error(`\n--- ERROR DURING PROOF GENERATION ---`);
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // logStep("Proof generation process finished."); // Redundant
    }

}

// --- Script Execution ---
const args = process.argv.slice(2);
const configArg = args[0];
const gpcInputsArg = args[1];

if (!configArg || !gpcInputsArg) {
    console.error("Usage: pnpm generate-proof <path/to/config.ts> <path/to/inputs.json>");
    process.exit(1);
}

generateProof(configArg, gpcInputsArg).catch(error => {
    // Errors should be caught within generateProof, but have a safety net
    console.error("\n--- UNHANDLED ERROR ---");
    console.error(error);
    process.exit(1);
});

async function loadProofInputs(proofInputsPath: string): Promise<GPCProofInputs> {
    // <<< Resolve path relative to CWD >>>
    const absolutePath = path.resolve(process.cwd(), proofInputsPath);
    console.log(`Attempting to load GPC inputs from provided path: ${proofInputsPath} (resolved: ${absolutePath})`);
    try {
        const fileContent = await fs.readFile(absolutePath, 'utf-8');
        // <<< Parse without custom reviver >>>
        const parsedInputs = JSON.parse(fileContent);
        if (parsedInputs === null || typeof parsedInputs !== 'object') { // <<< Check for null explicitly
            throw new Error(`Could not read or parse JSON file.`);
        }

        // Manually deserialize PODs
        const deserializedPods: Record<string, POD> = {};
        if (parsedInputs.pods && typeof parsedInputs.pods === 'object') {
            for (const key in parsedInputs.pods) {
                if (Object.prototype.hasOwnProperty.call(parsedInputs.pods, key)) {
                    // Assume the value is a valid JSONPOD structure
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

        // <<< Manually parse membershipLists using podValueFromJSON >>>
        let deserializedMembershipLists: GPCProofInputs['membershipLists'] = undefined;
        if (parsedInputs.membershipLists && typeof parsedInputs.membershipLists === 'object') {
            deserializedMembershipLists = {};
            for (const listName in parsedInputs.membershipLists) {
                if (Object.prototype.hasOwnProperty.call(parsedInputs.membershipLists, listName)) {
                    const jsonList = parsedInputs.membershipLists[listName];
                    if (!Array.isArray(jsonList)) {
                        throw new Error(`Membership list '${listName}' is not an array.`);
                    }
                    // Map each item in the JSON list using podValueFromJSON
                    // <<< Add type assertion based on first element >>>
                    if (jsonList.length > 0 && Array.isArray(jsonList[0])) {
                        // If the first item is an array, assert the whole list as PODValueTuple[]
                        deserializedMembershipLists[listName] = jsonList.map((jsonItem, index) => {
                             try {
                                // Expecting an array (tuple) here
                                if (!Array.isArray(jsonItem)) throw new Error('Inconsistent item type in tuple list');
                                return jsonItem.map((tupleItem, tupleIndex) =>
                                    podValueFromJSON(tupleItem, `${listName}[${index}][${tupleIndex}]`)
                                );
                             } catch (parseError: any) {
                                 console.error(`Error parsing tuple item ${index} in membership list '${listName}': ${parseError.message}`);
                                 throw parseError;
                             }
                        }) as PODValue[][]; // <<< Assert as tuple list
                    } else {
                        // Otherwise, assert the whole list as PODValue[]
                        deserializedMembershipLists[listName] = jsonList.map((jsonItem, index) => {
                            try {
                                // Expecting a single value here
                                if (Array.isArray(jsonItem)) throw new Error('Inconsistent item type in value list');
                                return podValueFromJSON(jsonItem, `${listName}[${index}]`);
                            } catch (parseError: any) {
                                console.error(`Error parsing value item ${index} in membership list '${listName}': ${parseError.message}`);
                                throw parseError;
                            }
                        }) as PODValue[]; // <<< Assert as value list
                    }
                }
            }
        }
        // <<< End Manual Parsing >>>

        // Reconstruct the GPCProofInputs object using deserialized parts
        const proofInputs: GPCProofInputs = {
            pods: deserializedPods,
            membershipLists: deserializedMembershipLists, // <<< Use deserialized lists
            // <<< Need to parse owner and watermark too if they exist and contain PODValues >>>
            owner: parsedInputs.owner, // Assume owner structure doesn't need deep PODValue parsing for now
            watermark: parsedInputs.watermark ? podValueFromJSON(parsedInputs.watermark, 'watermark') : undefined // Parse watermark if present
        };

        return proofInputs;

    } catch (error: any) {
        console.error(`Error loading inputs file ${proofInputsPath} (resolved: ${absolutePath}): ${error.message}`);
        throw error; // Re-throw
    }
} 