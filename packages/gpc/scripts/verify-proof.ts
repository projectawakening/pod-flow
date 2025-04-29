import fs from 'fs/promises';
import path from 'path';
import {
    GPCProof,
    GPCBoundConfig,
    GPCRevealedClaims,
    ProtoPODGPCCircuitDesc,
    GPCCircuitFamily,
    boundConfigFromJSON,
    revealedClaimsFromJSON,
    gpcVerify,
    compileVerifyConfig
} from '@pcd/gpc';
import {
    PROTO_POD_GPC_FAMILY_NAME,
    ProtoPODGPC
} from "@pcd/gpcircuits";
import { SupportedGPCCircuitParams, supportedParameterSets } from '../src/circuitParameterSets';

// --- Configuration ---
const ARTIFACTS_BASE_DIR = path.resolve(__dirname, '..', 'artifacts');
const PROOFS_BASE_DIR = path.resolve(__dirname, '..', 'proofs'); // Base dir for proof files

// --- Helper Functions ---

function logStep(message: string) {
    console.log(`\n=== ${message} ===`);
}

// <<< Add Recursive BigInt Parser >>>
function parseBigIntsRecursive(obj: any): any {
    // <<< RE-ADD handling for typeof obj === 'number' >>>
    if (typeof obj === 'number') {
        // Convert numbers to BigInt 
        if (Number.isSafeInteger(obj)) { 
            return BigInt(obj);
        }
        // Handle potential floating point or unsafe integers if necessary
        console.warn(`Attempting to convert potentially unsafe integer or float to BigInt: ${obj}`);
        try { return BigInt(Math.floor(obj)); } catch { return obj; } // Fallback
    } else if (typeof obj === 'string' && /^\d+$/.test(obj)) { 
        try {
            // Try to parse strings that look like integers into BigInts
            return BigInt(obj);
        } catch (e) {
            // Ignore errors (e.g., if string is too large for Number but not intended as BigInt)
            // and return the original string
            return obj;
        }
    } else if (Array.isArray(obj)) {
        return obj.map(parseBigIntsRecursive);
    } else if (typeof obj === 'object' && obj !== null) {
        const newObj: { [key: string]: any } = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = parseBigIntsRecursive(obj[key]);
            }
        }
        return newObj;
    } else {
        return obj;
    }
}

// <<< Add Recursive BigInt Stringifier (similar to generate-proof) >>>
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

// <<< Add custom stringifier to show BigInt types >>>
function stringifyWithTypes(obj: any): string {
    // Limit depth to avoid excessive logging
    let depth = 0;
    const maxDepth = 5; 

    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (depth >= maxDepth) {
                return '[Max Depth Reached]';
            }
            depth++;
        } else {
             // Reset depth when not traversing deeper
             // This isn't perfect for complex structures but helps
             depth = 0; 
        }

        if (typeof value === 'bigint') {
            return `BigInt(${value.toString()})`;
        }
        // Truncate long strings/arrays if necessary (optional)
        // if (typeof value === 'string' && value.length > 100) { return value.substring(0, 97) + '...'; }
        // if (Array.isArray(value) && value.length > 20) { return `[Array(${value.length})]`; }

        return value;
    }, 2);
}

// Interface to represent the structure of the proof JSON file
interface ProofFileContent {
    proof: any; // Groth16Proof structure
    boundConfig: any; // JSON representation of GPCBoundConfig
    revealedClaims: any; // JSON representation of GPCRevealedClaims
}

// Helper function to generate circuit ID from parameters (reverse lookup)
function generateCircuitIdFromParams(params: SupportedGPCCircuitParams): string {
    return `${params.maxObjects}o-${params.maxEntries}e-${params.merkleMaxDepth}md-${params.maxNumericValues}nv-${params.maxEntryInequalities}ei-${params.maxLists}x${params.maxListElements}l-${params.maxTuples}x${params.tupleArity}t-${+params.includeOwnerV3}ov3-${+params.includeOwnerV4}ov4`;
}

