import fs from 'fs/promises';
import path from 'path';
import {
    GPCProof,
    GPCBoundConfig,
    GPCRevealedClaims,
    ProtoPODGPCCircuitDesc,
    boundConfigFromJSON,
    revealedClaimsFromJSON,
    compileVerifyConfig,
} from '@pcd/gpc';
import {
    PROTO_POD_GPC_FAMILY_NAME,
    ProtoPODGPC,
    ProtoPODGPCPublicInputs,
    ProtoPODGPCOutputs
} from "@pcd/gpcircuits";
import { SupportedGPCCircuitParams, supportedParameterSets } from '../src/circuitParameterSets';

// --- Configuration ---
const ARTIFACTS_BASE_DIR = path.resolve(__dirname, '..', 'artifacts');

// --- Helper Functions ---

function logStep(message: string) {
    console.log(`\n=== ${message} ===`);
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

    // 3. Verify manually using ProtoPODGPC.verify to bypass config/claim list check
    let circuitPublicInputs: ProtoPODGPCPublicInputs;
    let circuitOutputs: ProtoPODGPCOutputs;
    try {
        // Directly compile using the modified boundConfig
        logStep("Calling compileVerifyConfig with modified boundConfig...");
        const compiledVerify = compileVerifyConfig(boundConfig, revealedClaims, circuitDesc);
        circuitPublicInputs = compiledVerify.circuitPublicInputs;
        circuitOutputs = compiledVerify.circuitOutputs;
        console.log("Successfully obtained compiled inputs/outputs via compileVerifyConfig.");

    } catch (compileError: any) {
        console.error(`compileVerifyConfig failed: ${compileError.message}`);
        console.error(compileError.stack);
        process.exit(1);
    }

    logStep("Calling ProtoPODGPC.verify directly...");
    let isValid = false;
    try {
        const vkeyPath = path.join(ARTIFACTS_BASE_DIR, `${identifier}-vkey.json`);
        console.log(`  Using VKey Path: ${vkeyPath}`);
        // Ensure vkey exists
        await fs.access(vkeyPath);

        // Convert proof points to BigInt if they aren't already (snarkjs proof objects often use strings)
        const proofBigInt: GPCProof = {
            pi_a: proof.pi_a,
            pi_b: proof.pi_b,
            pi_c: proof.pi_c,
            protocol: proof.protocol,
            curve: proof.curve
        };
        
        isValid = await ProtoPODGPC.verify(
            vkeyPath,
            proofBigInt, // Pass proof with BigInts
            circuitPublicInputs, // Already BigInts from compileVerifyConfig
            circuitOutputs      // Already BigInts from compileVerifyConfig
        );
    } catch (e: any) {
        console.error(`Error during ProtoPODGPC.verify: ${e.message}`);
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