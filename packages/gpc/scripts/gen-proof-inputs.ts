import path from 'path';
import fs from 'fs/promises'; // Use promises API for mkdir
import {
  POD,
  PODEntries, // Keep for type safety if needed, but maybe not
  JSONPOD,
  PODValue, // Keep for toJson
} from '@pcd/pod';
import {
    GPCProofInputs,  // Type for the inputs object we are creating
    GPCProofConfig,  // Need to load the config to determine structure
} from '@pcd/gpc';
// Remove invalid import
// import {
//     proofInputsToJSON 
// } from "@pcd/gpc/dist/src/gpcJSON"; 

// Re-use utils from distanceProof script
import { loadPrivateKey, loadPublicKey, readJsonFile, writeJsonFile } from '../../../packages/pods/utils/fsUtils';
import { limbsToBigInt } from '../../../packages/pods/utils/podBigInt';

// --- Configuration ---
// Base directory for config files (REMOVED as config path is resolved from CWD)
// const CONFIGS_BASE_DIR = path.resolve(__dirname, '..', 'proof-configs');
const OUTPUT_BASE_DIR = path.resolve(__dirname, '..', 'proof-inputs'); // Base dir for output

// Load authority keys once (assuming PODs in input file were signed with this)
// This is still needed for signature verification
const AUTHORITY_PUBLIC_KEY_STR = loadPublicKey();
// Removed constants related to distance calculation
// const ALLOWED_POD_TYPES = new Set([...]);
// const MAX_DISTANCE_SQUARED_ALLOWED = ...;
// const POD_DATA_TYPE_DISTANCE = ...;

// --- Helper Functions ---

// Keep only the toJson helper
function toJson(data: any): string {
  return JSON.stringify(
    data,
    (key, value) => (typeof value === 'bigint' ? value.toString() : value),
    2
  );
}

// Removed: getEntryValue, getIntValue, getStringValue, reconstructLocation, absDiff

// --- Main Generation Logic ---

async function generateGPCInputs(configFilePath: string, inputPodsFilePath: string) {
  console.log("--- Structuring GPC Proof Inputs from Config and Input PODs File ---");
  
  if (!configFilePath || !inputPodsFilePath) {
      console.error("Error: Both config path and input PODs JSON file path arguments are required.");
      console.error(`Usage: ts-node ${path.basename(__filename)} <path/to/config.ts> <path/to/input_pods.json>`);
      process.exit(1);
  }

  // Declare configFileName here so it's accessible later
  let configFileName: string;

  // 1. Load GPCProofConfig
  // console.log(`Loading GPC Proof Config using path: ${configFilePath}...`); // Redundant with next log
  let proofConfig: GPCProofConfig;
  const absoluteConfigPath = path.resolve(process.cwd(), configFilePath);
  configFileName = path.basename(absoluteConfigPath); // Get filename for logging/output
  console.log(`Attempting to load config from resolved path: ${absoluteConfigPath}`);
  try {
    const configModule = require(absoluteConfigPath);
    const exportKey = Object.keys(configModule)[0]; // Assume first export is the config
    proofConfig = configModule[exportKey];
    if (!proofConfig || !proofConfig.pods) {
        throw new Error(`Could not find exported config with a 'pods' property in ${absoluteConfigPath}`);
    }
     console.log(`Successfully loaded config: ${exportKey}`);
  } catch (error: any) {
    console.error(`Error loading proof config from ${configFilePath}: ${error.message}`);
    process.exit(1);
  }

  // 2. Load Input PODs Array
  // Resolve the provided input path relative to CWD
  const absoluteInputPodsPath = path.resolve(process.cwd(), inputPodsFilePath);
  console.log(`Loading input PODs array from resolved path: ${absoluteInputPodsPath}...`);
  let inputPodsJSON: JSONPOD[];
  try {
    inputPodsJSON = await readJsonFile<JSONPOD[]>(absoluteInputPodsPath, []); // Use resolved path
  } catch (e: any) {
    console.error(`Failed to read input PODs file ${absoluteInputPodsPath}: ${e.message}`); process.exit(1);
  }

  // 3. Verify Counts Match
  const configPodKeys = Object.keys(proofConfig.pods);
  const numPodsInConfig = configPodKeys.length;
  const numPodsInInputFile = inputPodsJSON.length;

  console.log(`Config expects ${numPodsInConfig} PODs. Input file contains ${numPodsInInputFile} PODs.`);
  if (numPodsInConfig !== numPodsInInputFile) {
      console.error(`Mismatch: Config ('${configFileName}') expects ${numPodsInConfig} PODs, but input file ('${inputPodsFilePath}') contains ${numPodsInInputFile}.`);
      process.exit(1);
  }

  // 4. Deserialize, Verify, and Map PODs
  console.log("Deserializing, verifying, and mapping input PODs to config keys...");
  const mappedPods: Record<string, POD> = {};
  try {
      for (let i = 0; i < numPodsInConfig; i++) {
          const podKey = configPodKeys[i]; // Get key name from config (e.g., 'object', 'ship')
          const podJSON = inputPodsJSON[i]; // Get corresponding POD from input array
          
          console.log(`  Processing POD index ${i} for config key '${podKey}'...`);

          // Deserialize
          const pod = POD.fromJSON(podJSON);

          // Verify Signature
          const isSigValid = await pod.verifySignature();
          if (!isSigValid) {
              throw new Error(`Signature verification failed for POD at index ${i} (mapped to key '${podKey}').`);
          }
          
          // Verify Signer Public Key matches Authority
          if (pod.signerPublicKey !== AUTHORITY_PUBLIC_KEY_STR) {
              throw new Error(`Signer public key for POD at index ${i} ('${podKey}') does not match expected authority key.`);
          }

          mappedPods[podKey] = pod; // Add to the record
          console.log(`    OK: Verified and mapped to '${podKey}'.`);
      }
  } catch (error: any) {
      console.error("Error during POD processing:", error.message);
      process.exit(1);
  }
  console.log("All input PODs verified and mapped successfully.");

  // 5. Assemble GPCProofInputs object
  // console.log("Assembling GPCProofInputs object..."); // Less critical step log
  const proofInputs: GPCProofInputs = {
      pods: mappedPods // Use the dynamically created map
      // Add owner, membershipLists, watermark fields here if needed by config
      // These would likely need to come from additional arguments or another config file
  };
  console.log("GPCProofInputs object assembled.");

  // 6. Determine Output Path (based on config filename) and Serialize/Write
  const configBaseName = path.basename(configFileName, path.extname(configFileName)); // Use extracted config filename
  const outputDir = OUTPUT_BASE_DIR; // Use output base constant
  const outputPath = path.join(outputDir, `${configBaseName}_gpc_inputs.json`);

  try {
      console.log(`Writing GPCProofInputs to ${outputPath}...`);
      await fs.mkdir(outputDir, { recursive: true });

      // Use the manual toJson helper for serialization
      const outputJsonString = toJson(proofInputs); 

      await fs.writeFile(outputPath, outputJsonString, 'utf-8');

      // console.log("GPCProofInputs file written successfully."); // Redundant with logStep

  } catch (e: any) {
      console.error(`Failed to write GPCProofInputs file: ${e.message}`);
      console.error(e.stack);
      process.exit(1);
  }

  console.log("--- GPC Proof Input Generation Complete ---");
}

// --- Script Execution ---
// Get input paths from command line arguments
const args = process.argv.slice(2);
const configArg = args[0];
const inputPodsArg = args[1];

generateGPCInputs(configArg, inputPodsArg).catch(error => {
  console.error("An unexpected error occurred:", error);
  process.exit(1);
}); 