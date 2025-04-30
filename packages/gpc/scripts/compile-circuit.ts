import fs from 'fs/promises';
import fsSync from 'fs'; // Use synchronous fs for critical steps
import path from 'path';
import { execSync } from 'child_process';
// import { SupportedGPCCircuitParams, supportedParameterSets } from './circuitParameterSets'; // No longer needed
import { ProtoPODGPCCircuitParams, PROTO_POD_GPC_FAMILY_NAME, PROTO_POD_GPC_PUBLIC_INPUT_NAMES } from "@pcd/gpcircuits"; // Import the type, family name, and public input names
import { readJsonFile } from '../../../packages/pods/utils/fsUtils'; // For loading requirements
// import { Circomkit } from 'circomkit'; // --- No longer needed for compile/setup ---
import * as snarkjs from 'snarkjs'; // +++ Import snarkjs for programmatic API +++
import crypto from 'crypto'; // +++ Import crypto for random entropy +++
// import { Logger } from 'loglevel'; // --- REMOVE UNUSED IMPORT --- // Import Logger type if needed for snarkjs
import { SupportedGPCCircuitParams } from '../src/circuitParameterSets'; // For checking existing circuits

// --- Configuration ---
// Path to the original source file (we will include it, not modify it)
const CIRCOM_SRC_DIR = path.resolve(__dirname, '..', 'node_modules', '@pcd', 'gpcircuits', 'circuits');
const CIRCOM_SRC_FILENAME = 'proto-pod-gpc.circom';
const CIRCOM_SRC_FILE_PATH = path.join(CIRCOM_SRC_DIR, CIRCOM_SRC_FILENAME);

const ARTIFACTS_BASE_DIR = path.resolve(__dirname, '..', 'artifacts');

const GPC_COMPILE_CONFIG_PATH = path.resolve(__dirname, '..', 'gpc-compile-config.json'); // <<< UPDATED FILENAME >>>
// const ARTIFACTS_FINAL_DIR = path.join(ARTIFACTS_BASE_DIR, ARTIFACT_BASENAME); // REMOVED (unused)
const CIRCOMKIT_BUILD_DIR_BASE = path.resolve(__dirname, '..', 'build'); // Define base for build output (matches circomkit default)
const TMP_COMPILE_BASE_DIR = path.resolve(__dirname, '..', 'build', 'tmp_compile'); // <<< UPDATED LOCATION >>>

// Path to the file containing the supported parameter sets
const CIRCUIT_PARAMS_FILE_PATH = path.resolve(__dirname, '../src/circuitParameterSets.ts');

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
    // Keep this for high-level phase logging
    console.log(`
=== ${message} ===`);
}

// Keep runCommand for executing built commands
function runCommand(command: string, cwd?: string, env?: NodeJS.ProcessEnv) {
    // Keep basic execution log
    console.log(`Executing: ${command}` + (cwd ? ` in ${cwd}` : ''));
    try {
        execSync(command, { stdio: 'inherit', cwd, env: { ...process.env, ...env } });
    } catch (error: any) {
        // Keep error log
        console.error(`Error executing command: ${command}`);
        console.error(error.message);
        throw new Error(`Command failed: ${command}`);
    }
}

// +++ Re-add syncWait function (if needed later, maybe not) +++
// function syncWait(ms: number) {
//     const end = Date.now() + ms;
//     while (Date.now() < end) { /* busy wait */ }
// }

