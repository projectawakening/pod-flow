import fs from 'fs/promises';
import path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';

// --- Define Directories relative to Workspace Root ---
// Script is in: packages/examples/core/scripts/
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const GPC_PKG_DIR = path.join(WORKSPACE_ROOT, 'packages', 'gpc');
const EXAMPLES_PKG_DIR = path.join(WORKSPACE_ROOT, 'packages', 'examples');

const GPC_SCRIPTS_DIR = path.join(GPC_PKG_DIR, 'scripts');
const GPC_PROOF_REQS_DIR = path.join(GPC_PKG_DIR, 'proof-requirements');
const GPC_PROOF_INPUTS_DIR = path.join(GPC_PKG_DIR, 'proof-inputs');
const GPC_PROOFS_DIR = path.join(GPC_PKG_DIR, 'proofs');

// --- Helper Functions ---

function logStep(message: string) {
  console.log(`\n=== STEP: ${message} ===`);
}

function runCommand(command: string, stepName: string, cwd?: string) {
  console.log(`Executing: ${command}` + (cwd ? ` in ${cwd}` : ''));
  try {
    execSync(command, { stdio: 'inherit', encoding: 'utf-8', cwd: cwd });
    console.log(`Command for '${stepName}' executed successfully.`);
  } catch (error: any) {
    console.error(`\n--- ERROR during '${stepName}' ---`);
    console.error(`Command failed: ${command}`);
    console.error("Error output (if any) should be visible above.");
    process.exit(1);
  }
}

