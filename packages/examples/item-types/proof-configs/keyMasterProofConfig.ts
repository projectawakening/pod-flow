// NOTE: The import for GPC types needs to be fixed based on your project structure.
import { GPCProofConfig } from "@pcd/gpc";
import { PODValue } from "@pcd/pod";

// Constants/Checks are now directly within the entry config

// Define POD integer range constants (as defined in @pcd/pod)
const POD_INT_MIN = -(1n << 63n);
const POD_INT_MAX = (1n << 63n) - 1n;

// Define the set of valid key Type IDs
const validKeyIds: PODValue[] = [
  { type: 'int', value: 73193n },
  { type: 'int', value: 83580n },
  { type: 'int', value: 83581n },
];

// Define the GPC Proof Configuration for Key Master Verification
export const keyMasterProofConfig: GPCProofConfig = {
  // Define the PODs included in the proof
  pods: {
    // 1. Key Item POD (typeId: 73193)
    keyItem1: {
      entries: {
        typeId: { isRevealed: true },
        pod_data_type: { isRevealed: true },
        name: { isRevealed: true },
        description: { isRevealed: true },
        smartItemId: { isRevealed: true },
        timestamp: { isRevealed: true },
        attr_categoryID: { isRevealed: true },
        attr_categoryName: { isRevealed: true },
        attr_groupID: { isRevealed: true },
        attr_groupName: { isRevealed: true },
        attr_icon: { isRevealed: true },
        attr_mass: { isRevealed: true },
        attr_portionSize: { isRevealed: true },
        attr_radius: { isRevealed: true },
        attr_volume: { isRevealed: true },
      }
    },
    // 2. Key Item POD (typeId: 83580)
    keyItem2: {
      entries: {
        typeId: { isRevealed: true },
        pod_data_type: { isRevealed: true },
        name: { isRevealed: true },
        description: { isRevealed: true },
        smartItemId: { isRevealed: true },
        timestamp: { isRevealed: true },
        attr_categoryID: { isRevealed: true },
        attr_categoryName: { isRevealed: true },
        attr_groupID: { isRevealed: true },
        attr_groupName: { isRevealed: true },
        attr_icon: { isRevealed: true },
        attr_mass: { isRevealed: true },
        attr_portionSize: { isRevealed: true },
        attr_radius: { isRevealed: true },
        attr_volume: { isRevealed: true },
      }
    },
    // 3. Key Item POD (typeId: 83581)
    keyItem3: {
      entries: {
        typeId: { isRevealed: true },
        pod_data_type: { isRevealed: true },
        name: { isRevealed: true },
        description: { isRevealed: true },
        smartItemId: { isRevealed: true },
        timestamp: { isRevealed: true },
        attr_categoryID: { isRevealed: true },
        attr_categoryName: { isRevealed: true },
        attr_groupID: { isRevealed: true },
        attr_groupName: { isRevealed: true },
        attr_icon: { isRevealed: true },
        attr_mass: { isRevealed: true },
        attr_portionSize: { isRevealed: true },
        attr_radius: { isRevealed: true },
        attr_volume: { isRevealed: true },
      }
    },
    // 4. Inventory Verification POD
    inventory: {
      entries: {
        shipId: { isRevealed: true },
        timestamp: { isRevealed: true },
        pod_data_type: { isRevealed: true },
        itemTypeId: {
          isRevealed: false,
          // Constraint: The itemTypeId must be one of the values in the 'validKeyIds' list
          isMemberOf: "validKeyIds"
        },
        keyItemIds: { isRevealed: false },
        quantity: {
           isRevealed: false,
           // Add constraint: quantity must be >= 1
           inRange: { min: 1n, max: POD_INT_MAX } 
        },
      }
    }
  }
};