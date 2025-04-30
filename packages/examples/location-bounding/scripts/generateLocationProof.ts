import fs from 'fs/promises';
import path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';

// --- Define Directories relative to Workspace Root ---
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..'); // Assumes script is in packages/pkg/sub-dir/scripts

// Define base directories relative to the workspace root
const GPC_PKG_DIR = path.join(WORKSPACE_ROOT, 'packages', 'gpc');
const MOCK_PKG_DIR = path.join(WORKSPACE_ROOT, 'packages', 'examples'); // Use the correct package name

const GPC_SCRIPTS_DIR = path.join(GPC_PKG_DIR, 'scripts');
const GPC_PROOF_CONFIGS_DIR = path.join(GPC_PKG_DIR, 'proof-configs'); // Used for constructing paths below
const GPC_PROOF_REQS_DIR = path.join(GPC_PKG_DIR, 'proof-requirements');
const GPC_PROOF_INPUTS_DIR = path.join(GPC_PKG_DIR, 'proof-inputs');
const GPC_PROOFS_DIR = path.join(GPC_PKG_DIR, 'proofs');
const GPC_ARTIFACTS_DIR = path.join(GPC_PKG_DIR, 'artifacts');

const POD_DATA_DIR = path.join(MOCK_PKG_DIR, 'pod-data');
const OUTPUT_PROOF_DATA_DIR = path.resolve(__dirname, '..', 'proof-output');

// --- Helper Functions ---

function logStep(message: string) {
  console.log(`\n=== STEP: ${message} ===`);
}

// Helper to run shell commands synchronously and handle errors
function runCommand(command: string, stepName: string, cwd?: string) {
  console.log(`Executing: ${command}` + (cwd ? ` in ${cwd}` : ''));
  try {
    // Use stdio: 'inherit' to see the output of the scripts directly
    execSync(command, { stdio: 'inherit', encoding: 'utf-8', cwd: cwd });
    console.log(`Command for '${stepName}' executed successfully.`);
  } catch (error: any) {
    console.error(`\n--- ERROR during '${stepName}' ---`);
    console.error(`Command failed: ${command}`);
    // Error message might be in stderr, which isn't captured by default in execSync error
    // If stdio was 'pipe', error.stderr would contain it.
    // With 'inherit', the error output should appear directly in the console.
    console.error("Error output (if any) should be visible above.");
    process.exit(1);
  }
}

// Helper to run shell command and capture output
function runCommandAndCapture(command: string, stepName: string, cwd?: string): string {
    console.log(`Executing: ${command}` + (cwd ? ` in ${cwd}` : ''));
    try {
        // Use stdio: 'pipe' to capture stdout/stderr
        const options: ExecSyncOptionsWithStringEncoding = {
            stdio: ['inherit', 'pipe', 'pipe'], // inherit stdin, pipe stdout/stderr
            encoding: 'utf-8',
            cwd: cwd
        };
        const output = execSync(command, options);
        console.log(`Command for '${stepName}' executed successfully.`);
        console.log(`Output for '${stepName}':\n${output}`);
        return output;
    } catch (error: any) {
        console.error(`\n--- ERROR during '${stepName}' ---`);
        console.error(`Command failed: ${command}`);
        if (error.stdout) {
          console.error("STDOUT:", error.stdout);
        }
        if (error.stderr) {
          console.error("STDERR:", error.stderr);
        }
        process.exit(1);
    }
}

// --- Main Orchestration Logic ---

