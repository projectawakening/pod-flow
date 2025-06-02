// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20;
import { System } from "@latticexyz/world/src/System.sol";

import { InventoryItemParams, FullVerifyZKProofParams, DistanceAttestationParams } from "./types.sol";

import { merkleProofSystem } from "../codegen/systems/MerkleProofSystemLib.sol";
import { allFieldGroth16VerifierSystem } from "../codegen/systems/AllFieldGroth16VerifierSystemLib.sol";

import { StringSignalHash2 } from "../../../inherited/StringSignalHash2.sol";
import { Poseidon } from "../../../inherited/Poseidon.sol";
import { MerkleLeafFieldMap, Ship, VerifiedPOD } from "../codegen/index.sol";

contract PoseidonAttestationSystem is StringSignalHash2, Poseidon, System {

  uint256 constant ZK_SIGNER = 14867849173422818647871626617516355712878569262450682889788639949183840845341; // uint256 representation of poseidon hash of signerPublickey, TODO: should be configurable and imported here from a stored table data source
  string constant POD_DATA_TYPE = "evefrontier.distance_attestation";
  uint256 constant TIME_DELTA = 30000; // 30 seconds, TODO:should be tuned for our system later, shorter times increase chance of failure, longer times are less "real-time" accurate

  error PoseidonAttestation_ZKProofInvalid();
  error PoseidonAttestation_ZKSignerInvalid();
  error PoseidonAttestation_DistanceSquaredMetersInvalid();
  error PoseidonAttestation_PodDataTypeInvalid();
  error PoseidonAttestation_StaleTimestamp();

  function poseidonAttestation(uint256 smartObjectId, uint256 toObjectId, FullVerifyZKProofParams calldata verifyZKProofParams, DistanceAttestationParams calldata distanceAttestationParams) public {
      // check ZK full proof validity
      if(!allFieldGroth16VerifierSystem.verifyProof(verifyZKProofParams)) {
        revert PoseidonAttestation_ZKProofInvalid();
      }

      // check ZK signer address is valid
      if(verifyZKProofParams.pubSignals[9] != ZK_SIGNER) {
        revert PoseidonAttestation_ZKSignerInvalid();
      }

      // check ZK inclusion of all fields in the distanceAttestationParams for our ZK proof
      // distanceSquaredMeters: { isRevealed: true }
      // object1Location: { isRevealed: true }
      // object2Location: { isRevealed: true }
      // objectId1: { isRevealed: true }
      // objectId2: { isRevealed: true }
      // pod_data_type: { isRevealed: true }
      // timestamp: { isRevealed: true }
      // timeThreshold: { isRevealed: true }
      uint256[1] memory input;
      // check distanceSquaredMeters is not stale
      input[0] = distanceAttestationParams.distanceSquaredMeters;
      if(verifyZKProofParams.pubSignals[0] != hash(input)) {
        revert PoseidonAttestation_DistanceSquaredMetersInvalid();
      }

      // // check pod_data_type is correct
      // bytes memory pod_data_type = bytes(POD_DATA_TYPE);

      // if(verifyZKProofParams.pubSignals[5] != calculateStringSignal2(pod_data_type)) {
      //   revert PoseidonAttestation_PodDataTypeInvalid();
      // }

      // // check if timestamp is not stale
      // // - compare (block.timestamp - distanceAttestation.timestamp + distanceAttestation.timeThreshold) with TIME_DELTA
      // if(
      //   block.timestamp < distanceAttestationParams.timestamp ||
      //   distanceAttestationParams.timestamp < distanceAttestationParams.timeThreshold ||
      //   block.timestamp - (distanceAttestationParams.timestamp - distanceAttestationParams.timeThreshold) > TIME_DELTA
      // ) {
      //   revert DistanceCheck_StaleTimestamp();
      // }

      // // check distance value is within our interaction thresholds for known on-chain objects
      // // - compare distanceAttestationParams.distanceSquaredMeters with Ship.getInteractionDistance(smartObjectId)
      // uint256 smartObjectInteractionDistance = Ship.getInteractionDistance(smartObjectId);
      // if(distanceAttestationParams.distanceSquaredMeters > smartObjectInteractionDistance) {
      //   revert DistanceCheck_DistanceValueNotWithinObject1Threshold();
      // }
      // // - compare distanceAttestationParams.distanceSquaredMeters with Ship.getInteractionDistance(toObjectId)
      // uint256 toObjectInteractionDistance = Ship.getInteractionDistance(toObjectId);
      // if(distanceAttestationParams.distanceSquaredMeters > toObjectInteractionDistance) {
      //   revert DistanceCheck_DistanceValueNotWithinObject2Threshold();
      // }

      // VerifiedPOD.set(verifyZKProofParams.pubSignals[1], multiProofVerifyParams.root, ZK_SIGNER, POD_DATA_TYPE);

  }
}