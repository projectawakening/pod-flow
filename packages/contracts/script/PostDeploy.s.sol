// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { StoreSwitch } from "@latticexyz/store/src/StoreSwitch.sol";

import { IWorld } from "../src/codegen/world/IWorld.sol";

import { MerkleLeafFieldMap } from "../src/namespaces/evefrontier/codegen/tables/MerkleLeafFieldMap.sol";


contract PostDeploy is Script {
  function run(address worldAddress) external {
    // Specify a store so that you can use tables directly in PostDeploy
    StoreSwitch.setStoreAddress(worldAddress);

    // Load the private key from the `PRIVATE_KEY` environment variable (in .env)
    uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

    // Start broadcasting transactions from the deployer account
    vm.startBroadcast(deployerPrivateKey);
    // pre-define our data attestation POD merkle leaf field map
    // podTypeId is the keccak256 hash of the string "pod_data_type" concatenated with the keccak256 hash of the string "evefrontier.distance_attestation"
    bytes32 podTypeId = keccak256(abi.encode("evefrontier.distance_attestation"));
    
    // uint256 object1Id;
    bytes32 object1Id = keccak256(abi.encode("object1Id"));
    // uint256 object2Id;
    bytes32 object2Id = keccak256(abi.encode("object2Id"));
    // uint256 distanceSquaredMeters;
    bytes32 distanceSquaredMeters = keccak256(abi.encode("distanceSquaredMeters"));
    // uint256 timestamp;
    bytes32 timestamp = keccak256(abi.encode("timestamp"));
    // uint256 timeThreshold;
    bytes32 timeThreshold = keccak256(abi.encode("timeThreshold"));

    // set DistanceAttestationParams
    MerkleLeafFieldMap.set(podTypeId, podTypeId, "pod_data_type");
    MerkleLeafFieldMap.set(podTypeId, object1Id, "object1Id");
    MerkleLeafFieldMap.set(podTypeId, object2Id, "object2Id");
    MerkleLeafFieldMap.set(podTypeId, timeThreshold, "timeThreshold");
    MerkleLeafFieldMap.set(podTypeId, distanceSquaredMeters, "distanceSquaredMeters");
    MerkleLeafFieldMap.set(podTypeId, timestamp, "timestamp");

    vm.stopBroadcast();
  }
}
