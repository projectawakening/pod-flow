import fs from 'fs/promises';
import fsSync from 'fs'; // <<< Import synchronous fs for config reading
import path from 'path';
import { execSync } from 'child_process';
// import { SupportedGPCCircuitParams, supportedParameterSets } from './circuitParameterSets'; // No longer needed
import { ProtoPODGPCCircuitParams, PROTO_POD_GPC_FAMILY_NAME, PROTO_POD_GPC_PUBLIC_INPUT_NAMES } from "@pcd/gpcircuits"; // Import the type, family name, and public input names
import { readJsonFile } from '../../../packages/pods/utils/fsUtils'; // For loading requirements

// --- Configuration ---
// Path to the original source file (we will include it, not modify it)
const CIRCOM_SRC_DIR = path.resolve(__dirname, '..', 'node_modules', '@pcd', 'gpcircuits', 'circuits');
const CIRCOM_SRC_FILENAME = 'proto-pod-gpc.circom';
const CIRCOM_SRC_FILE_PATH = path.join(CIRCOM_SRC_DIR, CIRCOM_SRC_FILENAME);

const ARTIFACTS_BASE_DIR = path.resolve(__dirname, '..', 'artifacts');
const PTAU_DIR = path.resolve(__dirname, '..', 'ptau'); // Use the dir configured in circomkit.json

// Add base directory for requirements files
const REQUIREMENTS_BASE_DIR = path.resolve(__dirname, '..', 'proof-requirements');

// <<< Define constants for file paths/names >>>
const CIRCUITS_JSON_PATH = path.resolve(__dirname, '..', 'circuits.json'); // <<< Define path to circuits.json
// const ARTIFACTS_FINAL_DIR = path.join(ARTIFACTS_BASE_DIR, ARTIFACT_BASENAME); // REMOVED (unused)
const CIRCOMKIT_BUILD_DIR_BASE = path.resolve(__dirname, '..', 'build', 'circomkit');

// Function to convert params object to ordered array for circuits.json
function paramsToArray(params: ProtoPODGPCCircuitParams): number[] {
    return [
        params.maxObjects,
        params.maxEntries,
        params.merkleMaxDepth,
        params.maxNumericValues,
        params.maxEntryInequalities,
        params.maxLists,
        params.maxListElements,
        params.maxTuples,
        params.tupleArity,
        params.includeOwnerV3 ? 1 : 0,
        params.includeOwnerV4 ? 1 : 0
    ];
}

// --- Helper Functions ---

function logStep(message: string) {
    console.log(`\n=== ${message} ===`);
}

function runCommand(command: string, cwd?: string) {
    console.log(`Executing: ${command}` + (cwd ? ` in ${cwd}` : ''));
    try {
        execSync(command, { stdio: 'inherit', cwd });
    } catch (error: any) {
        console.error(`Error executing command: ${command}`);
        console.error(error.message);
        throw new Error(`Command failed: ${command}`);
    }
}

// Function to load and map requirements JSON
// Takes the *resolved* absolute path
async function loadAndMapRequirements(absoluteRequirementsPath: string): Promise<ProtoPODGPCCircuitParams> {
    logStep(`Loading circuit requirements JSON from: ${absoluteRequirementsPath}`);
    try {
        // Use the absolute path directly
        const rawRequirements = await readJsonFile<any | null>(absoluteRequirementsPath, null);
        if (rawRequirements === null) {
            throw new Error(`Could not read or parse JSON file: ${absoluteRequirementsPath}`);
        }
        console.log("Loaded raw requirements JSON:", JSON.stringify(rawRequirements, null, 2));

        // Map keys
        const mappedRequirements: ProtoPODGPCCircuitParams = {
            maxObjects: rawRequirements.nObjects,
            maxEntries: rawRequirements.nEntries,
            merkleMaxDepth: rawRequirements.merkleMaxDepth,
            maxNumericValues: rawRequirements.nNumericValues,
            maxEntryInequalities: rawRequirements.nEntryInequalities,
            maxLists: rawRequirements.nLists,
            maxListElements: rawRequirements.maxListSize,
            maxTuples: Object.keys(rawRequirements.tupleArities || {}).length,
            tupleArity: Object.keys(rawRequirements.tupleArities || {}).length > 0
                ? Math.max(...Object.values(rawRequirements.tupleArities || {}).map(Number))
                : 0,
            includeOwnerV3: rawRequirements.includeOwnerV3,
            includeOwnerV4: rawRequirements.includeOwnerV4
        };

        console.log("Mapped requirements (ProtoPODGPCCircuitParams):", JSON.stringify(mappedRequirements, null, 2));
        return mappedRequirements;
    } catch (e: any) {
        console.error(`Error loading/mapping requirements file: ${e.message}`);
        throw e; // Re-throw after logging
    }
}

