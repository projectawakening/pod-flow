import path from 'path';
import { execSync } from 'child_process';

// --- Define Directories relative to Workspace Root ---
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..'); 

const DISTANCE_ATTESTATION_PKG_DIR = path.join(WORKSPACE_ROOT, 'packages', 'examples', 'location-bounding', 'distance-attestation');
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

async function runFullDistanceCoreProofFlow() {
  logHeader("STARTING FULL DISTANCE ATTESTATION CORE PROOF GENERATION FLOW");

  // --- Define Paths ---
  const generatePodsScript = path.join(DISTANCE_ATTESTATION_PKG_DIR, 'scripts', 'generateDistanceAttestationPods.ts');
  // We only need the path to the distance POD for this core proof flow
  const signedDistancePodPath = path.join(DISTANCE_ATTESTATION_PKG_DIR, 'pod-data', 'distance_attestation_signed_pod.json');
  
  const coreInputParamsScript = path.join(CORE_SCRIPTS_DIR, 'coreInputParams.ts');
  // Output params specifically for the distance POD's core proof
  const coreProofParamsOutputPath = path.join(DISTANCE_ATTESTATION_PKG_DIR, 'proof-inputs', 'distance_core_proof_params.json');

  const generateCoreProofScript = path.join(CORE_SCRIPTS_DIR, 'generateCoreProof.ts');

  // Step 1: Generate all necessary signed PODs (loc1, loc2, distance)
  runCommand(
    `ts-node ${generatePodsScript}`,
    "Generate All Signed PODs for Distance Use Case",
    WORKSPACE_ROOT 
  );

  // Step 2: Generate Core Proof Parameters for the Distance Attestation POD only
  runCommand(
    `ts-node ${coreInputParamsScript} --signed-pod-input-path "${signedDistancePodPath}" --output-path "${coreProofParamsOutputPath}"`,
    "Generate Core Proof Parameters for Distance POD",
    WORKSPACE_ROOT 
  );

  // Step 3: Generate Core Proof for the Distance Attestation POD
  runCommand(
    `ts-node ${generateCoreProofScript} "${coreProofParamsOutputPath}"`,
    "Generate Core Proof for Distance Attestation",
    WORKSPACE_ROOT 
  );

  logHeader("FULL DISTANCE ATTESTATION CORE PROOF GENERATION FLOW COMPLETED SUCCESSFULLY!");
  console.log(`\nFinal Parameters: ${coreProofParamsOutputPath}`);
  console.log(`Final Proofs should be in: ${path.join(DISTANCE_ATTESTATION_PKG_DIR, 'proof-outputs')}`);
}

runFullDistanceCoreProofFlow().catch(error => {
  console.error("\n--- UNHANDLED ERROR during Full Distance Attestation Core Proof flow ---");
  console.error(error);
  process.exit(1);
});