// --- Main Verification Logic ---

async function verifyProof(proofJsonPath: string) {
    logStep("Verifying GPC Proof...");

    if (!proofJsonPath) {
        console.error("Usage: pnpm verify-proof <path/to/proof.json>");
        process.exit(1);
    }

    // 1. Load Proof File (as raw JSON object)
    let proofFileJson: ProofFileContent;
    const absoluteProofPath = path.resolve(process.cwd(), proofJsonPath);
    logStep(`Attempting to load proof file from resolved path: ${absoluteProofPath}`);
    try {
        const fileContentString = await fs.readFile(absoluteProofPath, 'utf-8');
        proofFileJson = JSON.parse(fileContentString) as ProofFileContent;
    } catch (e: any) {
        console.error(`Error loading proof file from ${absoluteProofPath}: ${e.message}`);
        process.exit(1);
    }

    // 2. Extract and Deserialize Components using Library Functions
    logStep("Deserializing components using library functions...");
    let proof: GPCProof;
    let boundConfig: GPCBoundConfig;
    let revealedClaims: GPCRevealedClaims;
    try {
        proof = proofFileJson.proof as GPCProof; // Use raw proof object
        boundConfig = boundConfigFromJSON(proofFileJson.boundConfig);
        revealedClaims = revealedClaimsFromJSON(proofFileJson.revealedClaims);

        if (!proof || !boundConfig || !revealedClaims) {
            throw new Error("Parsed proof file JSON is missing required fields (proof, boundConfig, revealedClaims).");
        }
    } catch (e: any) {
        console.error(`Error deserializing components from proof file JSON: ${e.message}`);
        process.exit(1);
    }

    // Re-add logic to find circuit description
    logStep("Finding circuit parameters from identifier...");
    const identifier = boundConfig.circuitIdentifier;
    if (!identifier || !identifier.startsWith(PROTO_POD_GPC_FAMILY_NAME + '_')) {
        console.error(`Invalid or missing circuitIdentifier in boundConfig: ${identifier}`);
        console.error(`Derived from identifier: ${identifier}`);
        process.exit(1);
    }
    const circuitNameFromId = identifier.substring(PROTO_POD_GPC_FAMILY_NAME.length + 1);
    const matchedParams = supportedParameterSets.find(params => {
        const generatedId = generateCircuitIdFromParams(params);
        return circuitNameFromId === generatedId || circuitNameFromId === params.circuitId;
    });
    if (!matchedParams) {
        console.error(`Could not find parameters in circuitParameterSets.ts matching circuit name: ${circuitNameFromId}`);
        console.error(`Derived from identifier: ${identifier}`);
        process.exit(1);
    }
    const circuitDesc: ProtoPODGPCCircuitDesc = {
        family: PROTO_POD_GPC_FAMILY_NAME,
        name: circuitNameFromId,
        cost: 0, // Cost is not strictly needed for verification path
        ...matchedParams
    };

    // 3. Verify using the standard gpcVerify function
    logStep("Calling standard gpcVerify function...");
    let isValid = false;
    try {
        // Use local artifacts directory for verification
        isValid = await gpcVerify(
            proof,
            boundConfig,
            revealedClaims,
            ARTIFACTS_BASE_DIR,
            [circuitDesc]
        );
    } catch (e: any) {
        console.error(`Error during standard gpcVerify: ${e.message}`);
        console.error(e.stack);
        isValid = false;
    }

    // 4. Report Result
    logStep("--- Verification Result ---");
    if (isValid) {
        console.log("✅ Proof is VALID!");
        process.exit(0);
    } else {
        console.log("❌ Proof is INVALID or an error occurred during verification.");
        process.exit(1);
    }
}

// --- Script Execution ---
const args = process.argv.slice(2);
const proofPathArg = args[0];

verifyProof(proofPathArg).catch(error => {
    console.error("An unexpected error occurred during verification script execution:", error);
    process.exit(1);
});

// End of verify-proof script 