// Generates the canonical name WITHOUT the family prefix
function generateCanonicalCircuitName(params: ProtoPODGPCCircuitParams): string {
    // Removed "ProtoPODGPC_" prefix
    return `${params.maxObjects}o-${params.maxEntries}e-${params.merkleMaxDepth}md-${params.maxNumericValues}nv-${params.maxEntryInequalities}ei-${params.maxLists}x${params.maxListElements}l-${params.maxTuples}x${params.tupleArity}t-${+params.includeOwnerV3}ov3-${+params.includeOwnerV4}ov4`;
}

// Function to generate the parameter string for the main component instantiation
// Now takes ProtoPODGPCCircuitParams directly
function getInstantiationParamsString(params: ProtoPODGPCCircuitParams): string {
    // IMPORTANT: Order matches ProtoPODGPC template definition!
    return [
        params.maxObjects,
        params.maxEntries,
        params.merkleMaxDepth,
        params.maxNumericValues,
        params.maxEntryInequalities,
        params.maxLists,
        params.maxListElements,
        params.maxTuples,
        params.tupleArity,
        params.includeOwnerV3 ? 1 : 0,
        params.includeOwnerV4 ? 1 : 0
    ].join(', ');
}

// Function to generate the content for the wrapper circom file
// <<< Revert to taking relative include path >>>
function createWrapperCircomContent(params: ProtoPODGPCCircuitParams, relativeIncludePath: string): string {
    const instantiationParams = getInstantiationParamsString(params);
    const finalPublicSignals = PROTO_POD_GPC_PUBLIC_INPUT_NAMES.join(', ');

    return `
pragma circom 2.1.8;

// Include using the relative path from the wrapper's location
include "${relativeIncludePath}"; 

component main { public [ ${finalPublicSignals} ] } = // Original public signals list
    ProtoPODGPC(${instantiationParams});
`;
}