function runCommandAndCapture(command: string, stepName: string, cwd?: string): string {
    console.log(`Executing: ${command}` + (cwd ? ` in ${cwd}` : ''));
    try {
        const options: ExecSyncOptionsWithStringEncoding = {
            stdio: ['inherit', 'pipe', 'pipe'],
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

async function runCoreProofFlow(absoluteParamsPath: string) {
  logStep(`Starting GPC Flow for Core Proof using params: ${absoluteParamsPath}`);

  const coreProofConfigRelativePath = 'core/proof-config/coreProofConfig.ts';
  const proofConfigPath = path.resolve(EXAMPLES_PKG_DIR, coreProofConfigRelativePath);
  
  const configBaseName = path.basename(proofConfigPath, path.extname(proofConfigPath));

  const paramsDir = path.dirname(absoluteParamsPath);
  const outputProofDataDirForUseCase = path.resolve(paramsDir, '..', 'proof-outputs'); 

  console.log(`Using Core Proof Config: ${proofConfigPath}`);
  console.log(`Using Params File: ${absoluteParamsPath}`);
  console.log(`Config Base Name: ${configBaseName}`);
  console.log(`Proof output directory for this use case: ${outputProofDataDirForUseCase}`);

  const requirementsPath = path.join(GPC_PROOF_REQS_DIR, `${configBaseName}_requirements.json`);
  const gpcInputsPath = path.join(GPC_PROOF_INPUTS_DIR, `${configBaseName}_gpc_inputs.json`);
  const proofOutputDirInGPC = GPC_PROOFS_DIR;
  
  logStep("Clean up previous intermediate files and potential old proofs (if any) for coreProofConfig");
  try {
    await fs.rm(requirementsPath, { force: true });
    console.log(`  - Removed ${path.basename(requirementsPath)} (if existed)`);
    await fs.rm(gpcInputsPath, { force: true });
    console.log(`  - Removed ${path.basename(gpcInputsPath)} (if existed)`);
    
    const filesInProofDir = await fs.readdir(proofOutputDirInGPC);
    const oldProofFiles = filesInProofDir.filter(f =>
        f.startsWith(configBaseName) && (f.endsWith('_combined.json') || f.endsWith('_proof.json') || f.endsWith('_public.json'))
    );
    if (oldProofFiles.length > 0) {
        console.log(`  - Found potential old proof files for prefix '${configBaseName}': ${oldProofFiles.join(', ')}`);
        for (const oldProofFile of oldProofFiles) {
            const fullPath = path.join(proofOutputDirInGPC, oldProofFile);
            await fs.rm(fullPath, { force: true });
            console.log(`    - Removed ${oldProofFile}`);
        }
    } else {
        console.log(`  - No old proof files found matching '${configBaseName}_*.(combined|proof|public).json' in ${proofOutputDirInGPC}.`);
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
        console.warn(`Warning: Could not clean up all files. Error: ${error.message}`);
    } else {
        console.log(`  - Some files did not exist, no removal needed.`);
    }
  }

  const relativeConfigPathFromGPC = path.relative(GPC_PKG_DIR, proofConfigPath);
  const relativeParamsPathForInputsScript = path.relative(GPC_PKG_DIR, absoluteParamsPath);
  const relativeRequirementsPath = path.relative(GPC_PKG_DIR, requirementsPath); 
  const relativeGpcInputsPath = path.relative(GPC_PKG_DIR, gpcInputsPath); 

  logStep("Generate Standardized GPC Proof Inputs");
  runCommand(
    `ts-node ${path.join("scripts", 'gen-proof-inputs.ts')} --config "${relativeConfigPathFromGPC}" --params "${relativeParamsPathForInputsScript}" --output "${relativeGpcInputsPath}"`,
    "Generate GPC Inputs",
    GPC_PKG_DIR
  );

  logStep("Generate Proof Requirements");
  runCommand(
    `ts-node ${path.join("scripts", 'gen-proof-requirements.ts')} --config "${relativeConfigPathFromGPC}" --gpc-inputs "${relativeGpcInputsPath}"`,
    "Generate Requirements",
    GPC_PKG_DIR
  );

  logStep("Find Suitable Circuit");
  const findCircuitOutput = runCommandAndCapture(
    `ts-node ${path.join("scripts", 'find-circuit.ts')} "${relativeRequirementsPath}"`,
    "Find Circuit",
    GPC_PKG_DIR
  );

  let foundCircuitName = '';
  const findMatch = findCircuitOutput.match(/^CIRCUIT_NAME:\s*([\w\-]+)/m);
  if (findMatch && findMatch[1]) {
      foundCircuitName = findMatch[1];
      console.log(`  Parsed found circuit name: ${foundCircuitName}`);
  } else {
      console.log("  Could not parse CIRCUIT_NAME from find-circuit output.");
  }

  let compileCircuitOutput = '';
  let needsCompile = findCircuitOutput.includes("COMPILE_NEEDED");
  let canonicalCircuitName = foundCircuitName;

  if (needsCompile) {
    logStep("Compile Circuit (COMPILE_NEEDED detected)");
    compileCircuitOutput = runCommandAndCapture(
      `ts-node ${path.join("scripts", 'compile-circuit.ts')} "${relativeRequirementsPath}"`,
      "Compile Circuit",
      GPC_PKG_DIR
    );

    logStep("Adding Compiled Circuit Parameters to Available Circuits List");
    runCommand(
      `ts-node ${path.join("scripts", 'add-compiled-circuit-params.ts')} "${relativeRequirementsPath}"`,
      "Add Circuit Params",
      GPC_PKG_DIR
    );

    const compileMatch = compileCircuitOutput.match(/^CIRCUIT_NAME:\s*([\w\-]+)/m);
    if (compileMatch && compileMatch[1]) {
        canonicalCircuitName = compileMatch[1];
        console.log(`  Parsed compiled circuit name: ${canonicalCircuitName}`);
    } else {
        console.error("  ERROR: Could not parse CIRCUIT_NAME from compile-circuit output!");
        process.exit(1);
    }
  } else {
    logStep("Suitable pre-compiled circuit found. Skipping compile/add steps.");
    if (!canonicalCircuitName) {
        console.error("  ERROR: Circuit compile skipped, but no found circuit name was parsed initially!");
        process.exit(1);
    }
  }

  logStep("Export Solidity Verifier (if new)");
  const verifierOutputDirRelative = "../contracts/verifiers";
  runCommand(
    `ts-node ${path.join(GPC_SCRIPTS_DIR, 'export-solidity-verifier.ts')} "${canonicalCircuitName}" "${verifierOutputDirRelative}"`,
    "Export Verifier",
    GPC_PKG_DIR
  );

  logStep("Generate GPC Proof");
  const genProofCommand = `NODE_OPTIONS=--max-old-space-size=32768 ts-node ${path.join(GPC_SCRIPTS_DIR, 'gen-proof.ts')} "${proofConfigPath}" "${gpcInputsPath}" "${canonicalCircuitName}"`;
  console.log(`  -> Using circuit artifacts for: ${canonicalCircuitName}`);
  runCommand(
    genProofCommand,
    "Generate Proof",
    GPC_PKG_DIR
  );

  logStep("Find and Copy Proof Files");
  let localProofOutputPath = '';
  try {
      const proofFiles = await fs.readdir(proofOutputDirInGPC);
      const proofJsonFilename = proofFiles.find(f =>
          f.startsWith(configBaseName) &&
          f.includes(`_${canonicalCircuitName}_`) &&
          f.endsWith('_combined.json')
      ) ?? '';
      if (!proofJsonFilename) {
          throw new Error(`Could not find generated proof file (*_${canonicalCircuitName}_combined.json) starting with '${configBaseName}' in ${proofOutputDirInGPC}`);
      }
      
      const sourceProofPath = path.join(proofOutputDirInGPC, proofJsonFilename);
      localProofOutputPath = path.join(outputProofDataDirForUseCase, proofJsonFilename);

      console.log(`Found generated proof: ${proofJsonFilename}`);
      console.log(`  Source combined proof: ${sourceProofPath}`);

      await fs.mkdir(outputProofDataDirForUseCase, { recursive: true });
      await fs.copyFile(sourceProofPath, localProofOutputPath);
      console.log(`Copied combined proof to use case output: ${localProofOutputPath}`);

  } catch (error: any) {
      console.error(`Error finding/copying proof files: ${error.message}`);
      process.exit(1);
  }

  logStep("Verify GPC Proof");
  runCommand(
    `ts-node ${path.join(GPC_SCRIPTS_DIR, 'verify-proof.ts')} "${localProofOutputPath}"`,
    "Verify Proof",
    GPC_PKG_DIR
  );

  logStep(`--- GPC Flow for Core Proof (${configBaseName}) Completed Successfully! ---`);
  console.log(`Final proof available at: ${localProofOutputPath}`);
}

// --- Script Execution ---
const args = process.argv.slice(2);
const paramsArg = args[0];

if (!paramsArg) {
  console.error("Usage: ts-node packages/examples/core/scripts/generateCoreProof.ts <path/to/core_proof_params.json>");
  console.error("  Params path should be relative to the workspace root or an absolute path.");
  console.error("  Example: ts-node packages/examples/core/scripts/generateCoreProof.ts packages/examples/location-attestation/proof-inputs/core_location_proof_params.json");
  process.exit(1);
}

const absoluteParamsPath = path.resolve(paramsArg);

runCoreProofFlow(absoluteParamsPath).catch(error => {
  console.error("\n--- UNHANDLED ERROR during Core Proof flow ---");
  console.error(error);
  process.exit(1);
}); 