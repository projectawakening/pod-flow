import path from 'path';
import fs from 'fs/promises'; // Use promises API for mkdir
import {
  POD,
  JSONPOD,
  // PODValue, // Not directly used for GPCInputsJSON construction from ExampleParams
  JSONPODValue,
  podValueFromJSON, 
  // podValueToJSON, // Not directly used here for GPCInputsJSON construction
  podEntriesFromJSON,
  JSONPODEntries
  // checkPOD // Removed, not exported or used
} from '@pcd/pod';
import {
  GPCProofConfig,
  // GPCProofInputs, // We are creating a JSON structure, not full GPCProofInputs with objects
  PODMembershipLists, // This type might need to be Record<PODName, JSONPODValue[]> for GPCInputsJSON
} from '@pcd/gpc';
// Removed: import { Command } from 'commander';

// --- Type Definitions for Input (params.json) ---
interface ParamsOwnerV4Input { 
  publicKey: [string, string]; 
  secretScalar?: string;       
  identityCommitment?: string;
}

interface ParamsOwnerInput {
  semaphoreV3?: { commitment: string };
  semaphoreV4?: ParamsOwnerV4Input; 
  externalNullifier?: JSONPODValue;
}

interface ExampleParams { // Type for the content of params.json
    pods: { [contentId: string]: JSONPOD }; 
    podConfigMapping: { [configKey: string]: string }; 
    membershipLists?: PODMembershipLists; // Should be JSON-compatible PODMembershipLists (e.g. Record<string, JSONPODValue[]>) if it contains complex types
    owner?: ParamsOwnerInput;
    watermark?: JSONPODValue; 
}

// --- Type Definition for Output (_gpc_inputs.json) ---
interface GPCInputsJSONOwnerV4 {
    publicKey: [string, string];
    secretScalar?: string;
    identityCommitment?: string;
}
interface GPCInputsJSONOwner {
    semaphoreV3?: { commitment: string };
    semaphoreV4?: GPCInputsJSONOwnerV4;
    externalNullifier?: JSONPODValue;
}

interface GPCInputsJSON { // Type for the structure to be written to _gpc_inputs.json
    pods: Record<string, JSONPOD>; // Keys are configKeys (e.g., "location", "item2")
    podConfigMapping: { [configKey: string]: string }; // Maps configKey to contentID
    membershipLists?: PODMembershipLists; // Keeping as PODMembershipLists for now, assuming it's JSON serializable in its current use.
                                        // If it holds complex PODValues, it should be JSONPODValues for the JSON file.
    owner?: GPCInputsJSONOwner;
    watermark?: JSONPODValue;
}

// --- Helper Functions ---

// Function to ensure all PODs referenced in podConfigMapping exist in params.pods
function validatePodMappings(params: ExampleParams): void {
    for (const contentId of Object.values(params.podConfigMapping)) {
        if (!params.pods[contentId]) {
            throw new Error(`Mapping validation failed: ContentId '${contentId}' found in podConfigMapping but not in params.pods.`);
        }
    }
}

