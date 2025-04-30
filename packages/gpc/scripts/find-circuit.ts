import fs from 'fs/promises';
import path from 'path';
import { SupportedGPCCircuitParams, supportedParameterSets } from '../src/circuitParameterSets';
import { PROTO_POD_GPC_FAMILY_NAME } from "@pcd/gpcircuits";

// Base directory where compiled artifacts are stored
const ARTIFACTS_BASE_DIR = path.join(__dirname, '..', 'artifacts');

// Type for the requirements file structure
interface GPCRequirements {
    nObjects: number;
    nEntries: number; 
    merkleMaxDepth: number; 
    nNumericValues: number;
    nEntryInequalities: number;
    nLists: number;
    maxListSize: number;
    tupleArities: Record<string, number>; 
    includeOwnerV3: boolean;
    includeOwnerV4: boolean;
}

// Comparison helper (adapted from generate-circuit-inputs)
function circuitParamsMeetRequirements(params: SupportedGPCCircuitParams, reqs: GPCRequirements): boolean {
    const requiredMaxTuples = Object.keys(reqs.tupleArities).length;
    const requiredTupleArity = requiredMaxTuples > 0 ? Math.max(...Object.values(reqs.tupleArities)) : 0;
    
    return (
        params.maxObjects >= reqs.nObjects &&
        params.maxEntries >= reqs.nEntries &&
        params.merkleMaxDepth >= reqs.merkleMaxDepth &&
        params.maxNumericValues >= reqs.nNumericValues &&
        params.maxEntryInequalities >= reqs.nEntryInequalities &&
        params.maxLists >= reqs.nLists &&
        params.maxListElements >= reqs.maxListSize && 
        params.maxTuples >= requiredMaxTuples && 
        params.tupleArity >= requiredTupleArity &&  
        params.includeOwnerV3 === reqs.includeOwnerV3 && 
        params.includeOwnerV4 === reqs.includeOwnerV4    
    );
}

// Function to check if essential artifacts exist for a given circuitId
async function checkArtifactsExist(circuitId: string): Promise<boolean> {
    if (!circuitId) return false;

    const familyName = PROTO_POD_GPC_FAMILY_NAME;

    const wasmPath = path.join(ARTIFACTS_BASE_DIR, `${familyName}_${circuitId}.wasm`);
    const pkeyPath = path.join(ARTIFACTS_BASE_DIR, `${familyName}_${circuitId}-pkey.zkey`); // Note: -pkey.zkey
    const vkeyPath = path.join(ARTIFACTS_BASE_DIR, `${familyName}_${circuitId}-vkey.json`);// Note: -vkey.json

    try {
        await fs.access(wasmPath);
        await fs.access(pkeyPath);
        await fs.access(vkeyPath);
        return true; // All found
    } catch (error: any) {
        // Optional: Log which file was missing for debugging
        // console.warn(`  > Artifact check failed for ${circuitId}. Missing: ${error.path}`);
        return false; // At least one missing
    }
}

// Function to determine if circuit A is "smaller" than circuit B
// Definition of smaller: fewer entries, then fewer objects.
function isSmallerCircuit(circuitA: SupportedGPCCircuitParams, circuitB: SupportedGPCCircuitParams): boolean {
    if (circuitA.maxEntries < circuitB.maxEntries) return true;
    if (circuitA.maxEntries > circuitB.maxEntries) return false;
    // If entries are equal, compare objects
    if (circuitA.maxObjects < circuitB.maxObjects) return true;
    // Add other criteria if needed (e.g., numeric values, inequalities)
    return false;
}

async function findCircuit(requirementsPath: string) {
    console.log(`--- Finding Compiled Circuit for Requirements: ${requirementsPath} ---`);

    if (!requirementsPath) {
        console.error("Error: Requirements JSON file path argument is required.");
        process.exit(1);
    }

    // 1. Load Requirements
    let requirements: GPCRequirements;
    const absoluteRequirementsPath = path.resolve(process.cwd(), requirementsPath);
    console.log(`Attempting to load requirements from resolved path: ${absoluteRequirementsPath}`);
    try {
        const reqsContent = await fs.readFile(absoluteRequirementsPath, 'utf-8');
        requirements = JSON.parse(reqsContent);
    } catch (error: any) {
        console.error(`Error loading requirements file ${absoluteRequirementsPath}: ${error.message}`);
        process.exit(1);
    }

    // 2. Find Best Matching *Compiled* Circuit
    let bestMatch: SupportedGPCCircuitParams | null = null;

    for (const paramSet of supportedParameterSets) {
        if (!paramSet.circuitId) {
            console.warn("Skipping parameter set with no circuitId:", paramSet);
            continue;
        }

        // Check if parameters meet requirements
        if (circuitParamsMeetRequirements(paramSet, requirements)) {
            const artifactsExist = await checkArtifactsExist(paramSet.circuitId);
            if (artifactsExist) {
                // Is it better than the current best?
                if (bestMatch === null || isSmallerCircuit(paramSet, bestMatch)) {
                    bestMatch = paramSet;
                }
            }
        }
    }

    // 3. Output Result
    if (bestMatch && bestMatch.circuitId) {
        // Output should just be the circuitId, the calling script figures out paths
        console.log(`--- Found best matching compiled circuit: ${bestMatch.circuitId} ---`);
        console.log(bestMatch.circuitId); // Print the circuitId to stdout
    } else {
        const configName = path.basename(absoluteRequirementsPath, '_requirements.json');
        console.log(`--- No suitable compiled circuit found for: ${configName} ---`);
        console.log(`COMPILE_NEEDED ${configName}`); // Print instruction to stdout
    }
}

// --- Script Execution ---
const args = process.argv.slice(2);
const requirementsArg = args[0];

findCircuit(requirementsArg).catch(error => {
    console.error("An unexpected error occurred:", error);
    process.exit(1);
}); 