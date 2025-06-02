import { GPCProofConfig, GPCProofEntryConfig } from "@pcd/gpc";
import { PODName } from "@pcd/pod";

// Common structure for core entries
const coreEntryConfig: Record<PODName, GPCProofEntryConfig> = {
  keccak256_merkle_root: { isRevealed: true }, // Keccak256 hash of the FULL POD data (excluding the merkle root field itself)
};

// GPC Proof Configuration for Core POD (Single POD)
export const coreProofConfig: GPCProofConfig = {
  pods: {
    // 'pod' is a generic name for the single POD being attested.
    // The actual mapping to a specific POD instance will be done via 
    // podConfigMapping in the params.json file (e.g., mapping 'pod' to the contentID of the location POD)
    pod: { 
      contentID: {
        isRevealed: true // contentID (posiedon2 root hash) of the POD itself
      },
      signerPublicKey: { // Added: Reveal the signer's public key metadata
        isRevealed: true
      },
      entries: coreEntryConfig
    }
  }
  // No uniquePODs constraint by default for this general config.
  // No tuples defined by default for this general config.
};