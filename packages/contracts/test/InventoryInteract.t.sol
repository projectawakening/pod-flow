// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { MudTest } from "@latticexyz/world/test/MudTest.t.sol";

import { World } from "@latticexyz/world/src/World.sol";
import { IBaseWorld } from "@latticexyz/world/src/codegen/interfaces/IBaseWorld.sol";
import { StoreSwitch } from "@latticexyz/store/src/StoreSwitch.sol";
import { System } from "@latticexyz/world/src/System.sol";
import { ResourceId, WorldResourceIdInstance, WorldResourceIdLib } from "@latticexyz/world/src/WorldResourceId.sol";
import { RESOURCE_NAMESPACE, RESOURCE_SYSTEM } from "@latticexyz/world/src/worldResourceTypes.sol";
import { ResourceIds } from "@latticexyz/store/src/codegen/tables/ResourceIds.sol";

import { StringSignalHash } from "../src/inherited/StringSignalHash.sol";

import { shipSystem } from "../src/namespaces/evefrontier/codegen/systems/ShipSystemLib.sol";
import { InventorySystem, inventorySystem } from "../src/namespaces/evefrontier/codegen/systems/InventorySystemLib.sol";
import { InventoryInteractSystem, inventoryInteractSystem } from "../src/namespaces/evefrontier/codegen/systems/InventoryInteractSystemLib.sol";

import { VerifyZKProofParams, MultiProofVerifyParams, DistanceAttestationParams } from "../src/namespaces/evefrontier/systems/types.sol";

import { MerkleLeafFieldMap } from "../src/namespaces/evefrontier/codegen/tables/MerkleLeafFieldMap.sol";

import { InventoryItemParams } from "../src/namespaces/evefrontier/systems/types.sol";

import { Inventory, InventoryItem } from "../src/namespaces/evefrontier/codegen/index.sol";

