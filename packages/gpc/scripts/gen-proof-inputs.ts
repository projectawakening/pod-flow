import path from 'path';
import fs from 'fs/promises'; // Use promises API for mkdir
import {
  POD,
  PODEntries, // Keep for type safety if needed, but maybe not
  JSONPOD,
  PODValue, // Keep for toJson
  podValueFromJSON, // Import for BigInt reviver in params loading
  podValueToJSON // Import for podValueToJSON
} from '@pcd/pod';
import {
    GPCProofInputs,  // Type for the inputs object we are creating
    GPCProofConfig,  // Need to load the config to determine structure
    PODMembershipLists // Import for type safety
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
const AUTHORITY_PRIVATE_KEY = loadPrivateKey(); // Load private key for signing generated PODs
// Removed constants related to distance calculation
// const ALLOWED_POD_TYPES = new Set([...]);
// const MAX_DISTANCE_SQUARED_ALLOWED = ...;
// const POD_DATA_TYPE_DISTANCE = ...;

// Define local interface for Owner type from params file
interface ParamsOwnerInput {
  semaphoreV3?: { commitment: string }; // Expect string from JSON
  semaphoreV4?: { publicKey: [string, string] }; // Expect strings from JSON
  externalNullifier?: PODValue;
}
// Define local interface for the params file structure
interface ExampleParams {
    pods: { [contentId: string]: JSONPOD }; 
    podConfigMapping: { [configKey: string]: string }; 
    membershipLists?: PODMembershipLists;
    owner?: ParamsOwnerInput;
    watermark?: PODValue;
    // Add other potential parameters here
}

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

async function generateGPCInputs(configFilePath: string, paramsFilePath: string) {
  console.log("--- Generating GPC Proof Inputs using Config and Params File ---");

  if (!configFilePath || !paramsFilePath) {
      console.error("Error: Config path and params path arguments are required.");
      console.error(`Usage: ts-node ${path.basename(__filename)} <path/to/config.ts> <path/to/params.json>`);
      process.exit(1);
  }

  const absoluteConfigPath = path.resolve(process.cwd(), configFilePath);
  const absoluteParamsPath = path.resolve(process.cwd(), paramsFilePath);

  let proofConfig: GPCProofConfig;
  const configFileName = path.basename(absoluteConfigPath);
  console.log(`Loading config from: ${absoluteConfigPath}`);
  try {
    const configModule = require(absoluteConfigPath);
    const exportKey = Object.keys(configModule)[0];
    proofConfig = configModule[exportKey];
    if (!proofConfig || !proofConfig.pods) {
        throw new Error(`Could not find exported config with a 'pods' property.`);
    }
    console.log(`Successfully loaded config: ${exportKey}`);
  } catch (error: any) {
    console.error(`Error loading proof config: ${error.message}`);
    process.exit(1);
  }

  let params: ExampleParams;
  console.log(`Loading parameters from: ${absoluteParamsPath}`);
  try {
    const paramsFileContent = await fs.readFile(absoluteParamsPath, 'utf-8');
    // <<< Parse without custom reviver >>>
    const parsedParams = JSON.parse(paramsFileContent);
    if (!parsedParams || typeof parsedParams !== 'object') {
        throw new Error("Invalid params file content.");
    }

    // <<< Manually parse membershipLists and watermark using podValueFromJSON >>>
    let deserializedMembershipLists: GPCProofInputs['membershipLists'] = undefined;
    if (parsedParams.membershipLists && typeof parsedParams.membershipLists === 'object') {
        deserializedMembershipLists = {};
        for (const listName in parsedParams.membershipLists) {
            if (Object.prototype.hasOwnProperty.call(parsedParams.membershipLists, listName)) {
                const jsonList = parsedParams.membershipLists[listName];
                if (!Array.isArray(jsonList)) {
                    throw new Error(`Params membership list '${listName}' is not an array.`);
                }
                // Correctly parse based on expected type (PODValue[] or PODValue[][])
                if (jsonList.length > 0 && Array.isArray(jsonList[0])) {
                    // Assume it's a list of tuples (PODValue[][])
                    deserializedMembershipLists[listName] = jsonList.map((jsonTuple: any[], tupleIndex: number) =>
                        jsonTuple.map((jsonItem, itemIndex) =>
                            podValueFromJSON(jsonItem, `${listName}[${tupleIndex}][${itemIndex}]`)
                        )
                    ) as PODValue[][];
                } else {
                    // Assume it's a list of single values (PODValue[])
                    deserializedMembershipLists[listName] = jsonList.map((jsonItem, index) =>
                        podValueFromJSON(jsonItem, `${listName}[${index}]`)
                    ) as PODValue[];
                }
            }
        }
    }

    const deserializedWatermark = parsedParams.watermark
        ? podValueFromJSON(parsedParams.watermark, 'watermark')
        : undefined;

    // Apply the reviver during JSON.parse <<< REMOVED >>>
    // params = JSON.parse(paramsFileContent, jsonBigIntReviver) as ExampleParams;
    // <<< Assign parsed parts to the params variable >>>
    params = {
        pods: parsedParams.pods, // Assume pods are already JSONPOD, handled later
        podConfigMapping: parsedParams.podConfigMapping,
        membershipLists: deserializedMembershipLists,
        owner: parsedParams.owner, // Assume owner doesn't need deep parsing here
        watermark: deserializedWatermark
        // Add other potential parameters here
    };
    console.log("Successfully loaded and parsed parameters."); // <<< Updated log message

    if (!params.pods || typeof params.pods !== 'object') {
        throw new Error("Params file must contain a 'pods' object.");
    }
    if (!params.podConfigMapping || typeof params.podConfigMapping !== 'object') {
        throw new Error("Params file must contain a 'podConfigMapping' object.");
    }
  } catch (error: any) {
    console.error(`Error loading or validating parameters file: ${error.message}`);
    process.exit(1);
  }

  console.log("Deserializing and verifying PODs based on config keys and params mapping...");
  const mappedPods: Record<string, POD> = {};
  const configPodKeys = Object.keys(proofConfig.pods);

  try {
    for (const configKey of configPodKeys) {
        console.log(`  Processing POD for config key '${configKey}'...`);
        
        const contentId = params.podConfigMapping[configKey];
        if (!contentId) {
            throw new Error(`Mapping missing: No contentId found for config key '${configKey}' in params.podConfigMapping.`);
        }
        
        const jsonPodData = params.pods[contentId];
        if (!jsonPodData) {
            throw new Error(`POD data missing: No POD found for contentId '${contentId}' (mapped from config key '${configKey}') in params.pods.`);
        }

        const podInstance = POD.fromJSON(jsonPodData);
        const isSigValid = await podInstance.verifySignature();
        if (!isSigValid) {
            throw new Error(`Signature verification failed for POD with contentId '${contentId}' (config key '${configKey}').`);
        }
        if (podInstance.signerPublicKey !== AUTHORITY_PUBLIC_KEY_STR) {
            throw new Error(`Signer public key mismatch for POD with contentId '${contentId}' (config key '${configKey}').`);
        }

        mappedPods[configKey] = podInstance;
        console.log(`    OK: Verified POD with contentId '${contentId}' and mapped to config key '${configKey}'.`);
    }
    
    const mappedContentIds = new Set(Object.values(params.podConfigMapping));
    for (const contentId in params.pods) {
        if (!mappedContentIds.has(contentId)) {
            console.warn(`Warning: POD with contentId '${contentId}' found in params.pods but not used by params.podConfigMapping.`);
        }
    }

  } catch (error: any) {
      console.error("Error during POD processing:", error.message);
      console.error(error.stack);
      process.exit(1);
  }
  console.log("All required PODs processed and mapped successfully.");

  console.log("Assembling final GPCProofInputs object...");
  const proofInputs: GPCProofInputs = {
      pods: mappedPods,
      membershipLists: params.membershipLists,
      owner: params.owner as GPCProofInputs['owner'],
      watermark: params.watermark
  };
  console.log("GPCProofInputs object assembled.");

  const configBaseName = path.basename(configFileName, path.extname(configFileName));
  const outputDir = OUTPUT_BASE_DIR;
  const outputPath = path.join(outputDir, `${configBaseName}_gpc_inputs.json`);

  try {
      console.log(`Writing final GPCProofInputs to ${outputPath}...`);
      await fs.mkdir(outputDir, { recursive: true });

      // Manually serialize membershipLists before writing
      let outputDataToWrite: any = { ...proofInputs }; // Start with a copy
      if (outputDataToWrite.membershipLists) {
          const serializedMembershipLists: any = {};
          for (const listName in outputDataToWrite.membershipLists) {
                const list = outputDataToWrite.membershipLists[listName];
                // Ensure list is an array before mapping
                if (Array.isArray(list)) {
                    serializedMembershipLists[listName] = list.map((item: any) => {
                        // Handle both single PODValues and tuples (arrays of PODValues)
                        if (Array.isArray(item)) { // It's a tuple
                            return item.map((podValue: any) => podValueToJSON(podValue));
                        } else { // It's a single PODValue
                            return podValueToJSON(item);
                        }
                    });
                } else {
                    // Handle potential malformed input gracefully (or throw)
                    console.warn(`Membership list '${listName}' is not an array, skipping serialization.`);
                    serializedMembershipLists[listName] = list; // Keep original if not array
                }
          }
          outputDataToWrite.membershipLists = serializedMembershipLists;
      }
      // Also serialize watermark if it exists
      if (outputDataToWrite.watermark) {
          outputDataToWrite.watermark = podValueToJSON(outputDataToWrite.watermark);
      }
      // Note: Assuming owner structure doesn't contain PODValues needing serialization
      // If it does, similar logic would be needed here.

      // Pass the object with serialized lists to writeJsonFile
      await writeJsonFile(outputPath, outputDataToWrite); // Use outputDataToWrite
  } catch (e: any) {
      console.error(`Failed to write final GPCProofInputs file: ${e.message}`);
      process.exit(1);
  }

  console.log("--- GPC Proof Input Generation Complete ---");
}

// --- Script Execution ---
const args = process.argv.slice(2);
const configArg = args[0];
const paramsArg = args[1];

generateGPCInputs(configArg, paramsArg).catch(error => {
  console.error("An unexpected error occurred:", error);
  process.exit(1);
}); 