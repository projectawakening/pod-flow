import { GPCProofConfig, SEMAPHORE_V4, GPCProofEntryConfig } from "@pcd/gpc";
import { PODName } from "@pcd/pod";

// Define POD integer range constants (as defined in @pcd/pod)
const POD_INT_MIN = -(1n << 63n);
const POD_INT_MAX = (1n << 63n) - 1n;

// Common structure for location attestation entries
const locationAttestationEntryConfig: Record<PODName, GPCProofEntryConfig> = {
  keccak256_merkle_root: { isRevealed: false }, // keccak256 hash of the merkle root
  issuer: { 
    isRevealed: true,
    isOwnerID: SEMAPHORE_V4
  }
};

// GPC Proof Configuration for Location Attestation (Single POD)
export const fullLocationProofConfig: GPCProofConfig = {
  pods: {
    location: { // Single POD configuration key
      contentID: {
        isRevealed: true // contentID of the POD itself is revealed
      },
      entries: locationAttestationEntryConfig
    }
  }
};
