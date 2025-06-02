// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20;
import { System } from "@latticexyz/world/src/System.sol";

import { InventoryItemParams, MultiProofVerifyParams, VerifyZKProofParams, DistanceAttestationParams } from "./types.sol";

import { merkleProofSystem } from "../codegen/systems/MerkleProofSystemLib.sol";
import { groth16VerifierCoreSystem } from "../codegen/systems/Groth16VerifierCoreSystemLib.sol";
import { inventorySystem } from "../codegen/systems/InventorySystemLib.sol";

import { StringSignalHash } from "../../../inherited/StringSignalHash.sol";

import { MerkleLeafFieldMap, Ship, VerifiedPOD } from "../codegen/index.sol";

contract InventoryInteractSystem is StringSignalHash, System {

  error DistanceCheck_ZKProofInvalid();
  error DistanceCheck_ZKSignerInvalid();
  error DistanceCheck_MerkleRootSignalInvalid();
  error DistanceCheck_MerkleProofVerifyFail();
  error DistanceCheck_MerkleLeafFieldMapLengthInvalid();
  error DistanceCheck_DistanceValueInvalid();
  error DistanceCheck_Object1IdValueInvalid();
  error DistanceCheck_Object2IdValueInvalid();
  error DistanceCheck_PodTypeValueInvalid();
  error DistanceCheck_TimestampValueInvalid();
  error DistanceCheck_TimeThresholdValueInvalid();
  error DistanceCheck_StaleTimestamp();
  error DistanceCheck_DistanceValueNotWithinObject1Threshold();
  error DistanceCheck_DistanceValueNotWithinObject2Threshold();
  
  uint256 constant ZK_SIGNER = 14867849173422818647871626617516355712878569262450682889788639949183840845341; // uint256 representation of poseidon hash of signerPublickey, TODO: should be configurable and imported here from a stored table data source
  string constant POD_DATA_TYPE = "evefrontier.distance_attestation";
  uint256 constant TIME_DELTA = 30000; // 30 seconds, TODO:should be tuned for our system later, shorter times increase chance of failure, longer times are less "real-time" accurate

  modifier distanceCheck(uint256 smartObjectId, uint256 toObjectId, VerifyZKProofParams calldata verifyZKProofParams, MultiProofVerifyParams calldata multiProofVerifyParams, DistanceAttestationParams calldata distanceAttestationParams) {
    {
      // check ZK distance proof validity
      if(!groth16VerifierCoreSystem.verifyProof(verifyZKProofParams)) {
        revert DistanceCheck_ZKProofInvalid();
      }

      // check ZK signer address is valid
      if(verifyZKProofParams.pubSignals[2] != ZK_SIGNER) {
        revert DistanceCheck_ZKSignerInvalid();
      }
      // now we know that a merkle proof root has been committed to in a ZK proof by the authorized signer

      // check ZK merkle root commitment matches our merkle proof data
      uint256 calculatedMerkleSignal = calculateStringSignal(bytes32ToStringBytes(multiProofVerifyParams.root));
 
      if(verifyZKProofParams.pubSignals[0] != calculatedMerkleSignal) {
        revert DistanceCheck_MerkleRootSignalInvalid();
      }

      // check merkle inclusion of IDs, distance value, pod_type, and timestamp for our ZK proof
      // - verify Merkle proof data
      if(!merkleProofSystem.multiProofVerify(multiProofVerifyParams)) {
        revert DistanceCheck_MerkleProofVerifyFail();
      }
      
      // ensure the length of the leaves and leafFieldMap(s) are the same
      if(multiProofVerifyParams.leaves.length != multiProofVerifyParams.leafFieldMap.length) {
        revert DistanceCheck_MerkleLeafFieldMapLengthInvalid();
      }

      // we are checking against the "evefrontier.distance_attestation" pod_data_type
      bytes32 podTypeId = keccak256(abi.encode(POD_DATA_TYPE));

      // parse leaf data from multiProofVerifyParams, and compare to our public variable values in distanceAttestationParams
      for(uint256 i = 0; i < multiProofVerifyParams.leaves.length; i++) {
        bytes32 fieldId = multiProofVerifyParams.leafFieldMap[i];
        string memory field = MerkleLeafFieldMap.getField(podTypeId, fieldId);
        uint256 fieldValue;

        // populate fieldValue with the correct value for the given field (use contract provided values where applicable)
        if(keccak256(abi.encode(field)) == keccak256("distanceSquaredMeters")) {
          fieldValue = distanceAttestationParams.distanceSquaredMeters;
        } else if(keccak256(abi.encode(field)) == keccak256("object1Id")) {
          fieldValue = smartObjectId;
        } else if(keccak256(abi.encode(field)) == keccak256("object2Id")) {
          fieldValue = toObjectId;
        } else if(keccak256(abi.encode(field)) == keccak256("timestamp")) {
          fieldValue = distanceAttestationParams.timestamp;
        } else if(keccak256(abi.encode(field)) == keccak256("timeThreshold")) {
          fieldValue = distanceAttestationParams.timeThreshold;
        }
        
        // calculate the hash of the field and fieldValue, compare to the leaf data
        bytes32 fieldHash;
        if(keccak256(abi.encode(field)) == keccak256("pod_data_type")) { // handle the "pod_data_type" field separately, as it is a string and not a uint256
          bytes memory encodedValue = abi.encode(POD_DATA_TYPE);
          fieldHash = keccak256(abi.encodePacked(
              abi.encode(field),
              encodedValue
          ));
        } else {
          bytes memory encodedValue = abi.encode(fieldValue);
          fieldHash = keccak256(abi.encodePacked(
              abi.encode(field),
              encodedValue
          ));
        }

        if(multiProofVerifyParams.leaves[i] != fieldHash) {
          if(keccak256(abi.encode(field)) == keccak256("distanceSquaredMeters")) {
            revert DistanceCheck_DistanceValueInvalid();
          } else if(keccak256(abi.encode(field)) == keccak256("object1Id")) {
            revert DistanceCheck_Object1IdValueInvalid();
          } else if(keccak256(abi.encode(field)) == keccak256("object2Id")) {
            revert DistanceCheck_Object2IdValueInvalid();
          } else if(keccak256(abi.encode(field)) == keccak256("pod_data_type")) {
            revert DistanceCheck_PodTypeValueInvalid();
          } else if(keccak256(abi.encode(field)) == keccak256("timestamp")) {
            revert DistanceCheck_TimestampValueInvalid();
          } else if(keccak256(abi.encode(field)) == keccak256("timeThreshold")) {
            revert DistanceCheck_TimeThresholdValueInvalid();
          }
        }
      }
      // now we know the data structure and values we are using are correctly included in the merkle proof
      // this fact, together with confirmation of the merkle root commitment in the ZK proof, confirms the data is can be trusted and safely used within our contract logic

      // check if timestamp is not stale
      // - compare (block.timestamp - distanceAttestation.timestamp + distanceAttestation.timeThreshold) with TIME_DELTA
      if(
        block.timestamp < distanceAttestationParams.timestamp ||
        distanceAttestationParams.timestamp < distanceAttestationParams.timeThreshold ||
        block.timestamp - (distanceAttestationParams.timestamp - distanceAttestationParams.timeThreshold) > TIME_DELTA
      ) {
        revert DistanceCheck_StaleTimestamp();
      }

      // check distance value is within our interaction thresholds for known on-chain objects
      // - compare distanceAttestationParams.distanceSquaredMeters with Ship.getInteractionDistance(smartObjectId)
      uint256 smartObjectInteractionDistance = Ship.getInteractionDistance(smartObjectId);
      if(distanceAttestationParams.distanceSquaredMeters > smartObjectInteractionDistance) {
        revert DistanceCheck_DistanceValueNotWithinObject1Threshold();
      }
      // - compare distanceAttestationParams.distanceSquaredMeters with Ship.getInteractionDistance(toObjectId)
      uint256 toObjectInteractionDistance = Ship.getInteractionDistance(toObjectId);
      if(distanceAttestationParams.distanceSquaredMeters > toObjectInteractionDistance) {
        revert DistanceCheck_DistanceValueNotWithinObject2Threshold();
      }

      VerifiedPOD.set(verifyZKProofParams.pubSignals[1], multiProofVerifyParams.root, ZK_SIGNER, POD_DATA_TYPE);
    }
    _;
  }

  /**
   * @notice Transfer items to another primary inventory
   * @param smartObjectId is the associated smart object id of the inventory to transfer from
   * @param toObjectId is the associated smart object id of the inventory to transfer to
   * @param items is the array of items to transfer
   */
  function transferToInventory(
    uint256 smartObjectId,
    uint256 toObjectId,
    InventoryItemParams[] calldata items,
    VerifyZKProofParams calldata verifyZKProofParams,
    MultiProofVerifyParams calldata multiProofVerifyParams,
    DistanceAttestationParams calldata distanceAttestationParams
  ) public distanceCheck(smartObjectId, toObjectId, verifyZKProofParams, multiProofVerifyParams, distanceAttestationParams) {
    // withdraw the items from the designated inventory
    inventorySystem.withdrawInventory(smartObjectId, items);
    // deposit the items to the designated inventory
    inventorySystem.depositInventory(toObjectId, items);
  }
}