// --- Main Compilation Logic ---
// Renamed argument for clarity
async function compileCircuit(requirementsFilePath: string) {
    const circuitFamilyName = PROTO_POD_GPC_FAMILY_NAME;
    logStep(`Compiling circuit based on requirements from: ${requirementsFilePath}`);
    
    // <<< Define node memory options variable >>>
    const nodeMemoryOptions = "NODE_OPTIONS=--max-old-space-size=16384"; // Increased to 16GB

    // <<< Declare vars needed in finally block >>>
    let originalCircuitsJsonContent: string | null = null; 
    let circuitName = ''; // Also need circuitName in finally

    // <<< Read ptau size from circomkit config EARLY >>>
    let ptauSize: number;
    let ptauDir: string;
    try {
        const configPath = path.resolve(__dirname, '..', 'circomkit.json');
        const configContent = fsSync.readFileSync(configPath, 'utf-8'); // <<< Use sync read
        const config = JSON.parse(configContent);
        ptauSize = config.ptau;
        ptauDir = path.resolve(__dirname, '..', config.dirPtau || './ptau'); // Default to ./ptau
        if (typeof ptauSize !== 'number' || ptauSize <= 0) {
            throw new Error("Invalid or missing 'ptau' size in circomkit.json");
        }
        // console.log(`Using PTAU size ${ptauSize} from circomkit.json`);
    } catch (error: any) {
        console.error(`Error reading ptau config from circomkit.json: ${error.message}`);
        process.exit(1); // Exit if we can't determine PTAU size
    }
    const ptauFilename = `powersOfTau28_hez_final_${ptauSize}.ptau`;
    const ptauFilePath = path.join(ptauDir, ptauFilename);

    if (!requirementsFilePath) {
        console.error("Error: requirementsFilePath argument (path to requirements JSON) is required.");
        console.error("Example: pnpm compile-circuit ./packages/gpc/proof-requirements/myConfig_requirements.json");
        console.error(`       (File expected within ${REQUIREMENTS_BASE_DIR})`);
        process.exit(1);
    }

    // 1. Resolve Requirements Path and Load/Map Parameters
    logStep("Resolving path and loading/mapping parameters from requirements file...");
    let params: ProtoPODGPCCircuitParams;
    // <<< Resolve path relative to CWD >>>
    const absoluteRequirementsPath = path.resolve(process.cwd(), requirementsFilePath);
    // console.log(`Attempting to load requirements from resolved path: ${absoluteRequirementsPath}`);
    try {
        // Pass the correctly resolved path to the loading function
        params = await loadAndMapRequirements(absoluteRequirementsPath);
    } catch (error: any) {
        // Update error message to show the path it tried to resolve
        console.error(`Failed to load or map requirements from ${requirementsFilePath} (resolved to ${absoluteRequirementsPath}): ${error.message}`);
        process.exit(1);
    }

    // 2. Generate Canonical Circuit Name (now without prefix)
    circuitName = generateCanonicalCircuitName(params);
    logStep(`Generated Canonical Circuit Name: ${circuitName}`);

    // 3. Prepare Paths and Directories
    logStep("Preparing directories and paths...");
    // <<< Wrapper file goes back into the specific artifact dir >>>
    const circuitArtifactDir = path.join(ARTIFACTS_BASE_DIR, circuitName); 
    const wrapperCircomFilename = `circuit_wrapper_${circuitName}.circom`;
    const wrapperCircomFilePath = path.join(circuitArtifactDir, wrapperCircomFilename);
    // <<< Define the build output dir explicitly for circom >>>
    const buildDir = path.join(CIRCOMKIT_BUILD_DIR_BASE, circuitName);
    // const r1csFile = path.join(circuitArtifactDir, `${ARTIFACT_BASENAME}.r1cs`); // Inline usage below
    // const wasmDir = path.join(circuitArtifactDir, `${ARTIFACT_BASENAME}_js`); // No longer needed
    // <<< Define WASM path based on LIBRARY EXPECTATION
    const wasmFile = path.join(ARTIFACTS_BASE_DIR, `${circuitFamilyName}_${circuitName}.wasm`);
    const zkeyFile0 = path.join(circuitArtifactDir, 'circuit_0000.zkey');
    const zkeyFile1 = path.join(circuitArtifactDir, 'circuit_0001.zkey');
    // <<< Define final ZKEY/PKEY path based on LIBRARY EXPECTATION
    const finalZkeyFile = path.join(ARTIFACTS_BASE_DIR, `${circuitFamilyName}_${circuitName}-pkey.zkey`);
    // <<< Define vkey path based on LIBRARY EXPECTATION
    const vkeyFile = path.join(ARTIFACTS_BASE_DIR, `${circuitFamilyName}_${circuitName}-vkey.json`);

    await fs.mkdir(circuitArtifactDir, { recursive: true }); // Need this dir for the wrapper
    await fs.mkdir(buildDir, { recursive: true }); // Need the build dir for circom output
    // console.log(`Intermediate build outputs (r1cs, wasm, sym) will be in: ${buildDir}`);
    // console.log(`Final ZKey/VKey will be in: ${ARTIFACTS_BASE_DIR}`);
    // console.log(`Wrapper file will be created at: ${wrapperCircomFilePath}`);

    // 4. Check for Circom Compiler
    try {
        execSync('circom --version');
    } catch (e) {
        console.error("Error: circom command not found. Please install circom (https://docs.circom.io/) and ensure it's in your PATH.");
        process.exit(1);
    }

    // 4. Create Wrapper Circom File in ARTIFACTS_BASE_DIR/<circuitName>
    logStep("Creating wrapper circom file...");
    // <<< Calculate relative path from wrapper location to src >>>
    const relativeSrcPath = path.relative(circuitArtifactDir, CIRCOM_SRC_FILE_PATH);
    const wrapperContent = createWrapperCircomContent(params, relativeSrcPath);
    await fs.writeFile(wrapperCircomFilePath, wrapperContent, 'utf-8');
    // console.log(`Wrapper file created at: ${wrapperCircomFilePath}`);

    // <<< Declare setup file paths outside the try block >>>
    let r1csFileInBuild = '';
    let zkeyFile0InBuild = '';
    let zkeyFileFinalInBuild = '';
    let vkeyFileInBuild = '';
    try {
        // --- Steps before compile: Load reqs, generate name, prepare paths --- 
        // 1. Resolve Requirements Path and Load/Map Parameters
        // ... loading params ...

        // 2. Generate Canonical Circuit Name
        circuitName = generateCanonicalCircuitName(params);
        logStep(`Generated Canonical Circuit Name: ${circuitName}`);

        // 3. Prepare Paths and Directories
        // ... path definitions ...

        // --- Modify circuits.json BEFORE compile --- 
        logStep("Temporarily updating circuits.json...");
        // Read existing circuits.json
        originalCircuitsJsonContent = await fs.readFile(CIRCUITS_JSON_PATH, 'utf-8');
        const circuitsConfig = JSON.parse(originalCircuitsJsonContent);

        // Add temporary entry with PARAMS, not file path
        circuitsConfig[circuitName] = {
            // "file": ..., // << No file key
            "template": "ProtoPODGPC",
            "params": paramsToArray(params), // <<< Add ordered params array
            "file": "proto-pod-gpc", // <<< Add reference to base file 
            "pubs": PROTO_POD_GPC_PUBLIC_INPUT_NAMES 
        };

        // Write updated circuits.json
        await fs.writeFile(CIRCUITS_JSON_PATH, JSON.stringify(circuitsConfig, null, 2), 'utf-8');
        // console.log(`Added temporary entry for ${circuitName} with params to ${path.basename(CIRCUITS_JSON_PATH)}`);

        // <<< Compile and Setup using Circomkit >>>
        // 5. Compile Circuit using Circomkit
        logStep("Compiling circuit using circomkit compile...");
        const compileCommand = `${nodeMemoryOptions} circomkit compile ${circuitName}`;
        runCommand(compileCommand);
        // console.log("Circuit compilation finished.");

        // <<< REVERT to Setup Phase using snarkjs directly >>>
        logStep("Running setup phase using snarkjs...");

        // Paths relative to the build directory for snarkjs
        const r1csFileInBuild = path.join(buildDir, `${circuitName}.r1cs`); // R1CS from circomkit compile output name
        const zkeyFile0InBuild = path.join(buildDir, 'circuit_0000.zkey');
        zkeyFileFinalInBuild = path.join(buildDir, 'circuit_final.zkey'); // Default name for final key
        vkeyFileInBuild = path.join(buildDir, 'verification_key.json'); // Default name for vkey

        // Ensure PTAU file exists
        try {
            await fs.access(ptauFilePath);
            // console.log(`Found PTAU file: ${ptauFilePath}`);
        } catch (error) {
            console.error(`Error: PTAU file not found at ${ptauFilePath}`);
            console.error(`Please run 'pnpm setup:fetch-ptau' first.`);
            process.exit(1);
        }
        
        // Check if R1CS file exists from previous step
        try {
            // <<< Check for R1CS file named after circuitName (circomkit output) >>>
            await fs.access(r1csFileInBuild);
            // console.log(`Found R1CS file: ${r1csFileInBuild}`);
        } catch (error) {
             console.error(`Error: R1CS file not found at ${r1csFileInBuild} after compilation step.`);
             throw error; // Re-throw to trigger cleanup and exit
        }

        // snarkjs groth16 setup
        const setupCommand = `snarkjs groth16 setup ${path.relative(process.cwd(), r1csFileInBuild)} ${path.relative(process.cwd(), ptauFilePath)} ${path.relative(process.cwd(), zkeyFile0InBuild)}`;
        runCommand(`${nodeMemoryOptions} ${setupCommand}`);
        
        // snarkjs zkey contribute (dummy contribution)
        const contribCommand = `snarkjs zkey contribute ${path.relative(process.cwd(), zkeyFile0InBuild)} ${path.relative(process.cwd(), zkeyFileFinalInBuild)} --name="Dummy Contributor" -v -e="some random text"`;
        runCommand(`${nodeMemoryOptions} ${contribCommand}`);

        // snarkjs zkey export verificationkey
        const exportVkeyCommand = `snarkjs zkey export verificationkey ${path.relative(process.cwd(), zkeyFileFinalInBuild)} ${path.relative(process.cwd(), vkeyFileInBuild)}`;
        runCommand(`${nodeMemoryOptions} ${exportVkeyCommand}`);

        // console.log("snarkjs setup phase finished.");

    } catch (error) {
        console.error("An error occurred during compile/setup.", error);
        process.exit(1); 
    } finally {
        // <<< Cleanup circuits.json entry >>>
        logStep("Cleaning up circuits.json entry...");
        if (originalCircuitsJsonContent !== null) { 
            try {
                // We just write back the original content we saved
                await fs.writeFile(CIRCUITS_JSON_PATH, originalCircuitsJsonContent, 'utf-8');
                // console.log(`Restored original circuits.json`);
            } catch (cleanupError) {
                console.error("Error restoring circuits.json:", cleanupError);
            }
        } else {
            console.warn("Could not read original circuits.json content, skipping cleanup.");
        }
    }
    
    // 7. Rename/Move Final Artifacts ...
    logStep("Renaming/Moving final artifacts...");
    // <<< Paths should be back to circomkit build outputs >>>
    const circomkitBuildDir = path.join(CIRCOMKIT_BUILD_DIR_BASE, circuitName);
    const sourceWasm = path.join(circomkitBuildDir, `${circuitName}_js`, `${circuitName}.wasm`); // <<< Wasm name based on circuitName
    // <<< sourceZkey and sourceVkey should point to snarkjs outputs in buildDir >>>
    const sourceZkey = zkeyFileFinalInBuild; 
    const sourceVkey = vkeyFileInBuild;

    // WASM
    try {
        await fs.rename(sourceWasm, wasmFile);
        console.log(`Moved WASM to: ${wasmFile}`);
    } catch (error: any) {
        console.error(`Error moving WASM file: ${error.message}`);
    }
    
    // ZKEY (becomes pkey)
    try {
        await fs.rename(sourceZkey, finalZkeyFile);
        console.log(`Renamed final ZKey to pkey: ${finalZkeyFile}`);
    } catch (error: any) {
        console.error(`Error renaming final ZKey: ${error.message}`);
    }
    
    // VKEY
    try {
        await fs.rename(sourceVkey, vkeyFile); 
        console.log(`Moved VKey to: ${vkeyFile}`);
    } catch (error: any) {
        console.error(`Error moving VKey file: ${error.message}`);
    }

    // <<< REMOVED intermediate build dir cleanup, circomkit might manage this >>>
    // logStep("Cleaning up intermediate build directory...");
    // try {
    //     await fs.rm(buildDir, { recursive: true, force: true }); 
    //     console.log(`Removed intermediate build directory: ${buildDir}`);
    // } catch (error: any) {
    //     console.warn(`Warning: Could not remove intermediate build directory ${buildDir}: ${error.message}`);
    // }

    logStep(`Circuit compilation and setup complete for: ${circuitName}`);
    console.log(`Final artifacts should be located in: ${ARTIFACTS_BASE_DIR}`);
}

// --- Script Execution ---
const args = process.argv.slice(2);
// const circuitIdArg = args[0]; // Old way
const requirementsPathArg = args[0]; // Expects path to requirements file

compileCircuit(requirementsPathArg); // Call with requirements path 