export function generateGPCInputs(
  config: GPCProofConfig,
  params: ExampleParams, // Input is the parsed params.json content
  skipContentIDCheck = false
): GPCInputsJSON { // Returns a structure ready for JSON serialization
  console.log("Deserializing and verifying PODs based on config keys and params mapping...");
  
  validatePodMappings(params); // Validate mappings first

  const finalPodsForJSON: Record<string, JSONPOD> = {}; // Will be keyed by configKey

  // Iterate over the config.pods to ensure we only process PODs defined in the config
  for (const [configKey, podKeySettings] of Object.entries(config.pods)) {
    const contentId = params.podConfigMapping[configKey];
    if (!contentId) {
      throw new Error(`Mapping missing: No contentId found for config key '${configKey}' in params.podConfigMapping.`);
    }

    const jsonPodFromParams = params.pods[contentId]; // Fetch POD data using contentId
    if (!jsonPodFromParams) {
      throw new Error(`POD data missing: No POD found for contentId '${contentId}' (mapped from config key '${configKey}').`);
    }

    // Basic validation of the object read from params
    if (typeof jsonPodFromParams.entries !== 'object' || jsonPodFromParams.entries === null) {
        throw new Error(`Invalid POD structure for contentId '${contentId}': missing or invalid 'entries'.`);
    }
    if (typeof jsonPodFromParams.signature !== 'string') {
        throw new Error(`Invalid POD structure for contentId '${contentId}': missing or invalid 'signature'.`);
    }
    if (typeof jsonPodFromParams.signerPublicKey !== 'string') {
        throw new Error(`Invalid POD structure for contentId '${contentId}': missing or invalid 'signerPublicKey'.`);
    }

    // Create the standard JSONPOD object for output, excluding contentID
    const standardJsonPod: JSONPOD = {
        entries: jsonPodFromParams.entries, // Restore original entries
        signature: jsonPodFromParams.signature,
        signerPublicKey: jsonPodFromParams.signerPublicKey
    };

    // Store the standard JSONPOD using configKey as the key
    finalPodsForJSON[configKey] = standardJsonPod; 
    console.log(`  Processed POD for config key '${configKey}' (contentId: ${contentId}) -> stored under key '${configKey}' (excluding contentID field)`);
  }

  let finalOwnerForJSON: GPCInputsJSONOwner | undefined = undefined;
  const ownerFromParams = params.owner;

  if (ownerFromParams && typeof ownerFromParams === 'object') {
    finalOwnerForJSON = {};

    if (ownerFromParams.semaphoreV3?.commitment) {
      finalOwnerForJSON.semaphoreV3 = { commitment: ownerFromParams.semaphoreV3.commitment };
    }

    if (ownerFromParams.semaphoreV4?.publicKey) {
      finalOwnerForJSON.semaphoreV4 = { publicKey: ownerFromParams.semaphoreV4.publicKey };
      if (ownerFromParams.semaphoreV4.secretScalar !== undefined) {
        finalOwnerForJSON.semaphoreV4.secretScalar = ownerFromParams.semaphoreV4.secretScalar;
      }
      if (ownerFromParams.semaphoreV4.identityCommitment !== undefined) {
        finalOwnerForJSON.semaphoreV4.identityCommitment = ownerFromParams.semaphoreV4.identityCommitment;
      }
    }

    if (ownerFromParams.externalNullifier !== undefined) {
      finalOwnerForJSON.externalNullifier = ownerFromParams.externalNullifier;
    }
  }
  
  // Process membershipLists: Ensure they are in a JSON-compatible format if they contain complex types.
  // For GPC.ts, PODMembershipLists is Record<PODName, PODValue[]>.
  // If these PODValues are complex (BigInts, etc.), they need to be JSONPODValues for the file.
  // podValueFromJSON was used previously, which implies the input might be JSONPODValue.
  // Let's assume params.membershipLists is already structured correctly for JSON output if it exists.
  // If it were Record<PODName, PODValue[]>, we'd need to convert PODValue to JSONPODValue here.
  // Since it's from params.json, it should already be JSON-compatible.

  const gpcInputsJSON: GPCInputsJSON = {
    pods: finalPodsForJSON,
    podConfigMapping: params.podConfigMapping,
    membershipLists: params.membershipLists, // Assumed to be JSON-compatible from params.json
    owner: finalOwnerForJSON,
    watermark: params.watermark, // Assumed to be JSONPODValue from params.json
  };

  // Final check: Ensure all PODs defined in config.pods via podConfigMapping are included in gpcInputsJSON.pods
  for (const configKey of Object.keys(config.pods)) {
    const contentId = gpcInputsJSON.podConfigMapping[configKey];
    if (!contentId || !gpcInputsJSON.pods[configKey]) { // Check for existence of configKey in gpcInputsJSON.pods
        throw new Error(`Consistency check failed: POD for config key '${configKey}' is missing in the final GPC inputs JSON.`);
    }
  }

  console.log("Successfully generated GPC inputs structure for JSON serialization.");
  return gpcInputsJSON;
}

