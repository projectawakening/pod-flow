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


import { PoseidonAttestationSystem, poseidonAttestationSystem } from "../src/namespaces/evefrontier/codegen/systems/PoseidonAttestationSystemLib.sol";

import { FullVerifyZKProofParams, DistanceAttestationParams } from "../src/namespaces/evefrontier/systems/types.sol";

contract PoseidonAttestationTest is MudTest {
  IBaseWorld world;

  string constant mnemonic = "test test test test test test test test test test test junk";
  uint256 deployerPK = vm.deriveKey(mnemonic, 0);
  uint256 alicePK = vm.deriveKey(mnemonic, 1);
  address deployer = vm.addr(deployerPK);
  address alice = vm.addr(alicePK);

  // PUBLIC SIGNALS
  uint256[45] PUBLIC_SIGNAL_DATA = [
    0x15e36f4ff92e2211fa8ed9f7af707f6c8c0f1442252a85150d2b8d2038890dfc,
    0x0085b10c16090e245839cd62ddf39abb18fedb6141c9a00ae0cc823f689df928,
    0x00f06e5f48459f0ed45ae0093e93b76bc14781e8efcf521fb808bd581712791b,
    0x1bd484d0ddafa314daacef35f3b54bcbd10c2cbdede1d183a70b8ad61fff59d8,
    0x26ae0d95fffc3d5b7055fb751e383c3d0d1878b001e2e28bed94f22755973ffb,
    0x007efce52d66f58a699cf1da6655af70b9d86770cb7f96de2c43ab34e4ec0007,
    0x1d9b59378bd766a09329cdd364d505f34db4d2669b047ffaf1050e65bfb03d64,
    0x0083eeff4fa9a0114ce912fdac3fabe1991238992ea11dca0a8e71052874326b,
    0x20f39634e3382cb1ab42ffa2034ecc86e95a7b82ec2fc59ae23d965ae91f6114,
    0x20dee78803f9a6c8d41f7e06e62c8f7a81a50a3d076155e1b7ad5f7bf4927e1d,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x00deda400e9d3c895dacfefafb4432e2fc9aca0d9d195c1009efb4339c35f33b,
    0x00d476d3bd84e456da703b8e10b08c0bef20de521d2db6c47b9da29aebcda0ee,
    0x003eaa6d394c2b5e62f906de4c4782a87d1137a2630ca18f35414251ec78b50e,
    0x007f40bc2814f5297818461f889780a870ea033fe64c5a261117f2b662515a3d,
    0x0053d37dfc71d2a0b20b5a66dbadc5fbfc004ebac03279e2bf8697d8f55893aa,
    0x00509fe8385cd03d6eb74343babd97658a5456e8cd4602920be76c952d1242e6,
    0x00be63e5babf2b9197cccad3efaedc3e9e510bca409cd20aaedd41d477064f08,
    0x00323748f86a762247e6631bc01c26fb22c63fd0176a2e1db7b0d5b78de228cd,
    0x00000000000000000000000000000000000000000000000000000000000000ff,
    0x0000000000000000000000000000000000000000000000000000000000000003,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000001,
    0x0000000000000000000000000000000000000000000000000000000000000002,
    0x0000000000000000000000000000000000000000000000000000000000000003,
    0x0000000000000000000000000000000000000000000000000000000000000004,
    0x0000000000000000000000000000000000000000000000000000000000000005,
    0x0000000000000000000000000000000000000000000000000000000000000006,
    0x0000000000000000000000000000000000000000000000000000000000000007,
    0x0000000000000000000000000000000000000000000000000000000000000008,
    0x0000000000000000000000000000000000000000000000000000000000000009,
    0x00000000000000000000000000000000000000000000000000000000000003ff,
    0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000000000000000000000000000,
    0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000
  ];

  // REVEALED MERKLE POD DATA
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

  function test_PoseidonAttestation() public {
    vm.pauseGasMetering();

    vm.warp(1748594228958 + 9000); // 9 seconds after the timestamp of the test data

    FullVerifyZKProofParams memory verifyZKProofParams = FullVerifyZKProofParams({
      pA: [
        0x045531fb5626916d5186eff1ad30ef8e132abfbe5143c08608ca2365fe587c10,
        0x18ef127eb28607d332cef0276a221f39591ad93349058f74d33457c8fa3af13e
      ],
      pB: [
        [
          0x125d67fc1ab5318283009c09e50ee14e29b4457000d773e8a0d99d55456e9370,
          0x10fc9d9bd1b3b1e9dcf515fc1d9225944f108c4eab02e62c0649e0df34a630f5
        ],
        [
          0x2f185b889fe7f1d7b8842240ea9a2d50e3dc82d859488fff7b8539fcf389136d,
          0x2eb12d818c79806787f768174d742f0cdb0ac6ef97170acede4b22bafc0e0c34
        ]
      ],
      pC: [
        0x198612a742100b64b3e636512eac164f32e1536123a5de015573e01901ce42d0,
        0x2fba5d3cece93f955723b255e18b5ed475bbc32b3f3decc847a87e4e3f7adc14
      ],
      pubSignals: PUBLIC_SIGNAL_DATA
    });

    DistanceAttestationParams memory distanceAttestationParams = DistanceAttestationParams({
      object1Id: OBJECT_1_ID,
      object2Id: OBJECT_2_ID,
      distanceSquaredMeters: 4,
      timestamp: 1746864451869,
      timeThreshold: 10000
    });

    vm.resumeGasMetering();

    bytes memory bytesData = world.call(
      poseidonAttestationSystem.toResourceId(),
      abi.encodeCall(
        PoseidonAttestationSystem.poseidonAttestation,
        (OBJECT_1_ID, OBJECT_2_ID, verifyZKProofParams, distanceAttestationParams)
      )
    );
    
    vm.pauseGasMetering();
  }
}