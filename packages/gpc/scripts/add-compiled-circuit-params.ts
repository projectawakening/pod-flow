import fs from 'fs/promises';
import path from 'path';
import { 
  ProtoPODGPCCircuitParams, 
  PROTO_POD_GPC_FAMILY_NAME 
} from "@pcd/gpcircuits";
import { SupportedGPCCircuitParams } from '../src/circuitParameterSets'; // Updated path 
import { readJsonFile } from '../../../packages/pods/utils/fsUtils'; // For loading requirements

// --- Configuration ---
const ARTIFACTS_BASE_DIR = path.resolve(__dirname, '..', 'artifacts');
const CIRCUIT_PARAMS_FILE_PATH = path.resolve(__dirname, '../src/circuitParameterSets.ts'); // Updated path to src/

// Type for the structure of the requirements JSON file
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

// --- Helper Functions ---

function logStep(message: string) {
    console.log(`\n=== ${message} ===`);
}

// Generates the canonical name WITHOUT the family prefix (same as in compile-circuit.ts)
function generateCanonicalCircuitName(params: ProtoPODGPCCircuitParams): string {
    return `${params.maxObjects}o-${params.maxEntries}e-${params.merkleMaxDepth}md-${params.maxNumericValues}nv-${params.maxEntryInequalities}ei-${params.maxLists}x${params.maxListElements}l-${params.maxTuples}x${params.tupleArity}t-${+params.includeOwnerV3}ov3-${+params.includeOwnerV4}ov4`;
}

// Check if essential final artifacts exist
async function checkFinalArtifactsExist(circuitFamilyName: string, circuitId: string): Promise<boolean> {
    const wasmPath = path.join(ARTIFACTS_BASE_DIR, `${circuitFamilyName}_${circuitId}.wasm`);
    const pkeyPath = path.join(ARTIFACTS_BASE_DIR, `${circuitFamilyName}_${circuitId}-pkey.zkey`);
    const vkeyPath = path.join(ARTIFACTS_BASE_DIR, `${circuitFamilyName}_${circuitId}-vkey.json`);

    try {
        await fs.access(wasmPath);
        await fs.access(pkeyPath);
        await fs.access(vkeyPath);
        console.log(`  Found all required artifacts: WASM, PKEY, VKEY for ${circuitId}`);
        return true; // All found
    } catch (error: any) {
        console.log(`  Did not find all required artifacts for ${circuitId}. Missing: ${error.path || 'unknown file'}`);
        return false; // At least one missing
    }
}

// --- Main Logic ---

