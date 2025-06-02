import fs from 'fs/promises';
import path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';

// --- Define Directories relative to Workspace Root ---
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..'); // Assumes script is in packages/pkg/sub-dir/scripts

// Define base directories relative to the workspace root
const GPC_PKG_DIR = path.join(WORKSPACE_ROOT, 'packages', 'gpc');
const MOCK_PKG_DIR = path.join(WORKSPACE_ROOT, 'packages', 'examples'); // Use the correct package name

const GPC_SCRIPTS_DIR = path.join(GPC_PKG_DIR, 'scripts');

const GPC_PROOF_REQS_DIR = path.join(GPC_PKG_DIR, 'proof-requirements');
const GPC_PROOF_INPUTS_DIR = path.join(GPC_PKG_DIR, 'proof-inputs');
const GPC_PROOFS_DIR = path.join(GPC_PKG_DIR, 'proofs');

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
  const proofOutputDirInGPC = GPC_PROOFS_DIR; // Directory where proofs are placed
  // Define inventory-specific paths for cleanup
  const inventoryRequirementsPath = path.join(GPC_PROOF_REQS_DIR, `inventoryProofConfig_requirements.json`);
  const inventoryGpcInputsPath = path.join(GPC_PROOF_INPUTS_DIR, `inventoryProofConfig_gpc_inputs.json`);

  // --- Clean up previous intermediate files AND potential old proof files ---
  logStep("Clean up previous intermediate files and potential old proofs (if any)");
  try {
    // Location proof files
    await fs.rm(requirementsPath, { force: true });
    console.log(`  - Removed ${path.basename(requirementsPath)} (if existed)`);
    await fs.rm(gpcInputsPath, { force: true });
    console.log(`  - Removed ${path.basename(gpcInputsPath)} (if existed)`);
    // Inventory proof files
    await fs.rm(inventoryRequirementsPath, { force: true });
    console.log(`  - Removed ${path.basename(inventoryRequirementsPath)} (if existed)`);
    await fs.rm(inventoryGpcInputsPath, { force: true });
    console.log(`  - Removed ${path.basename(inventoryGpcInputsPath)} (if existed)`);

    // Delete existing proofs (combined, proof, public) matching the config base names
    const filesInProofDir = await fs.readdir(proofOutputDirInGPC);
    const prefixesToRemove = [configBaseName, 'inventoryProofConfig']; // Add prefixes here
    let removedCount = 0;
    for (const prefix of prefixesToRemove) {
        const oldProofFiles = filesInProofDir.filter(f =>
            f.startsWith(prefix) && (f.endsWith('_combined.json') || f.endsWith('_proof.json') || f.endsWith('_public.json'))
        );
        if (oldProofFiles.length > 0) {
            console.log(`  - Found potential old proof files for prefix '${prefix}': ${oldProofFiles.join(', ')}`);
            for (const oldProofFile of oldProofFiles) {
                const fullPath = path.join(proofOutputDirInGPC, oldProofFile);
                await fs.rm(fullPath, { force: true });
                console.log(`    - Removed ${oldProofFile}`);
                removedCount++;
            }
        } else {
            console.log(`  - No old proof files found matching '${prefix}_*.(combined|proof|public).json' in ${proofOutputDirInGPC}.`);
        }
    }
    if (removedCount === 0) {
        console.log(`  - No old proof files found to remove.`);
    }

  } catch (error: any) {
    // It's okay if files don't exist, but log other errors
    if (error.code !== 'ENOENT') {
        console.warn(`Warning: Could not clean up all files. Error: ${error.message}`);
    } else {
        console.log(`  - Some files did not exist, no removal needed.`);
    }
    // Continue execution even if cleanup fails partially
  }

  // --- Execute GPC Workflow Steps ---

  // <<< Calculate relative paths for script arguments >>>
  const relativeConfigPathFromGPC = path.relative(GPC_PKG_DIR, proofConfigPath);
  const relativeParamsPathFromGPC = path.relative(GPC_PKG_DIR, paramsPath);
  const relativeRequirementsPath = path.relative(GPC_PKG_DIR, requirementsPath); // Path to file within GPC pkg
  const relativeGpcInputsPath = path.relative(GPC_PKG_DIR, gpcInputsPath); // Path to file within GPC pkg

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

  // <<< Parse circuit name from find output >>>
  let foundCircuitName = '';
  const findMatch = findCircuitOutput.match(/^CIRCUIT_NAME:\s*([\w\-]+)/m);
  if (findMatch && findMatch[1]) {
      foundCircuitName = findMatch[1];
      console.log(`  Parsed found circuit name: ${foundCircuitName}`);
  } else {
      console.log("  Could not parse CIRCUIT_NAME from find-circuit output.");
      // Continue, COMPILE_NEEDED might be present
  }

  // Step 4 & 5: Compile Circuit and Add Params (if needed)
  let compileCircuitOutput = '';
  let needsCompile = findCircuitOutput.includes("COMPILE_NEEDED");

  if (needsCompile) {
    logStep("Compile Circuit (COMPILE_NEEDED detected)");
    // <<< Use runCommandAndCapture for compile >>>
    compileCircuitOutput = runCommandAndCapture(
      `ts-node ${path.join("scripts", 'compile-circuit.ts')} "${relativeRequirementsPath}"`,
      "Compile Circuit",
      GPC_PKG_DIR // <<< Set CWD
    );

    logStep("Adding Compiled Circuit Parameters to Available Circuits List");
    runCommand(
      // <<< Use relative path, run in GPC_PKG_DIR >>>
      `ts-node ${path.join("scripts", 'add-compiled-circuit-params.ts')} "${relativeRequirementsPath}"`,
      "Add Circuit Params",
      GPC_PKG_DIR // <<< Set CWD
    );
  } else {
    logStep("Suitable pre-compiled circuit found. Skipping compile/add steps.");
  }

  // <<< Step 5.5: Export Verifier >>>
  logStep("Export Solidity Verifier (if new)");
  let canonicalCircuitName = '';
  if (needsCompile) {
      const compileMatch = compileCircuitOutput.match(/^CIRCUIT_NAME:\s*([\w\-]+)/m);
      if (compileMatch && compileMatch[1]) {
          canonicalCircuitName = compileMatch[1];
          console.log(`  Parsed compiled circuit name: ${canonicalCircuitName}`);
      } else {
          console.error("  ERROR: Could not parse CIRCUIT_NAME from compile-circuit output!");
          process.exit(1); // Fail if compile was needed but name not found
      }
  } else {
      if (foundCircuitName) {
          canonicalCircuitName = foundCircuitName;
      } else {
          console.error("  ERROR: Circuit compile skipped, but no found circuit name was parsed!");
          process.exit(1); // Fail if no circuit name determined
      }
  }

  const verifierOutputDirRelative = "../contracts/verifiers"; // Relative path from GPC package
  runCommand(
    `ts-node ${path.join(GPC_SCRIPTS_DIR, 'export-solidity-verifier.ts')} "${canonicalCircuitName}" "${verifierOutputDirRelative}"`,
    "Export Verifier",
    GPC_PKG_DIR // Run from GPC package CWD
  );

  // Step 6: Generate GPC Proof - ALWAYS run, passing the determined canonicalCircuitName as the artifact name
  logStep("Generate GPC Proof");
  const genProofCommand = `NODE_OPTIONS=--max-old-space-size=32768 ts-node ${path.join(GPC_SCRIPTS_DIR, 'gen-proof.ts')} "${proofConfigPath}" "${gpcInputsPath}" "${canonicalCircuitName}"`; // Pass canonicalCircuitName as 3rd arg
  console.log(`  -> Using circuit artifacts for: ${canonicalCircuitName}`);
  runCommand(
    genProofCommand,
    "Generate Proof",
    GPC_PKG_DIR // Set CWD for gen-proof
  );

  // Step 7: Find and Copy Proof Files to Local Example Output
  logStep("Find and Copy Proof Files");
  let baseProofName = ''; // To store name like 'locationProofConfig_3o-...'
  let sourceProofPath = ''; // Will point to _combined.json
  let localProofOutputPath = ''; // Will point to local copy of _combined.json

  try {
      const proofFiles = await fs.readdir(proofOutputDirInGPC);

      // Find the combined proof file using the canonical circuit name
      const proofJsonFilename = proofFiles.find(f =>
          f.startsWith(configBaseName) &&
          f.includes(`_${canonicalCircuitName}_`) && // Use determined canonical name
          f.endsWith('_combined.json') // Look for combined file
      ) ?? '';
      if (!proofJsonFilename) {
          throw new Error(`Could not find generated proof file (*_${canonicalCircuitName}_combined.json) starting with '${configBaseName}' in ${proofOutputDirInGPC}`);
      }
      // Extract the base name (e.g., 'locationProofConfig_3o-14e-...')
      baseProofName = proofJsonFilename.replace('_combined.json', '');

      // Construct source and destination paths for the combined file
      sourceProofPath = path.join(proofOutputDirInGPC, proofJsonFilename);
      localProofOutputPath = path.join(OUTPUT_PROOF_DATA_DIR, proofJsonFilename);

      console.log(`Found generated proof base name: ${baseProofName}`);
      console.log(`  Source combined proof: ${sourceProofPath}`);

      // Ensure local output directory exists
      await fs.mkdir(OUTPUT_PROOF_DATA_DIR, { recursive: true });

      // Copy combined proof file
      await fs.copyFile(sourceProofPath, localProofOutputPath);
      console.log(`Copied combined proof to local output: ${localProofOutputPath}`);

  } catch (error: any) {
      console.error(`Error finding/copying proof files: ${error.message}`);
      process.exit(1);
  }

  // Step 8: Verify Proof (using the local copy of the combined file)
  logStep("Verify GPC Proof");
  runCommand(
    `ts-node ${path.join(GPC_SCRIPTS_DIR, 'verify-proof.ts')} "${localProofOutputPath}"`, // Pass path to the copied combined proof
    "Verify Proof",
    GPC_PKG_DIR // Set CWD if verify-proof needs it
  );

  logStep(`--- Full GPC Flow for ${configBaseName} Completed Successfully! ---`);
  console.log(`Final proof available at: ${localProofOutputPath}`); // Point to local copied proof
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