// NEW main function for manual argument parsing
async function main() {
  console.log("--- Generating GPC Proof Inputs using Config and Params File (Manual Arg Parse) ---");

  const args = process.argv.slice(2); // Skip node and script path

  let configPathArg: string | undefined;
  let paramsPathArg: string | undefined;
  let outputPathArg: string | undefined;
  let skipContentIdCheckArg = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
      configPathArg = args[++i];
    } else if (args[i] === '--params' && i + 1 < args.length) {
      paramsPathArg = args[++i];
    } else if (args[i] === '--output' && i + 1 < args.length) {
      outputPathArg = args[++i];
    } else if (args[i] === '--skip-contentid-check') {
      skipContentIdCheckArg = true;
    }
  }

  if (!configPathArg || !paramsPathArg || !outputPathArg) {
    console.error("Error: Missing required arguments.");
    console.error("Usage: ts-node <script_name> --config <configFile> --params <paramsFile> --output <outputFile> [--skip-contentid-check]");
    process.exit(1);
  }

  const configPath = path.resolve(process.cwd(), configPathArg);
  const paramsPath = path.resolve(process.cwd(), paramsPathArg);
  const gpcInputsPath = path.resolve(process.cwd(), outputPathArg);

  console.log(`Loading config from: ${configPath}`);
  let configData: GPCProofConfig;
  try {
    const configModule = require(configPath);
    let foundConfig: GPCProofConfig | undefined = undefined;
    let foundKey: string | undefined = undefined;

    // Iterate through exports to find the config object
    for (const key in configModule) {
        if (Object.prototype.hasOwnProperty.call(configModule, key)) {
            const potentialConfig = configModule[key];
            // Structural check: does it have a 'pods' object?
            if (potentialConfig && typeof potentialConfig === 'object' && potentialConfig.pods && typeof potentialConfig.pods === 'object') {
                foundConfig = potentialConfig as GPCProofConfig; // Cast after check
                foundKey = key;
                break; // Found the first one, stop looking
            }
        }
    }

    if (!foundConfig) {
        throw new Error('Could not find a valid GPCProofConfig export in the config file.');
    }
    configData = foundConfig; // Assign the found config
    console.log(`Successfully loaded config exported as: ${foundKey || 'unknown'}`); // Log the key name

  } catch (e:any) {
    console.error(`Error loading or finding config in ${configPath}:`, e);
    process.exit(1);
  }

  console.log(`Loading parameters from: ${paramsPath}`);
  let parsedParams: ExampleParams;
  try {
    const paramsContent = await fs.readFile(paramsPath, 'utf-8');
    // Use podValueFromJSON as reviver to handle BigInts correctly during initial parse for specific known fields if necessary,
    // but ExampleParams expects strings for bigints, which JSON.parse does by default.
    // The conversion to BigInt happens inside generateGPCInputs where GPCProofInputs types are constructed.
    parsedParams = JSON.parse(paramsContent) as ExampleParams;
    console.log("Successfully loaded and parsed parameters.");
  } catch (e:any) {
    console.error(`Error loading or parsing parameters file ${paramsPath}:`, e);
    process.exit(1);
  }

  try {
    // Generate the GPC inputs object (JSON-compatible structure)
    const gpcInputsObjectForJSON = generateGPCInputs(configData, parsedParams, skipContentIdCheckArg);

    // Ensure output directory exists
    const outputDir = path.dirname(gpcInputsPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Write the GPC inputs to the specified output file
    await fs.writeFile(gpcInputsPath, JSON.stringify(gpcInputsObjectForJSON, null, 2));
    console.log(`Successfully wrote GPC inputs to ${gpcInputsPath}`);
    console.log("--- GPC Proof Inputs Generation Finished ---");

  } catch (error:any) {
    console.error('Error during GPC inputs generation:', error);
    process.exit(1);
  }
}

if (require.main === module) {
    main().catch(error => {
        console.error("Unhandled error in main execution:", error);
        process.exit(1);
    });
} 