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
function runCommand(command: string, stepName: string) {
  console.log(`Executing: ${command}`);
  try {
    // Use stdio: 'inherit' to see the output of the scripts directly
    execSync(command, { stdio: 'inherit', encoding: 'utf-8' });
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
function runCommandAndCapture(command: string, stepName: string): string {
    console.log(`Executing: ${command}`);
    try {
        // Use stdio: 'pipe' to capture stdout/stderr
        const options: ExecSyncOptionsWithStringEncoding = {
            stdio: ['inherit', 'pipe', 'pipe'], // inherit stdin, pipe stdout/stderr
            encoding: 'utf-8'
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

async function runDistanceProofFlow(relativeConfigPath: string, relativePodsPath: string) {
  logStep(`Starting Full GPC Flow for Distance Proof`);

  // 1. Resolve Input Paths relative to the examples package directory
  const proofConfigPath = path.resolve(MOCK_PKG_DIR, relativeConfigPath);
  const inputPodsPath = path.resolve(MOCK_PKG_DIR, relativePodsPath);
  const configBaseName = path.basename(proofConfigPath, path.extname(proofConfigPath));

  console.log(`Using Proof Config: ${proofConfigPath}`);
  console.log(`Using Input PODs: ${inputPodsPath}`);
  console.log(`Config Base Name: ${configBaseName}`);

  // Define expected absolute paths for intermediate/output files based on config name & WORKSPACE_ROOT based dirs
  const requirementsPath = path.join(GPC_PROOF_REQS_DIR, `${configBaseName}_requirements.json`);
  const gpcInputsPath = path.join(GPC_PROOF_INPUTS_DIR, `${configBaseName}_gpc_inputs.json`);
  const proofOutputPath = path.join(GPC_PROOFS_DIR, `${configBaseName}_proof.json`); // Expected proof output name

  // --- Clean up previous intermediate files ---
  logStep("Clean up previous intermediate files (if any)");
  try {
    await fs.rm(requirementsPath, { force: true });
    console.log(`  - Removed ${path.basename(requirementsPath)}`);
    await fs.rm(gpcInputsPath, { force: true });
    console.log(`  - Removed ${path.basename(gpcInputsPath)}`);
    await fs.rm(proofOutputPath, { force: true });
    console.log(`  - Removed ${path.basename(proofOutputPath)}`);
  } catch (error: any) {
    console.warn(`Warning: Could not clean up all intermediate files. Error: ${error.message}`);
    // Continue execution even if cleanup fails partially
  }

  // --- Execute GPC Workflow Steps ---

  // Step 1: Generate Requirements
  logStep("Generate Proof Requirements");
  // Pass the *absolute* paths to the sub-script
  runCommand(
    `ts-node ${path.join(GPC_SCRIPTS_DIR, 'gen-proof-requirements.ts')} "${proofConfigPath}" "${inputPodsPath}"`,
    "Generate Requirements"
  );

  // Step 2: Find Circuit
  logStep("Find Suitable Circuit");
  // Pass the *absolute* requirements path
  const findCircuitOutput = runCommandAndCapture(
    `ts-node ${path.join(GPC_SCRIPTS_DIR, 'find-circuit.ts')} "${requirementsPath}"`,
    "Find Circuit"
  );

  // Step 3 & 4: Compile Circuit and Add Params (if needed)
  if (findCircuitOutput.includes("COMPILE_NEEDED")) {
    logStep("Compile Circuit (COMPILE_NEEDED detected)");
    // Pass the *absolute* requirements path
    runCommand(
      `ts-node ${path.join(GPC_SCRIPTS_DIR, 'compile-circuit.ts')} "${requirementsPath}"`,
      "Compile Circuit"
    );

    logStep("Add Compiled Circuit Parameters");
    // Pass the *absolute* requirements path
    runCommand(
      `ts-node ${path.join(GPC_SCRIPTS_DIR, 'add-compiled-circuit-params.ts')} "${requirementsPath}"`,
      "Add Circuit Params"
    );
  } else {
    logStep("Suitable pre-compiled circuit found. Skipping compile/add steps.");
  }

  // Step 5: Generate GPC Proof Inputs
  logStep("Generate GPC Proof Inputs");
  // Pass the *absolute* paths
  runCommand(
    `ts-node ${path.join(GPC_SCRIPTS_DIR, 'gen-proof-inputs.ts')} "${proofConfigPath}" "${inputPodsPath}"`,
    "Generate GPC Inputs"
  );

  // Step 6: Generate Proof
  logStep("Generate GPC Proof");
  // Pass the *absolute* paths
  runCommand(
    `NODE_OPTIONS=--max-old-space-size=16384 ts-node ${path.join(GPC_SCRIPTS_DIR, 'gen-proof.ts')} "${proofConfigPath}" "${gpcInputsPath}"`,
    "Generate Proof"
  );

  // Step 7: Find and Copy Proof File
  logStep("Find and Copy Proof File");
  let generatedProofFilename = '';
  let generatedProofPath = '';
  try {
      const proofFiles = await fs.readdir(GPC_PROOFS_DIR);
      generatedProofFilename = proofFiles.find(f => f.startsWith(configBaseName) && f.endsWith('_proof.json')) ?? '';
      if (!generatedProofFilename) {
          throw new Error(`Could not find generated proof file starting with '${configBaseName}' in ${GPC_PROOFS_DIR}`);
      }
      generatedProofPath = path.join(GPC_PROOFS_DIR, generatedProofFilename);
      console.log(`Found generated proof: ${generatedProofPath}`);

      await fs.mkdir(OUTPUT_PROOF_DATA_DIR, { recursive: true });
      const localProofOutputPath = path.join(OUTPUT_PROOF_DATA_DIR, generatedProofFilename);
      await fs.copyFile(generatedProofPath, localProofOutputPath);
      console.log(`Copied proof to local output: ${localProofOutputPath}`);

      // Use the local path for verification
      generatedProofPath = localProofOutputPath;

  } catch (error: any) {
      console.error(`Error finding/copying proof file: ${error.message}`);
      process.exit(1);
  }

  // Step 8: Verify Proof (using the local copy)
  logStep("Verify GPC Proof");
  runCommand(
    `ts-node ${path.join(GPC_SCRIPTS_DIR, 'verify-proof.ts')} "${generatedProofPath}"`,
    "Verify Proof"
  );

  logStep(`--- Full GPC Flow for ${configBaseName} Completed Successfully! ---`);
  console.log(`Final proof available at: ${generatedProofPath}`);
}

// --- Script Execution ---
const args = process.argv.slice(2);
const configArg = args[0];
const podsArg = args[1];

if (!configArg || !podsArg) {
  console.error("Usage: ts-node scripts/generateDistanceProof.ts <path/to/proofConfig.ts> <path/to/inputPods.json>");
  console.error("  (Paths should be relative to the workspace root or absolute)");
  process.exit(1);
}

runDistanceProofFlow(configArg, podsArg).catch(error => {
  console.error("\n--- UNHANDLED ERROR during distance proof flow ---");
  console.error(error);
  process.exit(1);
}); 