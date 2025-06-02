// NOTE: The import for GPC types needs to be fixed based on your project structure.
import { GPCProofConfig, SEMAPHORE_V4, GPCProofEntryConfig } from "@pcd/gpc";
import { PODName } from "@pcd/pod";

// Define POD integer range constants (as defined in @pcd/pod)
const POD_INT_MIN = -(1n << 63n);
const POD_INT_MAX = (1n << 63n) - 1n;

// Common structure for distance attestation entries
const distanceAttestationEntryConfig: Record<PODName, GPCProofEntryConfig> = {
  objectId1: { isRevealed: true },
  objectId2: { isRevealed: true },
  object1Location: { isRevealed: true },
  object2Location: { isRevealed: true },
  distanceSquaredMeters: { isRevealed: true },
  timeThreshold: { isRevealed: true },
  timestamp: { isRevealed: true },
  pod_data_type: { isRevealed: true },  
};

// GPC Proof Configuration for Distance Attestation
export const distanceProofConfig: GPCProofConfig = {
  pods: {
    distance: {
      contentID: {
        isRevealed: true // contentID of the POD itself is revealed
      },
      entries: distanceAttestationEntryConfig
    }
  }
};