contract InventoryInteractTest is MudTest {
  IBaseWorld world;

  string constant mnemonic = "test test test test test test test test test test test junk";
  uint256 deployerPK = vm.deriveKey(mnemonic, 0);
  uint256 alicePK = vm.deriveKey(mnemonic, 1);
  address deployer = vm.addr(deployerPK);
  address alice = vm.addr(alicePK);

  // PUBLIC SIGNALS
  uint256[17] PUBLIC_SIGNAL_DATA = [
    0x00f68c08848efb5340044d878c98a195f3944a0ec95c60d8109195b92ecd760c,
    0x155e9820bc32e9fad28f49d15d111ec8a22e79e16c679df305c522df5d0903ac,
    0x20dee78803f9a6c8d41f7e06e62c8f7a81a50a3d076155e1b7ad5f7bf4927e1d,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x001147abe74cd4f5e6285cd834a31543f3fa83b91fa8c4aef85966297842e4ba,
    0x0000000000000000000000000000000000000000000000000000000000000001,
    0x0000000000000000000000000000000000000000000000000000000000000003,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000001,
    0x0000000000000000000000000000000000000000000000000000000000000002,
    0x0000000000000000000000000000000000000000000000000000000000000007,
    0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000
  ];

  // REVEALED MERKLE POD DATA
  bytes32 MERKLE_ROOT = 0xbbfd8f4be2ef4a341a91f0236318590a5230cac73938595a4979980b7a4c17f8;
  uint256 OBJECT_1_ID = uint256(0x546f601774410ed85e99e739fb228cbe);
  uint256 OBJECT_2_ID = uint256(0x2ef78d73724430637f80cc2448a49e4fe);
  string POD_DATA_TYPE = "evefrontier.distance_attestation";
  uint256 TIME_THRESHOLD = 10000;

  function setUp() public override {
    vm.pauseGasMetering();
    // DEPLOY AND REGISTER A MUD WORLD with store address
    worldAddress = vm.envAddress("WORLD_ADDRESS");
    world = IBaseWorld(worldAddress);
    StoreSwitch.setStoreAddress(worldAddress);
    vm.resumeGasMetering();
  }

  function test_CalculateMerkleRootSignal() public {
    vm.resumeGasMetering();
    bytes memory bytesData = world.call(
      inventoryInteractSystem.toResourceId(),
      abi.encodeCall(
        StringSignalHash.bytes32ToStringBytes,
        (MERKLE_ROOT)
      )
    );
    vm.pauseGasMetering();
    bytes memory merkleRootBytes = abi.decode(bytesData, (bytes));
    vm.resumeGasMetering();
    bytes memory data = world.call(
      inventoryInteractSystem.toResourceId(),
      abi.encodeCall(
        StringSignalHash.calculateStringSignal,
        (merkleRootBytes)
      )
    );
    vm.pauseGasMetering();
    uint256 merkleRootSignal = abi.decode(data, (uint256));
    assertEq(merkleRootSignal, PUBLIC_SIGNAL_DATA[0]);
  }

  function test_TransferToInventory() public {
    vm.pauseGasMetering();
    vm.warp(1746864451869 + 9000); // 9 seconds after the timestamp of the test data

    VerifyZKProofParams memory verifyZKProofParams = VerifyZKProofParams({
      pA: [
        0x122c96605723635a588af150a8b6889d841be228213272402a198cd7ca52550b,
        0x084af7fccd3ebd855445bdb03df7979da2fd67ebd5875f690b351ab10cd8b913
      ],
      pB:[
        [
          0x2ccc18584974e9541c0c6c312023f0d842ef2481672bcd2a830096a84e9eb1dc,
          0x089db4fe344eae105f39f65a3bfa10d80091f97857a92c3afe1da0a33c2ad56c
        ],
        [
          0x15360b98992800ae6c41da9af311e193c706d9b2abcb4da0c4499f4b2501c980,
          0x1562bf19babf76d2bc7dde6fd92bbc8bc3e40254e42fc653f4e64afdd64daa74
        ]
      ],
      pC: [
        0x1a0bed0a415d426a170b407d2758d400b933e4b52c3be9e3f870d5aab6abad2c,
        0x270a1ef93f7b0e3f572b28355f4aebbd415a6f44f96d819a98476eca3283af59
      ],
      pubSignals: PUBLIC_SIGNAL_DATA
    });

    // leaves order
    // object2, timeThreshold, object1, distanceSquaredMeters, timestamp
    bytes32[] memory LEAF_FIELD_MAP = new bytes32[](5);
    LEAF_FIELD_MAP[0] = keccak256(abi.encode("object2Id"));
    LEAF_FIELD_MAP[1] = keccak256(abi.encode("timeThreshold"));
    LEAF_FIELD_MAP[2] = keccak256(abi.encode("object1Id"));
    LEAF_FIELD_MAP[3] = keccak256(abi.encode("distanceSquaredMeters"));
    LEAF_FIELD_MAP[4] = keccak256(abi.encode("timestamp"));

    bytes32[] memory PROOF_DATA = new bytes32[](3);
    PROOF_DATA[0] = 0x4c5f7cc86b0cc4794b1cedf5d27df0e3beff49a1dd4380ad8a469883c2f2dae6;
    PROOF_DATA[1] = 0xb86237a88270ca7cefc339ffe8ee10b30e1fcc4cccc27e51352501c987e58c04;
    PROOF_DATA[2] = 0xcffbd76fa23041cc54a5eda79e656581872b7832678bdeda972c4aea80689d06;
    
    bool[] memory PROOF_FLAGS = new bool[](7);
    PROOF_FLAGS[0] = true;
    PROOF_FLAGS[1] = false;
    PROOF_FLAGS[2] = false;
    PROOF_FLAGS[3] = false;
    PROOF_FLAGS[4] = true;
    PROOF_FLAGS[5] = true;
    PROOF_FLAGS[6] = true;

    bytes32[] memory LEAVES = new bytes32[](5);
    LEAVES[0] = 0x0659b6ad42c9c0a18950da98a2cdc010b540dd4b1e8d337db8b6154bfbd44152;
    LEAVES[1] = 0x144beecbf503c6f2207161c13abc11c462b39aae68cd342793df8fd5d26c345f;
    LEAVES[2] = 0x3127964f7efed1d01608b4b70102d3ed10ee7efccba12b524eba559c7ba87af5;
    LEAVES[3] = 0x768cc9699289db86e768e025187f1934baf6e7b26b0fa22ee9917fda02c58d78;
    LEAVES[4] = 0xe5ba43f6a5a0f3319480203d6fbbeea4959c63ada5e19ef3185ebcc8a084fcb9;

    MultiProofVerifyParams memory multiProofVerifyParams = MultiProofVerifyParams({
      proof: PROOF_DATA,
      proofFlags: PROOF_FLAGS,
      leaves: LEAVES,
      root: MERKLE_ROOT,
      leafFieldMap: LEAF_FIELD_MAP
    });

    DistanceAttestationParams memory distanceAttestationParams = DistanceAttestationParams({
      object1Id: OBJECT_1_ID,
      object2Id: OBJECT_2_ID,
      distanceSquaredMeters: 4,
      timestamp: 1746864451869,
      timeThreshold: 10000
    });

    InventoryItemParams[] memory inventoryItemParams = new InventoryItemParams[](1);
    inventoryItemParams[0] = InventoryItemParams({
        smartObjectId: 123,
        quantity: 1
      });
    
    vm.startPrank(deployer);
    // set Ship interaction threshold data for object 1
    shipSystem.setInteractionDistance(OBJECT_1_ID, 12);
    // set Ship interaction threshold data for object 2
    shipSystem.setInteractionDistance(OBJECT_2_ID, 9);

    // put an item in object 1's inventory to transfer
    world.call(
      inventorySystem.toResourceId(),
      abi.encodeCall(
        InventorySystem.depositInventory,
        (OBJECT_1_ID, inventoryItemParams)
      )
    );

    uint256[] memory inventoryItemIds = Inventory.get(OBJECT_1_ID);
    assertEq(inventoryItemIds[0], 123);

    uint256 storedQuantity = InventoryItem.getQuantity(OBJECT_1_ID, 123);
    assertEq(storedQuantity, 1);

    vm.resumeGasMetering();
    // transfer the item to object 2
    world.call(
      inventoryInteractSystem.toResourceId(),
      abi.encodeCall(
        InventoryInteractSystem.transferToInventory,
        (OBJECT_1_ID, OBJECT_2_ID, inventoryItemParams, verifyZKProofParams, multiProofVerifyParams, distanceAttestationParams)
      )
    );
    vm.pauseGasMetering();
    vm.stopPrank();
  }
}