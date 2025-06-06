// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

/* Autogenerated file. Do not edit manually. */

import { InventoryItemParams, VerifyZKProofParams, MultiProofVerifyParams, DistanceAttestationParams } from "../../namespaces/evefrontier/systems/types.sol";

/**
 * @title IInventoryInteractSystem
 * @author MUD (https://mud.dev) by Lattice (https://lattice.xyz)
 * @dev This interface is automatically generated from the corresponding system contract. Do not edit manually.
 */
interface IInventoryInteractSystem {
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

  function evefrontier__transferToInventory(
    uint256 smartObjectId,
    uint256 toObjectId,
    InventoryItemParams[] calldata items,
    VerifyZKProofParams calldata verifyZKProofParams,
    MultiProofVerifyParams calldata multiProofVerifyParams,
    DistanceAttestationParams calldata distanceAttestationParams
  ) external;
}