// Function to load and map requirements JSON
// Takes the *resolved* absolute path
async function loadAndMapRequirements(absoluteRequirementsPath: string): Promise<ProtoPODGPCCircuitParams> {
    // logStep(`Loading circuit requirements JSON from: ${absoluteRequirementsPath}`); // Removed
    try {
        // Use the absolute path directly
        const rawRequirements = await readJsonFile<any | null>(absoluteRequirementsPath, null);
        if (rawRequirements === null) {
            throw new Error(`Could not read or parse JSON file: ${absoluteRequirementsPath}`);
        }

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

// +++ RESTORED HELPER FUNCTIONS FOR WRAPPER +++
// Function to generate the parameter string for the main component instantiation
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
function createWrapperCircomContent(params: ProtoPODGPCCircuitParams, relativeIncludePath: string): string {
    const instantiationParams = getInstantiationParamsString(params);
    const finalPublicSignals = PROTO_POD_GPC_PUBLIC_INPUT_NAMES.join(', ');

    // Ensure the relative path uses forward slashes for Circom includes
    const circomIncludePath = relativeIncludePath.replace(/\\/g, '/');

    return `
pragma circom 2.1.8;

// Include the base template using the calculated relative path
include "${circomIncludePath}"; 

// Instantiate the main component with hardcoded parameters
component main { public [ ${finalPublicSignals} ] } = 
    ProtoPODGPC(${instantiationParams});
`;
}
// +++ END RESTORED HELPER FUNCTIONS +++

// Simple logger to mimic snarkjs verbosity
const snarkJsLogger = console; // Use console directly, or could create a conditional logger

// --- Main Compilation Logic ---
// Renamed argument for clarity
// Update return type to indicate it resolves with the buildDir path
async function compileCircuit(requirementsFilePath: string): Promise<string> {
    const circuitFamilyName = PROTO_POD_GPC_FAMILY_NAME;
    logStep(`Phase 1: Prepare for ${requirementsFilePath}`);
    
    const nodeMemoryOptionsEnv = { NODE_OPTIONS: "--max-old-space-size=16384" };
    let circuitName = ''; 
    let params: ProtoPODGPCCircuitParams;
    let compileConfig: any; // To store loaded config

    // Paths needed across phases
    let buildDir: string = "";         // Base build directory for this circuit (e.g., ./build/circuitName)
    let ptauFilePath: string = "";     // Path to the required .ptau file
    let tmpCircuitDir: string = "";    // Path to the temporary directory holding the wrapper
    let wrapperCircomFilePath: string = ""; // Full path to the temporary wrapper .circom file

    // Final artifact destination paths
    let wasmFileDest: string = "";      // Final WASM destination path
    let zkeyFileDest: string = "";      // Final ZKey (.zkey) destination path
    let vkeyFileDest: string = "";      // Final VKey (.vkey.json) destination path

    // Intermediate build artifact paths (within buildDir)
    let r1csFileBuild: string = "";
    let symFileBuild: string = "";
    let wasmDirBuild: string = "";      // Directory containing WASM output from circom
    let wasmFileBuild: string = "";     // WASM file output by circom
    let zkeyFileBuildFinal: string = ""; // Final .zkey file in build dir (after contributions)
    let vkeyFileBuild: string = "";     // .vkey.json file in build dir
    // Variables to store R1CS info
    let actualNPubInputs: number = 0;
    let actualNOutputs: number = 0;
    let actualNPrivInputs: number = 0;
    let actualNConstraints: number = 0;
    // Variable for the final artifact base name
    let finalArtifactBasename: string = '';

    if (!requirementsFilePath) {
        console.error("Error: requirementsFilePath argument required.");
        process.exit(1);
    }

    // Get CWD for relative path calculations (package root)
    const cwd = path.dirname(GPC_COMPILE_CONFIG_PATH); // Assumes config is at package root

    // Determine snarkjs logger based on config - MOVED INSIDE PHASE 1 TRY BLOCK
    let logger: any = null; // Declare logger variable outside try block
    try {
        logStep("Phase 1: Load Config, Requirements, Prepare Paths, Create Wrapper");

        // Read gpc-compile-config.json config first (sync)
        logStep("  Reading gpc-compile-config.json configuration...");
        try {
             const configContent = fsSync.readFileSync(GPC_COMPILE_CONFIG_PATH, 'utf-8');
             compileConfig = JSON.parse(configContent);
             // Set defaults for fields potentially missing in the file
             compileConfig.protocol = compileConfig.protocol || 'groth16';
             compileConfig.prime = compileConfig.prime || 'bn128';
             compileConfig.include = compileConfig.include || ['./node_modules'];
             compileConfig.optimization = compileConfig.optimization; // Keep undefined if missing
             compileConfig.inspect = compileConfig.inspect ?? true; // Default true if missing
             compileConfig.json = compileConfig.json ?? false;
             compileConfig.sym = compileConfig.sym ?? true; // Default needed for build path
             compileConfig.wasm = compileConfig.wasm ?? true; // Default needed for build path
             compileConfig.r1cs = compileConfig.r1cs ?? true; // Default needed for build path
             compileConfig.cWitness = compileConfig.cWitness ?? false;
             compileConfig.groth16numContributions = compileConfig.groth16numContributions ?? 1;
             compileConfig.groth16askForEntropy = compileConfig.groth16askForEntropy ?? false;
             logger = compileConfig.verbose ? snarkJsLogger : null;

             logStep("    Successfully read and processed gpc-compile-config.json");
        } catch (configError: any) {
             console.error(`Error reading or parsing gpc-compile-config.json: ${configError.message}`);
             process.exit(1);
        }

        const absoluteRequirementsPath = path.resolve(process.cwd(), requirementsFilePath);
        params = await loadAndMapRequirements(absoluteRequirementsPath);
        circuitName = generateCanonicalCircuitName(params);
        finalArtifactBasename = `${circuitFamilyName}_${circuitName}`;

        // +++ Check if circuitId already exists in circuitParameterSets.ts +++
        logStep(`  Checking if circuit ${circuitName} is already in ${path.basename(CIRCUIT_PARAMS_FILE_PATH)}...`);
        try {
            const paramsFileContent = fsSync.readFileSync(CIRCUIT_PARAMS_FILE_PATH, 'utf-8');
            const arrayRegex = /export\s+const\s+supportedParameterSets\s*:\s*SupportedGPCCircuitParams\[\]\s*=\s*(\[(?:.|\n|\r)*?\]);/m;
            const match = paramsFileContent.match(arrayRegex);
            if (!match || !match[1]) {
                console.warn(`  WARNING: Could not find or parse 'supportedParameterSets' array in ${path.basename(CIRCUIT_PARAMS_FILE_PATH)}. Proceeding with compilation.`);
            } else {
                const arrayString = match[1];
                let currentSets: SupportedGPCCircuitParams[] = [];
                try {
                    currentSets = new Function(`return ${arrayString};`)();
                    const exists = currentSets.some(p => p.circuitId === circuitName);
                    if (exists) {
                        logStep(`Circuit ${circuitName} already exists in supportedParameterSets. Skipping compilation.`);
                        return ""; // Return empty string to signal skip
                    } else {
                        logStep(`  Circuit ${circuitName} not found in supportedParameterSets. Proceeding with compilation.`);
                    }
                } catch (parseError: any) {
                     console.warn(`  WARNING: Could not parse 'supportedParameterSets' array from ${path.basename(CIRCUIT_PARAMS_FILE_PATH)}. Proceeding with compilation. Error: ${parseError.message}`);
                }
            }
        } catch (readFileError: any) {
            console.warn(`  WARNING: Could not read ${path.basename(CIRCUIT_PARAMS_FILE_PATH)}. Proceeding with compilation. Error: ${readFileError.message}`);
        }
        // --- End Check ---

        // Prepare Paths
        // --- Build Paths ---
        buildDir = path.join(CIRCOMKIT_BUILD_DIR_BASE, circuitName);
        r1csFileBuild = path.join(buildDir, `wrapper_${circuitName}.r1cs`);
        symFileBuild = path.join(buildDir, `wrapper_${circuitName}.sym`);
        wasmDirBuild = path.join(buildDir, `wrapper_${circuitName}_js`); // circom default WASM dir
        wasmFileBuild = path.join(wasmDirBuild, `wrapper_${circuitName}.wasm`); // circom default WASM file
        // Keep final snarkjs/circomkit names without prefix
        zkeyFileBuildFinal = path.join(buildDir, `${circuitName}.zkey`); // Final zkey name (matches circomkit)
        vkeyFileBuild = path.join(buildDir, `${circuitName}.vkey.json`); // Final vkey name (matches circomkit)

        // --- Final Artifact Paths ---
        finalArtifactBasename = `${circuitFamilyName}_${circuitName}`;
        wasmFileDest = path.join(ARTIFACTS_BASE_DIR, `${finalArtifactBasename}.wasm`);
        zkeyFileDest = path.join(ARTIFACTS_BASE_DIR, `${finalArtifactBasename}-pkey.zkey`);
        vkeyFileDest = path.join(ARTIFACTS_BASE_DIR, `${finalArtifactBasename}-vkey.json`);

        // --- Temp Wrapper Paths ---
        tmpCircuitDir = path.join(TMP_COMPILE_BASE_DIR, circuitName);
        wrapperCircomFilePath = path.join(tmpCircuitDir, `wrapper_${circuitName}.circom`);

        // Ensure build dir exists
        await fs.mkdir(buildDir, { recursive: true });

        // Get PTAU Path
        logStep("  Determining PTAU file path...");
        let ptauSize: number;
        try {
            ptauSize = compileConfig.ptau;
            const ptauDirRelative = compileConfig.dirPtau || './ptau';
            const ptauDirResolved = path.resolve(cwd, ptauDirRelative); // Resolve relative to config file
            if (typeof ptauSize !== 'number' || ptauSize <= 0) throw new Error("Invalid/missing 'ptau' size in circomkit.json");
            const ptauFilename = `powersOfTau28_hez_final_${ptauSize}.ptau`;
            ptauFilePath = path.join(ptauDirResolved, ptauFilename);
            fsSync.statSync(ptauFilePath); // SYNC CHECK PTAU EXISTS
            logStep(`  Using PTAU file: ${ptauFilePath}`);
        } catch (error: any) {
            console.error(`Error determining PTAU file path or checking existence: ${error.message}`);
            process.exit(1);
        }

        // Create Temporary Wrapper File (sync write)
        logStep(`  Creating temporary wrapper: ${wrapperCircomFilePath}`);
        try {
            fsSync.mkdirSync(tmpCircuitDir, { recursive: true });
            const relativeSrcPath = path.relative(tmpCircuitDir, CIRCOM_SRC_FILE_PATH);
            const wrapperContent = createWrapperCircomContent(params, relativeSrcPath);
            fsSync.writeFileSync(wrapperCircomFilePath, wrapperContent, 'utf-8');
            fsSync.statSync(wrapperCircomFilePath); // Sanity check wrapper file exists
            logStep("    Temporary wrapper file created and verified.");
        } catch (error: any) {
            console.error(`Error creating wrapper circom file: ${error.message}`);
            if (tmpCircuitDir) await fs.rm(tmpCircuitDir, { recursive: true, force: true }).catch(e => console.warn("Cleanup failed on error"));
            throw error;
        }

    } catch (setupError: any) {
        console.error(`An error occurred during Phase 1 (Setup): ${setupError.message}`);
        if (tmpCircuitDir) await fs.rm(tmpCircuitDir, { recursive: true, force: true }).catch(e => console.warn("Cleanup failed on error"));
        process.exit(1);
    }
    
    // === PHASE 2: Compile (circom), Setup (snarkjs API) ===
    try {
        logStep("Phase 2: Compile (circom) and Setup (snarkjs)");

        // Compile using circom directly (using runCommand)
        logStep(`  Compiling wrapper '${circuitName}' using direct circom command...`);
        try {
            const circomExecutable = compileConfig.circomPath || 'circom';
            const flags: string[] = [];
            flags.push(`--output ${path.relative(cwd, buildDir)}`);
            flags.push(`--prime ${compileConfig.prime}`);
            compileConfig.include.forEach((incPath: string) => {
                flags.push(`-l ${path.resolve(cwd, incPath)}`);
            });
            if (compileConfig.r1cs) flags.push("--r1cs");
            if (compileConfig.sym) flags.push("--sym");
            if (compileConfig.wasm) flags.push("--wasm");
            if (compileConfig.json) flags.push("--json");
            if (compileConfig.cWitness) flags.push("--c");
            if (compileConfig.inspect) flags.push("--inspect");
            const optLevel = compileConfig.optimization;
            if (optLevel !== undefined && typeof optLevel === 'number') {
                 if (optLevel >= 0 && optLevel <= 2) flags.push(`--O${optLevel}`);
                 else if (optLevel > 2) flags.push(`--O2round ${optLevel}`);
            }
            const circomCommand = `${circomExecutable} ${wrapperCircomFilePath} ${flags.join(" ")}`;
            runCommand(circomCommand, cwd, nodeMemoryOptionsEnv);
            logStep(`  Circom compilation finished.`);
            fsSync.statSync(r1csFileBuild);
            logStep(`    Verified R1CS file exists: ${r1csFileBuild}`);

            // Get R1CS info programmatically
            logStep(`    Reading R1CS info...`);
            const r1csInfo = await snarkjs.r1cs.info(r1csFileBuild, logger);
            logStep(`      Found ${r1csInfo.nPubInputs} Public Inputs, ${r1csInfo.nOutputs} Outputs, ${r1csInfo.nConstraints} Constraints.`);
            // Store for later verification in higher scope
            actualNPrivInputs = r1csInfo.nPrvInputs;
            actualNPubInputs = r1csInfo.nPubInputs;
            actualNOutputs = r1csInfo.nOutputs;
            actualNConstraints = r1csInfo.nConstraints;

        } catch (compileError: any) {
            console.error(`Error during direct circom compilation: ${compileError.message}`);
            throw compileError;
        }

        // Setup using snarkjs Programmatic API
        logStep("  Performing phase 2 setup using snarkjs...");
        try {
            if (compileConfig.protocol === 'groth16') {
                const numContributions = compileConfig.groth16numContributions;
                let currentZkeyPath = path.join(buildDir, `${circuitName}_0.zkey`);

                // 1. New Key
                logStep(`    Generating initial zkey...`);
                await snarkjs.zKey.newZKey(r1csFileBuild, ptauFilePath, currentZkeyPath, logger);
                fsSync.statSync(currentZkeyPath);
                logStep(`      Generated initial zkey: ${currentZkeyPath}`);

                // 2. Contributions
                for (let i = 1; i <= numContributions; i++) {
                    const nextZkeyPath = path.join(buildDir, `${circuitName}_${i}.zkey`);
                    const contributionName = `${circuitName}_${i}`;
                    let entropy: Buffer | undefined;
                    if (!compileConfig.groth16askForEntropy) {
                        entropy = crypto.randomBytes(32);
                        logStep(`    Making contribution ${i}...`);
                    } else {
                        logStep(`   WARN:  Making contribution ${i} (entropy prompt not well supported programmatically)...`);
                    }
                    await snarkjs.zKey.contribute(currentZkeyPath, nextZkeyPath, contributionName, entropy, logger);
                    fsSync.statSync(nextZkeyPath);
                    logStep(`      Generated contribution key: ${nextZkeyPath}`);
                    logStep(`      Removing intermediate key: ${currentZkeyPath}`);
                    fsSync.unlinkSync(currentZkeyPath);
                    currentZkeyPath = nextZkeyPath;
                }
                logStep(`    Finished ${numContributions} contribution(s). Final intermediate key: ${currentZkeyPath}`);

                // 3. Rename final intermediate key
                logStep(`    Renaming ${currentZkeyPath} to ${zkeyFileBuildFinal}`);
                fsSync.renameSync(currentZkeyPath, zkeyFileBuildFinal);
                fsSync.statSync(zkeyFileBuildFinal);

                // 4. Export Verification Key
                logStep(`    Exporting verification key...`);
                const vKeyData = await snarkjs.zKey.exportVerificationKey(zkeyFileBuildFinal, logger);
                fsSync.writeFileSync(vkeyFileBuild, JSON.stringify(vKeyData, null, 2), 'utf-8');
                fsSync.statSync(vkeyFileBuild);
                logStep(`      Exported verification key: ${vkeyFileBuild}`);

            } else if (compileConfig.protocol === 'plonk' || compileConfig.protocol === 'fflonk') {
                // Plonk or FFLONK setup
                 logStep(`    Setting up ${compileConfig.protocol}...`);
                 await snarkjs[compileConfig.protocol as 'plonk' | 'fflonk'].setup(r1csFileBuild, ptauFilePath, zkeyFileBuildFinal, logger);
                 fsSync.statSync(zkeyFileBuildFinal);
                 logStep(`      Generated ${compileConfig.protocol.toUpperCase()} final key: ${zkeyFileBuildFinal}`);

                 // Export Verification Key
                 logStep(`    Exporting verification key...`);
                 const vKeyData = await snarkjs.zKey.exportVerificationKey(zkeyFileBuildFinal, logger);
                 fsSync.writeFileSync(vkeyFileBuild, JSON.stringify(vKeyData, null, 2), 'utf-8');
                 fsSync.statSync(vkeyFileBuild);
                 logStep(`      Exported verification key: ${vkeyFileBuild}`);

            } else {
                throw new Error(`Unsupported protocol in gpc-compile-config.json: ${compileConfig.protocol}`);
            }
            logStep(`  Snarkjs setup phase finished.`);

        } catch (setupError: any) {
            console.error(`Error during snarkjs setup (API): ${setupError.message}`);
            console.error(setupError.stack);
            throw setupError;
        }
    } catch (error: any) {
        console.error(`An error occurred during Phase 2 (Compile/Setup): ${error.message}`);
        throw error;
    } finally {
        // Cleanup Temp Wrapper Dir
        if (tmpCircuitDir && fsSync.existsSync(tmpCircuitDir)) {
            logStep("Phase 2 Cleanup: Removing temporary wrapper directory...");
            try {
                 await fs.rm(tmpCircuitDir, { recursive: true, force: true });
                 console.log(`  Temporary wrapper directory removed: ${tmpCircuitDir}`);
            } catch (rmError: any) {
                 console.warn(`Warning: Could not remove temporary wrapper directory ${tmpCircuitDir}: ${rmError.message}`);
            }
        } else {
             console.log("Phase 2 Cleanup: Temporary wrapper directory not found or already removed.");
        }
    }

    // === PHASE 3: Move Artifacts ===
    try {
        logStep("Phase 3: Move Artifacts");
        await fs.mkdir(ARTIFACTS_BASE_DIR, { recursive: true });

        // --- Move R1CS ---
        const r1csFileDestDir = path.join(ARTIFACTS_BASE_DIR, circuitName);
        const r1csFileDestPath = path.join(r1csFileDestDir, `${circuitName}.r1cs`);
        logStep(`  Moving R1CS to ${r1csFileDestPath}`);
        try {
            await fs.mkdir(r1csFileDestDir, { recursive: true });
            fsSync.statSync(r1csFileBuild);
            fsSync.renameSync(r1csFileBuild, r1csFileDestPath);
            console.log(`  Moved R1CS successfully.`);
        } catch (r1csError: any) {
            console.error(`  ERROR moving R1CS: ${r1csError.message}`);
            throw new Error(`Failed to move R1CS: ${r1csError.message}`);
        }

        // Define source paths for other artifacts
        const sourceWasm = wasmFileBuild;
        const sourceZkey = zkeyFileBuildFinal;
        const sourceVkey = vkeyFileBuild;

        // --- Move WASM ---
        logStep(`  Moving WASM to ${wasmFileDest}`);
        try {
            fsSync.statSync(sourceWasm);
            fsSync.renameSync(sourceWasm, wasmFileDest);
            console.log(`  Moved WASM successfully.`);
        } catch (wasmError: any) {
            console.error(`  ERROR moving WASM: ${wasmError.message}`);
            throw new Error(`Failed to move WASM: ${wasmError.message}`);
        }

        // --- Move final ZKEY (pkey) ---
        logStep(`  Moving ZKey to ${zkeyFileDest}`);
        try {
            fsSync.statSync(sourceZkey);
            fsSync.renameSync(sourceZkey, zkeyFileDest);
            console.log(`  Moved final ZKey (pkey) successfully.`);
        } catch (zkeyError: any) {
            console.error(`Error moving final ZKey (pkey): ${zkeyError.message}`);
            throw zkeyError;
        }

        // --- Move VKEY ---
        logStep(`  Moving VKey to ${vkeyFileDest}`);
        try {
            fsSync.statSync(sourceVkey);
            fsSync.renameSync(sourceVkey, vkeyFileDest);
            console.log(`  Moved VKey successfully.`);
        } catch (vkeyError: any) {
            console.error(`Error moving VKey: ${vkeyError.message}`);
            throw vkeyError;
        }

    } catch (error: any) {
        console.error(`An error occurred during Phase 3 (Move Artifacts): ${error.message}`);
        throw error;
    }

    // Cleanup tmp_compile base directory
    // Only cleanup buildDir if it was resolved (i.e., compilation wasn't skipped)
    if (buildDir && buildDir !== "") {
        // +++ Cleanup build directory AFTER everything else +++
        if (fsSync.existsSync(buildDir)) {
            logStep(`Cleaning up final build directory: ${buildDir}...`);
            try {
                await fs.rm(buildDir, { recursive: true, force: true });
            } catch(rmError: any) {
                console.warn(`  Warning: Could not remove build directory ${buildDir}: ${rmError.message}`);
            }
        }

        // +++ Cleanup tmp_compile base directory +++
        if (TMP_COMPILE_BASE_DIR && fsSync.existsSync(TMP_COMPILE_BASE_DIR)) {
             logStep(`Cleaning up tmp_compile base directory: ${TMP_COMPILE_BASE_DIR}...`);
             try {
                 await fs.rmdir(TMP_COMPILE_BASE_DIR);
             } catch (rmDirError: any) {
                 if (rmDirError.code !== 'ENOTEMPTY') {
                      console.warn(`  Warning: Could not remove tmp_compile base directory ${TMP_COMPILE_BASE_DIR}: ${rmDirError.message}`);
                 }
             }
        }
    } else if (buildDir === "") {
         logStep("Compilation skipped, no build directory cleanup needed.");
    } else {
         logStep("Build directory path invalid or missing, skipping cleanup.");
    }

    return buildDir;
}

// Export the function for use in other modules
export { compileCircuit };

// --- Script Execution ---
const args = process.argv.slice(2);
const requirementsPathArg = args[0];
if (!requirementsPathArg) {
    console.error("Usage: node <script.js> <path/to/requirements.json>");
    process.exit(1);
}

// Use a .then/.catch structure for top-level async call
compileCircuit(requirementsPathArg)
    .then(async (resolvedBuildDir) => {
        logStep("Terminating snarkjs workers...");
        // Terminate snarkjs workers if possible
        if (typeof (snarkjs as any)?.thread?.terminateAll === 'function') {
            await (snarkjs as any).thread.terminateAll();
        }

        // Cleanup build directory and tmp_compile base
        // Only attempt cleanup if compilation wasn't skipped (resolvedBuildDir is not empty)
        if (resolvedBuildDir && resolvedBuildDir !== "") {
            // Cleanup build directory for the specific circuit
            if (fsSync.existsSync(resolvedBuildDir)) {
                logStep(`Cleaning up final build directory: ${resolvedBuildDir}...`);
                try {
                    await fs.rm(resolvedBuildDir, { recursive: true, force: true });
                } catch(rmError: any) {
                    console.warn(`  Warning: Could not remove build directory ${resolvedBuildDir}: ${rmError.message}`);
                }
            }

            // Cleanup tmp_compile base directory
            if (TMP_COMPILE_BASE_DIR && fsSync.existsSync(TMP_COMPILE_BASE_DIR)) {
                 logStep(`Cleaning up tmp_compile base directory: ${TMP_COMPILE_BASE_DIR}...`);
                 try {
                     await fs.rmdir(TMP_COMPILE_BASE_DIR);
                 } catch (rmDirError: any) {
                     if (rmDirError.code !== 'ENOTEMPTY') {
                          console.warn(`  Warning: Could not remove tmp_compile base directory ${TMP_COMPILE_BASE_DIR}: ${rmDirError.message}`);
                     }
                 }
            }
        } else if (resolvedBuildDir === "") {
             logStep("Compilation skipped, no build directory cleanup needed.");
        } else {
            // This case shouldn't ideally be reached
             logStep("Build directory path invalid or missing, skipping cleanup.");
        }

        console.log(`\nScript finished successfully for ${requirementsPathArg}.`);
        process.exit(0);
    })
    .catch(async (error) => {
        console.error("\nScript failed:", error.message);
        logStep("Terminating snarkjs workers due to error...");
         if (typeof (snarkjs as any)?.thread?.terminateAll === 'function') {
            await (snarkjs as any).thread.terminateAll();
        }
        // Attempt tmp_compile base cleanup on error too
         if (TMP_COMPILE_BASE_DIR && fsSync.existsSync(TMP_COMPILE_BASE_DIR)) {
             logStep(`Cleaning up tmp_compile base directory after error: ${TMP_COMPILE_BASE_DIR}...`);
             try {
                 await fs.rmdir(TMP_COMPILE_BASE_DIR);
                 logStep("  Removed tmp_compile base directory.");
             } catch (rmDirError: any) {
                  if (rmDirError.code !== 'ENOTEMPTY') {
                      console.warn(`  Warning: Could not remove tmp_compile base directory ${TMP_COMPILE_BASE_DIR}: ${rmDirError.message}`);
                 } else {
                      logStep("  tmp_compile base directory not empty.");
                 }
             }
        }
        process.exit(1);
    });