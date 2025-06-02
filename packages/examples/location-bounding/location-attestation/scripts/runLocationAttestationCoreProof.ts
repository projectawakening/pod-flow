import path from 'path';
import { execSync } from 'child_process';

// --- Define Directories relative to Workspace Root ---
// Script is in: packages/examples/location-bounding/location-attestation/scripts/
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..'); // Adjust to reach workspace root

const LOCATION_ATTESTATION_PKG_DIR = path.join(WORKSPACE_ROOT, 'packages', 'examples', 'location-bounding', 'location-attestation');
const CORE_SCRIPTS_DIR = path.join(WORKSPACE_ROOT, 'packages', 'examples', 'core', 'scripts');

// --- Helper Functions ---
function logHeader(message: string) {
  console.log(`\n\n################################################################################`);
  console.log(`# ${message}`);
  console.log(`################################################################################\n`);
}

function runCommand(command: string, stepName: string, cwd?: string) {
  console.log(`\n--- Executing Step: ${stepName} ---`);
  console.log(`Running command: ${command}` + (cwd ? ` in ${cwd}` : ''));
  try {
    execSync(command, { stdio: 'inherit', encoding: 'utf-8', cwd: cwd });
    console.log(`--- Step '${stepName}' executed successfully ---`);
  } catch (error: any) {
    console.error(`\n--- ERROR during step '${stepName}' ---`);
    console.error(`Command failed: ${command}`);
    console.error("Error output (if any) should be visible above.");
    process.exit(1);
  }
}

async function runFullFlow() {
  logHeader("STARTING FULL LOCATION ATTESTATION CORE PROOF GENERATION FLOW");

  // --- Define Paths --- 
  const generatePodScript = path.join(LOCATION_ATTESTATION_PKG_DIR, 'scripts', 'generateLocationAttestationPod.ts');
  const signedPodOutputPath = path.join(LOCATION_ATTESTATION_PKG_DIR, 'pod-data', 'location_attestation_signed_pod.json');
  
  const coreInputParamsScript = path.join(CORE_SCRIPTS_DIR, 'coreInputParams.ts');
  const coreProofParamsOutputPath = path.join(LOCATION_ATTESTATION_PKG_DIR, 'proof-inputs', 'core_location_proof_params.json');

  const generateCoreProofScript = path.join(CORE_SCRIPTS_DIR, 'generateCoreProof.ts');

  // Step 1: Generate Signed Location Attestation POD
  runCommand(
    `ts-node ${generatePodScript}`,
    "Generate Signed Location Attestation POD",
    WORKSPACE_ROOT // Run from workspace root so relative paths in script are correct
  );

  // Step 2: Generate Core Proof Parameters
  runCommand(
    `ts-node ${coreInputParamsScript} --signed-pod-input-path "${signedPodOutputPath}" --output-path "${coreProofParamsOutputPath}"`,
    "Generate Core Proof Parameters",
    WORKSPACE_ROOT // Run from workspace root
  );

  // Step 3: Generate Core Proof
  runCommand(
    `ts-node ${generateCoreProofScript} "${coreProofParamsOutputPath}"`,
    "Generate Core Proof for Location Attestation",
    WORKSPACE_ROOT // Run from workspace root
  );

  logHeader("FULL LOCATION ATTESTATION CORE PROOF GENERATION FLOW COMPLETED SUCCESSFULLY!");
  console.log(`\nFinal Parameters: ${coreProofParamsOutputPath}`);
  console.log(`Final Proofs should be in: ${path.join(LOCATION_ATTESTATION_PKG_DIR, 'proof-outputs')}`);
}

runFullFlow().catch(error => {
  console.error("\n--- UNHANDLED ERROR during Full Location Attestation Core Proof flow ---");
  console.error(error);
  process.exit(1);
}); 