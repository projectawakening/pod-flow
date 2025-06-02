// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20;

struct InventoryItemParams {
  uint256 smartObjectId;
  uint256 quantity;
}

struct VerifyParams {
  bytes32[] proof;
  bytes32 root;
  bytes32 leaf;
  bytes32 leafField;
}

struct MultiProofVerifyParams {
  bytes32[] proof;
  bool[] proofFlags;
  bytes32 root;
  bytes32[] leaves;
  bytes32[] leafFieldMap;
}

struct VerifyZKProofParams {
  uint256[2] pA;
  uint256[2][2]  pB;
  uint256[2] pC;
  uint256[17] pubSignals;
}

struct FullVerifyZKProofParams {
  uint256[2] pA;
  uint256[2][2]  pB;
  uint256[2] pC;
  uint256[45] pubSignals;
}

struct DistanceAttestationParams {
  uint256 object1Id;
  uint256 object2Id;
  uint256 distanceSquaredMeters;
  uint256 timestamp;
  uint256 timeThreshold;
}