async function addCircuitParams(requirementsFilePath: string) {
    const circuitFamilyName = PROTO_POD_GPC_FAMILY_NAME;
    logStep(`Attempting to add compiled circuit parameters based on: ${requirementsFilePath}`);

    if (!requirementsFilePath) {
        console.error("Error: requirementsFilePath argument (path to requirements JSON) is required.");
        console.error(`Usage: pnpm add-circuit-params <path/to/your_requirements.json>`);
        process.exit(1);
    }
    
    // 1. Load Requirements JSON
    let requirements: GPCRequirements;
    let absoluteRequirementsPath = path.resolve(process.cwd(), requirementsFilePath); // Resolve relative to CWD
    logStep(`Loading requirements from resolved path: ${absoluteRequirementsPath}`);
    try {
        // Read the file, allowing null if readJsonFile returns default
        const loadedReqs = await readJsonFile<GPCRequirements | null>(absoluteRequirementsPath, null); 
        if (loadedReqs === null) {
            throw new Error("File is empty or invalid JSON.");
        }
        requirements = loadedReqs; // Assign to the correctly typed variable
    } catch (e: any) {
        console.error(`Failed to load requirements file ${absoluteRequirementsPath}: ${e.message}`);
        process.exit(1);
    }

    // 2. Map to ProtoPODGPCCircuitParams format
    logStep("Mapping requirement keys...");
    const targetParams: ProtoPODGPCCircuitParams = {
        maxObjects: requirements.nObjects,
        maxEntries: requirements.nEntries,
        merkleMaxDepth: requirements.merkleMaxDepth,
        maxNumericValues: requirements.nNumericValues,
        maxEntryInequalities: requirements.nEntryInequalities,
        maxLists: requirements.nLists,
        maxListElements: requirements.maxListSize, 
        maxTuples: Object.keys(requirements.tupleArities || {}).length,
        tupleArity: Object.keys(requirements.tupleArities || {}).length > 0
            ? Math.max(...Object.values(requirements.tupleArities || {}).map(Number))
            : 0,
        includeOwnerV3: requirements.includeOwnerV3 ?? false,
        includeOwnerV4: requirements.includeOwnerV4 ?? false
    };
    console.log("Mapped parameters:", targetParams);

    // 3. Generate Canonical Name (Circuit ID)
    const circuitId = generateCanonicalCircuitName(targetParams);
    logStep(`Checking for Circuit ID: ${circuitId}`);

    // 4. Check if Final Artifacts Exist
    const artifactsExist = await checkFinalArtifactsExist(circuitFamilyName, circuitId);

    if (!artifactsExist) {
        console.error(`\nError: Final artifacts for circuit ${circuitId} not found in ${ARTIFACTS_BASE_DIR}.`);
        console.error(`Cannot add parameters to circuitParameterSets.ts. Run 'pnpm run compile-circuit ${requirementsFilePath}' first.`);
        process.exit(1);
    }

    // 5. Read, Parse, Update, and Write circuitParameterSets.ts
    logStep(`Updating ${path.basename(CIRCUIT_PARAMS_FILE_PATH)}...`);
    try {
        const fileContent = await fs.readFile(CIRCUIT_PARAMS_FILE_PATH, 'utf-8');
        
        // Find the array definition (simple regex approach - might be fragile)
        const arrayRegex = /export\s+const\s+supportedParameterSets\s*:\s*SupportedGPCCircuitParams\[\]\s*=\s*(\[(?:.|\n|\r)*?\]);/m;
        const match = fileContent.match(arrayRegex);

        if (!match || !match[1]) {
            throw new Error("Could not find or parse 'supportedParameterSets' array in the file. Check formatting.");
        }

        const arrayString = match[1];
        let currentSets: SupportedGPCCircuitParams[] = [];

        // Attempt to parse the extracted array string
        try {
            // Using Function constructor is slightly safer than direct eval
            currentSets = new Function(`return ${arrayString};`)();
        } catch (parseError: any) {
            console.error("Parsing Error:", parseError.message);
            throw new Error(`Could not parse the existing supportedParameterSets array. Check the syntax in ${CIRCUIT_PARAMS_FILE_PATH}. Ensure it's a valid JavaScript array literal.`);
        }

        // Check if the circuitId already exists
        const existingIndex = currentSets.findIndex(p => p.circuitId === circuitId);

        if (existingIndex !== -1) {
            // console.log(`Circuit ID ${circuitId} already exists in the parameter sets. No update needed.`);
        } else {
            // Create the new entry for the TS file
            const newParamSetEntry: SupportedGPCCircuitParams = {
                ...targetParams, // Spread the mapped parameters
                circuitId: circuitId // Add the generated circuitId
            };
            currentSets.push(newParamSetEntry);

            // Serialize the updated array back to a string with indentation
            const updatedArrayString = JSON.stringify(currentSets, null, 4); // Use 4 spaces for indentation

            // Replace the old array string in the original content
            const updatedFileContent = fileContent.replace(arrayRegex,
                 `export const supportedParameterSets: SupportedGPCCircuitParams[] = ${updatedArrayString};`
            );

            // Write the updated content back to the file
            await fs.writeFile(CIRCUIT_PARAMS_FILE_PATH, updatedFileContent, 'utf-8');
            console.log(`Successfully added parameters for ${circuitId} to ${path.basename(CIRCUIT_PARAMS_FILE_PATH)}.`);
        }

    } catch (error: any) {
        console.error(`Error updating ${path.basename(CIRCUIT_PARAMS_FILE_PATH)}: ${error.message}`);
        process.exit(1);
    }
}

// --- Script Execution ---
const args = process.argv.slice(2);
const requirementsArg = args[0];

addCircuitParams(requirementsArg).catch(error => {
    // Catch errors from the main function that weren't handled internally
    console.error("An unexpected error occurred during script execution:", error);
    process.exit(1);
}); 