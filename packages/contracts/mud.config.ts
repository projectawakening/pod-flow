import { defineWorld } from "@latticexyz/world";

export default defineWorld({
  codegen: {
    generateSystemLibraries: true,
  },
  namespaces: {
    evefrontier: {
      tables: {
        VerifiedPOD: {
          schema: {
            contentId: "uint256",
            merkleRoot: "bytes32",
            signerPublicKey: "uint256",
            podType: "string",
          },
          key: ["contentId"],
        },
        MerkleLeafFieldMap: {
          schema: {
            podTypeId: "bytes32",
            fieldId: "bytes32",
            field: "string",
          },
          key: ["podTypeId", "fieldId"],
        },
        Ship: {
          schema: {
            smartObjectId: "uint256",
            interactionDistance: "uint256",
          },
          key: ["smartObjectId"],
        },
        Inventory: {
          schema: {
            smartObjectId: "uint256",
            items: "uint256[]",
          },
          key: ["smartObjectId"],
        },
        InventoryItem: {
          schema: {
            smartObjectId: "uint256",
            itemObjectId: "uint256",
            exists: "bool",
            quantity: "uint256",
            index: "uint256",
          },
          key: ["smartObjectId", "itemObjectId"],
        },
      },
    },
  },
});