async function runLocationProofFlow(relativeConfigPath: string, relativeParamsPath: string) {
  logStep(`Starting Full GPC Flow for Location Proof`);

  // 1. Resolve Input Paths relative to the examples package directory
  const proofConfigPath = path.resolve(MOCK_PKG_DIR, relativeConfigPath);
  const paramsPath = path.resolve(MOCK_PKG_DIR, relativeParamsPath);
  const configBaseName = path.basename(proofConfigPath, path.extname(proofConfigPath));

  console.log(`Using Proof Config: ${proofConfigPath}`);
  console.log(`Using Params File: ${paramsPath}`);
  console.log(`Config Base Name: ${configBaseName}`);

  // Define expected absolute paths for intermediate/output files based on config name & WORKSPACE_ROOT based dirs
  const requirementsPath = path.join(GPC_PROOF_REQS_DIR, `${configBaseName}_requirements.json`);
  const gpcInputsPath = path.join(GPC_PROOF_INPUTS_DIR, `${configBaseName}_gpc_inputs.json`);
  const proofOutputPathInGPC = path.join(GPC_PROOFS_DIR, `${configBaseName}_proof.json`); // Proof file in gpc/proofs

  // --- Clean up previous intermediate files ---
  logStep("Clean up previous intermediate files (if any)");
  try {
    await fs.rm(requirementsPath, { force: true });
    console.log(`  - Removed ${path.basename(requirementsPath)}`);
    await fs.rm(gpcInputsPath, { force: true });
    console.log(`  - Removed ${path.basename(gpcInputsPath)}`);
    await fs.rm(proofOutputPathInGPC, { force: true });
    console.log(`  - Removed ${path.basename(proofOutputPathInGPC)}`);
  } catch (error: any) {
    console.warn(`Warning: Could not clean up all intermediate files. Error: ${error.message}`);
    // Continue execution even if cleanup fails partially
  }

  // --- Execute GPC Workflow Steps ---

  // <<< Calculate relative paths for script arguments >>>
  const relativeConfigPathFromGPC = path.relative(GPC_PKG_DIR, proofConfigPath);
  const relativeParamsPathFromGPC = path.relative(GPC_PKG_DIR, paramsPath);
  const relativeRequirementsPath = path.relative(GPC_PKG_DIR, requirementsPath); // Path to file within GPC pkg
  const relativeGpcInputsPath = path.relative(GPC_PKG_DIR, gpcInputsPath); // Path to file within GPC pkg
  const relativeProofOutputPathInGPC = path.relative(GPC_PKG_DIR, proofOutputPathInGPC); // Path relative to GPC

  // Step 1: Generate Standardized GPC Proof Inputs (using config and params)
  logStep("Generate Standardized GPC Proof Inputs");
  runCommand(
    // <<< Use relative paths, run in GPC_PKG_DIR >>>
    `ts-node ${path.join("scripts", 'gen-proof-inputs.ts')} "${relativeConfigPathFromGPC}" "${relativeParamsPathFromGPC}"`,
    "Generate GPC Inputs",
    GPC_PKG_DIR // <<< Set CWD
  );

  // Step 2: Generate Requirements (using config and the generated GPC inputs file)
  logStep("Generate Proof Requirements");
  runCommand(
    // <<< Use relative paths, run in GPC_PKG_DIR >>>
    `ts-node ${path.join("scripts", 'gen-proof-requirements.ts')} "${relativeConfigPathFromGPC}" "${relativeGpcInputsPath}"`,
    "Generate Requirements",
    GPC_PKG_DIR // <<< Set CWD
  );

  // Step 3: Find Circuit (based on requirements file)
  logStep("Find Suitable Circuit");
  const findCircuitOutput = runCommandAndCapture(
    // <<< Use relative path, run in GPC_PKG_DIR >>>
    `ts-node ${path.join("scripts", 'find-circuit.ts')} "${relativeRequirementsPath}"`,
    "Find Circuit",
    GPC_PKG_DIR // <<< Set CWD
  );

  // Step 4 & 5: Compile Circuit and Add Params (if needed)
  if (findCircuitOutput.includes("COMPILE_NEEDED")) {
    logStep("Compile Circuit (COMPILE_NEEDED detected)");
    runCommand(
      // <<< Use relative path, run in GPC_PKG_DIR >>>
      `ts-node ${path.join("scripts", 'compile-circuit.ts')} "${relativeRequirementsPath}"`,
      "Compile Circuit",
      GPC_PKG_DIR // <<< Set CWD
    );

    logStep("Add Compiled Circuit Parameters");
    runCommand(
      // <<< Use relative path, run in GPC_PKG_DIR >>>
      `ts-node ${path.join("scripts", 'add-compiled-circuit-params.ts')} "${relativeRequirementsPath}"`,
      "Add Circuit Params",
      GPC_PKG_DIR // <<< Set CWD
    );
  } else {
    logStep("Suitable pre-compiled circuit found. Skipping compile/add steps.");
  }

  // Step 6: Generate Proof (using config and the GPC inputs file)
  logStep("Generate GPC Proof");
  runCommand(
    `NODE_OPTIONS=--max-old-space-size=32768 ts-node ${path.join(GPC_SCRIPTS_DIR, 'gen-proof.ts')} "${proofConfigPath}" "${gpcInputsPath}"`,
    "Generate Proof"
  );

  // Step 7: Find and Copy Proof File to Local Example Output
  logStep("Find and Copy Proof File");
  let generatedProofFilename = '';
  let sourceProofPath = '';
  let localProofOutputPath = '';
  try {
      const proofFiles = await fs.readdir(GPC_PROOFS_DIR);
      generatedProofFilename = proofFiles.find(f => f.startsWith(configBaseName) && f.endsWith('_proof.json')) ?? '';
      if (!generatedProofFilename) {
          throw new Error(`Could not find generated proof file starting with '${configBaseName}' in ${GPC_PROOFS_DIR}`);
      }
      sourceProofPath = path.join(GPC_PROOFS_DIR, generatedProofFilename);
      console.log(`Found generated proof: ${sourceProofPath}`);

      await fs.mkdir(OUTPUT_PROOF_DATA_DIR, { recursive: true });
      localProofOutputPath = path.join(OUTPUT_PROOF_DATA_DIR, generatedProofFilename);
      await fs.copyFile(sourceProofPath, localProofOutputPath);
      console.log(`Copied proof to local output: ${localProofOutputPath}`);

  } catch (error: any) {
      console.error(`Error finding/copying proof file: ${error.message}`);
      process.exit(1);
  }

  // Step 8: Verify Proof (using the local copy)
  logStep("Verify GPC Proof");
  // <<< Verification needs the proof path relative to GPC_PKG_DIR >>>
  const relativeProofPathForVerify = path.relative(GPC_PKG_DIR, localProofOutputPath);
  runCommand(
    `ts-node ${path.join(GPC_SCRIPTS_DIR, 'verify-proof.ts')} "${localProofOutputPath}"`,
    "Verify Proof"
  );

  logStep(`--- Full GPC Flow for ${configBaseName} Completed Successfully! ---`);
  console.log(`Final proof available at: ${sourceProofPath}`);
}

// --- Script Execution ---
const args = process.argv.slice(2);
const configArg = args[0];
const paramsArg = args[1];

if (!configArg || !paramsArg) {
  console.error("Usage: ts-node scripts/generateLocationProof.ts <path/to/proofConfig.ts> <path/to/params.json>");
  console.error("  (Paths should be relative to the 'packages/examples' directory or absolute)");
  process.exit(1);
}

runLocationProofFlow(configArg, paramsArg).catch(error => {
  console.error("\n--- UNHANDLED ERROR during Location proof flow ---");
  console.error(error);
  process.exit(1);
}); 