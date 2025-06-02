import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { POD, JSONPOD, PODValue, JSONPODValue } from '@pcd/pod';

// Define the expected output structure, similar to ExampleParams in gen-proof-inputs.ts
interface OutputParams {
  pods: { [contentId: string]: JSONPOD };
  podConfigMapping: { [configKey: string]: string };
  membershipLists?: any; // Or a more specific type if known, e.g., Record<string, JSONPODValue[]>
  owner?: any;           // Or a specific owner type
  watermark?: JSONPODValue;
}

// GPCProofConfig types (can be simplified if only used for configKey)
interface ProofConfigEntry {
  isRevealed: boolean;
}
interface GPCProofConfigPod {
  contentID?: ProofConfigEntry; // We don't use this directly for output params structure
  entries: Record<string, ProofConfigEntry>; // We don't use this directly for output params structure
}
interface GPCProofConfigType {
  pods: Record<string, GPCProofConfigPod>;
}

// fieldNameMapping is no longer needed as we output the whole POD
// const fieldNameMapping: Record<string, string> = {
//   object1ID: 'objectId1',
//   object2ID: 'objectId2',
// };

async function main() {
  const program = new Command();
  program
    .requiredOption('--signed-pod-input-path <path>', 'Path to the signed POD JSON input file')
    .requiredOption('--proof-config-path <path>', 'Path to the proof configuration TS file (e.g., fullDistanceProofConfig.ts)')
    .requiredOption('--output-path <path>', 'Path to save the generated proof parameters JSON file')
    .parse(process.argv);

  const options = program.opts();
  const signedPodInputPath = options.signedPodInputPath;
  const proofConfigPathArg = options.proofConfigPath;
  const outputPath = options.outputPath;

  console.log(`Loading signed POD from: ${signedPodInputPath}`);
  const signedPodContent = fs.readFileSync(signedPodInputPath, 'utf-8');
  let podInstance: POD;
  try {
    const jsonPod: JSONPOD = JSON.parse(signedPodContent);
    podInstance = POD.fromJSON(jsonPod);
    console.log('Successfully loaded signed POD JSON into POD object.');
  } catch (e: any) {
    console.error(`Error loading signed POD JSON into POD object: ${e.message}`);
    console.error(`Please ensure ${signedPodInputPath} is a valid JSON representation of a POD (typically with a top-level 'entries' field).`);
    process.exit(1);
  }

  console.log(`Loading proof configuration from: ${proofConfigPathArg}`);
  const proofConfigModule = require(path.resolve(proofConfigPathArg));
  const actualProofConfig: GPCProofConfigType = proofConfigModule.distanceProofConfig || proofConfigModule.default;

  if (!actualProofConfig || !actualProofConfig.pods) {
    console.error('Proof configuration is invalid or not found in the specified file.');
    process.exit(1);
  }

  const actualContentID = podInstance.contentID.toString();
  const jsonPodRepresentation = podInstance.toJSON(); // Get the JSONPOD structure

  // Determine the primary config key (e.g., "distance")
  // This assumes the proof config's 'pods' object has one primary key for this single POD case.
  const primaryConfigKey = Object.keys(actualProofConfig.pods)[0];
  if (!primaryConfigKey) {
    console.error('Could not determine the primary configuration key from the proof config file.');
    process.exit(1);
  }
  console.log(`Using primary config key: "${primaryConfigKey}" for podConfigMapping.`);

  const outputParams: OutputParams = {
    pods: {
      [actualContentID]: jsonPodRepresentation
    },
    podConfigMapping: {
      [primaryConfigKey]: actualContentID
    },
    // Add empty/default values for other optional ExampleParams fields
    // gen-proof-inputs.ts might expect these, even if empty.
    membershipLists: {},
    owner: undefined,      // Explicitly undefined for optional fields
    watermark: undefined   // Explicitly undefined for optional fields
  };

  // The following logic for extracting individual fields is no longer needed here.
  // gen-proof-inputs.ts and subsequent GPC scripts will handle claim extraction
  // based on the full POD data and the GPCProofConfig.

  /*
  const podConfigKey = Object.keys(actualProofConfig.pods)[0];
  if (!podConfigKey) {
    console.error('No POD configuration found in the proof config pods section.');
    process.exit(1);
  }
  const podConfig = actualProofConfig.pods[podConfigKey];

  if (podConfig === undefined) {
    console.error(`ERROR: Configuration for POD key '${podConfigKey}' is undefined in the proof config.`);
    process.exit(1);
  }

  // Handle contentID: Get from POD instance if revealed in config
  if (podConfig.contentID?.isRevealed) {
    try {
      // outputParams.contentId = podInstance.contentID.toString(); // This was for a flat structure
      // console.log(`Successfully extracted contentID from POD object: ${outputParams.contentId}`);
    } catch (e: any) {
      console.error(`Error extracting contentID from POD object: ${e.message}`);
      process.exit(1);
    }
  }

  // Handle entries by extracting them from the podInstance.content
  for (const [configFieldName, entryConfig] of Object.entries(podConfig.entries)) {
    if (entryConfig.isRevealed) {
      const podJsonFieldName = fieldNameMapping[configFieldName] || configFieldName;
      const entryValue: PODValue | undefined = podInstance.content.getValue(podJsonFieldName);
      
      if (entryValue !== undefined) {
        if (typeof entryValue.value === 'bigint') {
          // outputParams[configFieldName] = entryValue.value.toString(); // This was for a flat structure
        } else if (entryValue.value instanceof Uint8Array) {
          // outputParams[configFieldName] = Buffer.from(entryValue.value).toString('hex'); 
        } else {
          // outputParams[configFieldName] = entryValue.value;
        }
      } else {
        console.warn(`Warning: Field '${podJsonFieldName}' (from config key '${configFieldName}') marked as revealed in config but not found in POD entries.`);
      }
    }
  }
  */

  console.log(`Writing generated proof parameters to: ${outputPath}`);
  fs.writeFileSync(outputPath, JSON.stringify(outputParams, null, 2));
  console.log('Proof parameters generated successfully.');
}

main().catch(error => {
  console.error('Error generating full proof parameters:');
  console.error(error);
  process.exit(1);
}); 