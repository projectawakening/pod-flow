import path from 'path';
import { execSync } from 'child_process';

// --- Define Directories relative to Workspace Root ---
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..'); 

const DISTANCE_ATTESTATION_PKG_DIR = path.join(WORKSPACE_ROOT, 'packages', 'examples', 'location-bounding', 'distance-attestation');
const CORE_SCRIPTS_DIR = path.join(WORKSPACE_ROOT, 'packages', 'examples', 'core', 'scripts');
const DISTANCE_ATTESTATION_SCRIPTS_DIR = path.join(DISTANCE_ATTESTATION_PKG_DIR, 'scripts');

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

async function runFullDistanceFullProofFlow() {
  logHeader("STARTING FULL DISTANCE ATTESTATION FULL PROOF GENERATION FLOW");

  // --- Define Paths ---
  const generatePodsScript = path.join(DISTANCE_ATTESTATION_SCRIPTS_DIR, 'generateDistanceAttestationPods.ts');
  const signedDistancePodPath = path.join(DISTANCE_ATTESTATION_PKG_DIR, 'pod-data', 'distance_attestation_signed_pod.json');
  
  // Path to the new script for generating full proof input parameters
  const inputParamsScript = path.join(DISTANCE_ATTESTATION_SCRIPTS_DIR, 'generateFullProofParams.ts'); 
  const fullProofConfigPath = path.join(DISTANCE_ATTESTATION_PKG_DIR, 'proof-config', 'fullDistanceProofConfig.ts');
  const fullProofParamsOutputPath = path.join(DISTANCE_ATTESTATION_PKG_DIR, 'proof-inputs', 'distance_full_proof_params.json');

  // Path to the new script for generating the full distance attestation proof
  const generateProofScript = path.join(DISTANCE_ATTESTATION_SCRIPTS_DIR, 'generateFullDistanceAttestationProof.ts');

  // Step 1: Generate all necessary signed PODs
  runCommand(
    `ts-node ${generatePodsScript}`,
    "Generate All Signed PODs for Distance Use Case",
    WORKSPACE_ROOT 
  );

  // Step 2: Generate Full Proof Parameters using the new script
  runCommand(
    `ts-node ${inputParamsScript} --signed-pod-input-path "${signedDistancePodPath}" --proof-config-path "${fullProofConfigPath}" --output-path "${fullProofParamsOutputPath}"`,
    "Generate Full Proof Parameters for Distance POD",
    WORKSPACE_ROOT 
  );

  // Step 3: Generate Full Proof for the Distance Attestation POD using the new script
  runCommand(
    `ts-node ${generateProofScript} "${fullProofParamsOutputPath}"`,
    "Generate Full Proof for Distance Attestation",
    WORKSPACE_ROOT 
  );

  logHeader("FULL DISTANCE ATTESTATION FULL PROOF GENERATION FLOW COMPLETED SUCCESSFULLY!");
  console.log(`\nFinal Parameters: ${fullProofParamsOutputPath}`);
  console.log(`Final Proofs should be in: ${path.join(DISTANCE_ATTESTATION_PKG_DIR, 'proof-outputs')}`); 
}

runFullDistanceFullProofFlow().catch(error => {
  console.error("\n--- UNHANDLED ERROR during Full Distance Attestation Full Proof flow ---");
  console.error(error);
  process.exit(1);
}); 